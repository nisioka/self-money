import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { pushRoutes } from '../push/push.routes.js';
import { otpRoutes, otpCallbacks } from './otp.routes.js';
import { JobService } from '../jobs/job.service.js';
import { PushSubscriptionService } from '../push/push-subscription.service.js';
import { PushNotificationService } from '../push/push-notification.service.js';
import { TotpService } from '../totp/totp.service.js';
import { EncryptionService } from '../security/encryption.service.js';

// Mock web-push so the OTP_REQUIRED notification flow can be observed
// without making real HTTP calls to the FCM/Mozilla push services.
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue({
      statusCode: 201,
      body: '',
      headers: {},
    }),
  },
}));

import webpush from 'web-push';

const VALID_BASE32_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('OTP Integration Tests', () => {
  const prisma = new PrismaClient();
  let app: FastifyInstance;

  beforeAll(async () => {
    await prisma.$connect();
    app = Fastify({ logger: false });
    await app.register(pushRoutes, { prisma });
    await app.register(otpRoutes, { prisma });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.job.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.autoRule.deleteMany();
    await prisma.category.deleteMany();
    await prisma.account.deleteMany();
    await prisma.pushSubscription.deleteMany();
    otpCallbacks.clear();
    vi.mocked(webpush.sendNotification).mockClear();
  });

  describe('Push Subscription → OTP_REQUIRED notification flow', () => {
    it('subscribes via API and delivers OTP_REQUIRED notification through web-push', async () => {
      // Step 1: Frontend subscribes via API.
      const subscribeRes = await app.inject({
        method: 'POST',
        url: '/api/push/subscribe',
        payload: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/integration-test',
          keys: {
            p256dh:
              'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
            auth: 'tBHItJI5svbpez7KI4CCXg',
          },
        },
      });
      expect(subscribeRes.statusCode).toBe(200);

      const statusRes = await app.inject({
        method: 'GET',
        url: '/api/push/status',
      });
      expect(statusRes.json()).toEqual({ subscribed: true });

      // Step 2: Backend sends an OTP_REQUIRED notification.
      const subscriptionService = new PushSubscriptionService(prisma);
      const pushService = new PushNotificationService(subscriptionService);
      const result = await pushService.sendOtpRequiredNotification(
        'job-int-1',
        99,
        '楽天銀行',
        'TOTP'
      );

      expect(result.success).toBe(true);
      expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
      const callArgs = vi.mocked(webpush.sendNotification).mock.calls[0];
      expect(callArgs).toBeDefined();
      const pushSub = callArgs![0];
      const payloadStr = callArgs![1];
      expect(pushSub.endpoint).toContain('integration-test');
      const payload = JSON.parse(payloadStr as string);
      expect(payload).toMatchObject({
        type: 'OTP_REQUIRED',
        jobId: 'job-int-1',
        accountId: 99,
        accountName: '楽天銀行',
        authMethod: 'TOTP',
      });
    });
  });

  describe('OTP submission → scraper resume', () => {
    it('routes the submitted OTP through the otp callback to the scraper', async () => {
      // Set up a job in waiting_for_otp.
      const jobService = new JobService(prisma);
      const job = await jobService.create('SCRAPE_ALL');
      await jobService.setWaitingForOtp(job.id, 'TOTP');

      // Register a scraper-side callback (simulates ScraperService).
      const submit = vi.fn();
      const cancel = vi.fn();
      otpCallbacks.set(job.id, { submit, cancel });

      // Submit OTP via API as the frontend would.
      const res = await app.inject({
        method: 'POST',
        url: `/api/scraping/${job.id}/submit-otp`,
        payload: { otp: '123456' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true, message: 'OTP submitted' });
      expect(submit).toHaveBeenCalledWith('123456');
      expect(cancel).not.toHaveBeenCalled();
    });

    it('rejects OTP for jobs not in waiting_for_otp', async () => {
      const jobService = new JobService(prisma);
      const job = await jobService.create('SCRAPE_ALL');
      await jobService.updateStatus(job.id, 'running');

      const res = await app.inject({
        method: 'POST',
        url: `/api/scraping/${job.id}/submit-otp`,
        payload: { otp: '123456' },
      });

      expect(res.statusCode).toBe(409);
    });

    it('cancellation transitions the job to failed and triggers the scraper cancel hook', async () => {
      const jobService = new JobService(prisma);
      const job = await jobService.create('SCRAPE_ALL');
      await jobService.setWaitingForOtp(job.id, 'TOTP');

      const submit = vi.fn();
      const cancel = vi.fn();
      otpCallbacks.set(job.id, { submit, cancel });

      const res = await app.inject({
        method: 'POST',
        url: `/api/scraping/${job.id}/cancel-otp`,
      });

      expect(res.statusCode).toBe(200);
      expect(cancel).toHaveBeenCalled();

      const updated = await prisma.job.findUnique({ where: { id: job.id } });
      expect(updated?.status).toBe('failed');
      expect(updated?.errorMessage).toBe('OTP cancelled by user');
      expect(otpCallbacks.has(job.id)).toBe(false);
    });
  });

  describe('TOTP auto-generation flow', () => {
    it('saves an encrypted TOTP secret and produces a valid 6-digit OTP', async () => {
      // Create an account so we can attach a TOTP secret to it.
      const account = await prisma.account.create({
        data: { name: 'TOTP-protected', type: 'BANK' },
      });

      const encryption = new EncryptionService();
      const totpService = new TotpService(prisma, encryption);

      await totpService.saveSecret(account.id, VALID_BASE32_SECRET);

      // Verify the persisted columns are encrypted blobs, not the raw secret.
      const persisted = await prisma.account.findUnique({
        where: { id: account.id },
      });
      expect(persisted?.encryptedTotpSecret).toBeTruthy();
      expect(persisted?.encryptedTotpSecret).not.toBe(VALID_BASE32_SECRET);
      expect(persisted?.totpSecretIv).toBeTruthy();
      expect(persisted?.totpSecretAuthTag).toBeTruthy();

      // generateOtp must decrypt and produce a 6-digit OTP.
      const otp = await totpService.generateOtp(account.id);
      expect(otp).not.toBeNull();
      expect(otp).toMatch(/^\d{6}$/);

      expect(await totpService.hasSecret(account.id)).toBe(true);

      // Deleting clears the columns.
      await totpService.deleteSecret(account.id);
      const after = await prisma.account.findUnique({ where: { id: account.id } });
      expect(after?.encryptedTotpSecret).toBeNull();
      expect(after?.totpSecretIv).toBeNull();
      expect(after?.totpSecretAuthTag).toBeNull();
      expect(await totpService.hasSecret(account.id)).toBe(false);
    });
  });

  describe('OTP timeout handling', () => {
    it('returns 409 when submitting OTP for a timed-out job and marks the job failed', async () => {
      const jobService = new JobService(prisma);
      const job = await jobService.create('SCRAPE_ALL');
      await jobService.setWaitingForOtp(job.id, 'TOTP');
      // Backdate the otpRequestedAt past the 5-minute deadline.
      await prisma.job.update({
        where: { id: job.id },
        data: { otpRequestedAt: new Date(Date.now() - 6 * 60 * 1000) },
      });
      otpCallbacks.set(job.id, { submit: vi.fn(), cancel: vi.fn() });

      const res = await app.inject({
        method: 'POST',
        url: `/api/scraping/${job.id}/submit-otp`,
        payload: { otp: '123456' },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({ error: 'OTP has timed out' });

      const updated = await prisma.job.findUnique({ where: { id: job.id } });
      expect(updated?.status).toBe('failed');
      expect(updated?.errorMessage).toBe('OTP timeout');
    });

    it('recoverStaleOtpJobs marks all timed-out OTP-waiting jobs as failed on demand', async () => {
      const jobService = new JobService(prisma);
      const stale = await jobService.create('SCRAPE_ALL');
      await prisma.job.update({
        where: { id: stale.id },
        data: {
          status: 'waiting_for_otp',
          otpAuthMethod: 'TOTP',
          otpRequestedAt: new Date(Date.now() - 10 * 60 * 1000),
        },
      });
      const fresh = await jobService.create('SCRAPE_ALL');
      await jobService.setWaitingForOtp(fresh.id, 'TOTP');

      await jobService.recoverStaleOtpJobs();

      const staleAfter = await prisma.job.findUnique({ where: { id: stale.id } });
      const freshAfter = await prisma.job.findUnique({ where: { id: fresh.id } });
      expect(staleAfter?.status).toBe('failed');
      expect(staleAfter?.errorMessage).toBe('OTP timeout');
      expect(freshAfter?.status).toBe('waiting_for_otp');
    });
  });

  describe('OTP status restoration endpoint (used after browser reload)', () => {
    it('GET /api/scraping/waiting-for-otp returns active OTP-waiting jobs only', async () => {
      const jobService = new JobService(prisma);

      const fresh = await jobService.create('SCRAPE_SPECIFIC', undefined);
      await jobService.setWaitingForOtp(fresh.id, 'SMS');

      const stale = await jobService.create('SCRAPE_ALL');
      await prisma.job.update({
        where: { id: stale.id },
        data: {
          status: 'waiting_for_otp',
          otpAuthMethod: 'TOTP',
          otpRequestedAt: new Date(Date.now() - 10 * 60 * 1000),
        },
      });

      const completed = await jobService.create('SCRAPE_ALL');
      await jobService.updateStatus(completed.id, 'completed');

      const res = await app.inject({
        method: 'GET',
        url: '/api/scraping/waiting-for-otp',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as Array<{ jobId: string; authMethod: string }>;
      // Only the fresh waiting_for_otp job should be returned (stale + completed excluded).
      expect(body.map((j) => j.jobId)).toEqual([fresh.id]);
      expect(body).toHaveLength(1);
      expect(body[0]?.authMethod).toBe('SMS');
    });
  });

  describe('OTP API validation', () => {
    it('rejects non-numeric OTP', async () => {
      const jobService = new JobService(prisma);
      const job = await jobService.create('SCRAPE_ALL');
      await jobService.setWaitingForOtp(job.id, 'TOTP');

      const res = await app.inject({
        method: 'POST',
        url: `/api/scraping/${job.id}/submit-otp`,
        payload: { otp: '12ab56' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects OTP outside the 6-8 digit range', async () => {
      const jobService = new JobService(prisma);
      const job = await jobService.create('SCRAPE_ALL');
      await jobService.setWaitingForOtp(job.id, 'TOTP');

      const tooShort = await app.inject({
        method: 'POST',
        url: `/api/scraping/${job.id}/submit-otp`,
        payload: { otp: '12345' },
      });
      expect(tooShort.statusCode).toBe(400);

      const tooLong = await app.inject({
        method: 'POST',
        url: `/api/scraping/${job.id}/submit-otp`,
        payload: { otp: '123456789' },
      });
      expect(tooLong.statusCode).toBe(400);
    });

    it('returns 404 when submitting OTP to a non-existent job', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/scraping/nonexistent-job/submit-otp',
        payload: { otp: '123456' },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
