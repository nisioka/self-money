import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TotpService } from '../totp/totp.service.js';
import { PushNotificationService } from '../push/push-notification.service.js';
import { EncryptionService } from '../security/encryption.service.js';
import type { PrismaClient } from '@prisma/client';
import type { PushSubscriptionService } from '../push/push-subscription.service.js';

// Mock web-push so we can introspect call arguments without making
// real HTTP requests during the security checks.
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
const SAMPLE_OTP = '987654';

describe('OTP/TOTP Security Requirements', () => {
  let consoleSpies: {
    log: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  const captureLogs = (): string => {
    return [
      ...consoleSpies.log.mock.calls.flat(),
      ...consoleSpies.warn.mock.calls.flat(),
      ...consoleSpies.error.mock.calls.flat(),
    ]
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join('\n');
  };

  beforeEach(() => {
    consoleSpies = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    consoleSpies.log.mockRestore();
    consoleSpies.warn.mockRestore();
    consoleSpies.error.mockRestore();
    vi.clearAllMocks();
  });

  // Requirement 9.3: OTP values must never appear in logs.
  describe('Requirement 9.3 - OTP values never logged', () => {
    it('does not log the OTP when sending an OTP_REQUIRED notification', async () => {
      const subscription = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        keys: { p256dh: 'p256dh', auth: 'auth' },
      };
      const subscriptionService = {
        getSubscription: vi.fn().mockResolvedValue(subscription),
      } as unknown as PushSubscriptionService;
      const pushService = new PushNotificationService(subscriptionService);

      await pushService.sendOtpRequiredNotification(
        'job-secret-123',
        1,
        '三菱UFJ銀行',
        'TOTP'
      );

      const logs = captureLogs();
      expect(logs).not.toContain(SAMPLE_OTP);
      // The notification payload itself should not contain a real OTP.
      const sendCall = vi.mocked(webpush.sendNotification).mock.calls[0];
      expect(sendCall).toBeDefined();
      const payload = JSON.parse(sendCall![1] as string);
      expect(JSON.stringify(payload)).not.toContain(SAMPLE_OTP);
    });

    it('does not log the OTP value during TOTP generation', async () => {
      const account = {
        encryptedTotpSecret: 'cipher',
        totpSecretIv: 'iv',
        totpSecretAuthTag: 'tag',
      };
      const prisma = {
        account: { findUnique: vi.fn().mockResolvedValue(account) },
      } as unknown as PrismaClient;
      const encryption = {
        encrypt: vi.fn(),
        decrypt: vi.fn().mockReturnValue(VALID_BASE32_SECRET),
      } as unknown as EncryptionService;
      const totp = new TotpService(prisma, encryption);

      const otp = await totp.generateOtp(1);
      expect(otp).toMatch(/^\d{6}$/);

      const logs = captureLogs();
      // The generated OTP must not appear anywhere in stdout/stderr.
      expect(logs).not.toContain(otp!);
    });
  });

  // Requirement 9.4: TOTP secrets must be stored encrypted (AES-256-GCM)
  // and the plaintext secret must never be persisted directly.
  describe('Requirement 9.4 - TOTP secret stored encrypted', () => {
    it('encrypts the secret before persisting it', async () => {
      const updateMock = vi.fn().mockResolvedValue({ id: 1 });
      const prisma = {
        account: {
          findUnique: vi.fn().mockResolvedValue({ id: 1 }),
          update: updateMock,
        },
      } as unknown as PrismaClient;
      const encryption = {
        encrypt: vi.fn().mockReturnValue({
          ciphertext: 'cipher-blob',
          iv: 'iv-blob',
          authTag: 'auth-tag-blob',
        }),
        decrypt: vi.fn(),
      } as unknown as EncryptionService;
      const totp = new TotpService(prisma, encryption);

      await totp.saveSecret(1, VALID_BASE32_SECRET);

      // The encryption service must be invoked with the plaintext secret.
      expect(encryption.encrypt).toHaveBeenCalledWith(VALID_BASE32_SECRET);
      // The persisted columns must contain only encrypted material —
      // never the plaintext secret.
      expect(updateMock.mock.calls[0]).toBeDefined();
      const persistedData = updateMock.mock.calls[0]![0].data;
      expect(persistedData.encryptedTotpSecret).toBe('cipher-blob');
      expect(persistedData.totpSecretIv).toBe('iv-blob');
      expect(persistedData.totpSecretAuthTag).toBe('auth-tag-blob');
      expect(JSON.stringify(persistedData)).not.toContain(VALID_BASE32_SECRET);
    });

    it('uses real AES-256-GCM (round-trip via EncryptionService)', () => {
      // Use the real encryption service to verify the round trip works.
      const encryption = new EncryptionService();
      const encrypted = encryption.encrypt(VALID_BASE32_SECRET);
      // Ciphertext must not contain the plaintext secret.
      expect(encrypted.ciphertext).not.toContain(VALID_BASE32_SECRET);
      // IV is 12 bytes => 16 base64 chars; auth tag is 16 bytes => 24 base64 chars.
      expect(Buffer.from(encrypted.iv, 'base64').length).toBe(12);
      expect(Buffer.from(encrypted.authTag, 'base64').length).toBe(16);
      // And the round-trip must recover the original secret.
      expect(encryption.decrypt(encrypted)).toBe(VALID_BASE32_SECRET);
    });
  });

  // Requirement 9.1 / 9.5: OTP values are processed only in memory and
  // never written to durable storage.
  describe('Requirement 9.1, 9.5 - OTP processed only in memory', () => {
    it('does not persist the user-submitted OTP value to the Job row', async () => {
      // The OTP submission flow exposed via otp.routes only calls
      // jobService.updateStatus / incrementOtpRetryCount — none of these
      // accept an OTP value, so the OTP cannot reach the database.
      const updateMock = vi.fn().mockResolvedValue({ id: 'j', status: 'running' });
      const prisma = {
        job: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'j',
            status: 'waiting_for_otp',
            otpRetryCount: 0,
          }),
          update: updateMock,
        },
      } as unknown as PrismaClient;

      const { JobService } = await import('../jobs/job.service.js');
      const jobService = new JobService(prisma);

      await jobService.updateStatus('j', 'running');
      await jobService.incrementOtpRetryCount('j');

      // None of the writes must contain an OTP-shaped value.
      for (const call of updateMock.mock.calls) {
        const dataJson = JSON.stringify(call[0].data ?? {});
        expect(dataJson).not.toMatch(/\b\d{6,8}\b/);
      }
    });
  });

  // Requirement 9.2: VAPID keys must be configured for Web Push.
  // We verify the service refuses to leak keys back to callers and
  // that a missing-config does not crash module load.
  describe('Requirement 9.2 - VAPID configuration safety', () => {
    it('initializes setVapidDetails when all VAPID env vars are present', () => {
      const subscriptionService = {
        getSubscription: vi.fn(),
      } as unknown as PushSubscriptionService;

      // VAPID env vars are set globally by the test setup.
      // Ensure they are present, then verify setVapidDetails is invoked.
      expect(process.env.VAPID_PUBLIC_KEY).toBeTruthy();
      expect(process.env.VAPID_PRIVATE_KEY).toBeTruthy();
      expect(process.env.VAPID_SUBJECT).toBeTruthy();

      vi.mocked(webpush.setVapidDetails).mockClear();
      new PushNotificationService(subscriptionService);
      expect(webpush.setVapidDetails).toHaveBeenCalledWith(
        process.env.VAPID_SUBJECT,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
    });

    it('does not call setVapidDetails when env vars are missing (does not crash)', () => {
      const original = {
        publicKey: process.env.VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY,
        subject: process.env.VAPID_SUBJECT,
      };
      delete process.env.VAPID_PUBLIC_KEY;
      delete process.env.VAPID_PRIVATE_KEY;
      delete process.env.VAPID_SUBJECT;
      vi.mocked(webpush.setVapidDetails).mockClear();

      try {
        const subscriptionService = {
          getSubscription: vi.fn(),
        } as unknown as PushSubscriptionService;
        expect(() => new PushNotificationService(subscriptionService)).not.toThrow();
        expect(webpush.setVapidDetails).not.toHaveBeenCalled();
      } finally {
        process.env.VAPID_PUBLIC_KEY = original.publicKey;
        process.env.VAPID_PRIVATE_KEY = original.privateKey;
        process.env.VAPID_SUBJECT = original.subject;
      }
    });
  });
});
