import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { JobService } from './job.service.js';

const prisma = new PrismaClient();

describe('JobService', () => {
  let service: JobService;

  beforeAll(async () => {
    await prisma.$connect();
    service = new JobService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.job.deleteMany();
    await prisma.autoRule.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.category.deleteMany();
    await prisma.account.deleteMany();
  });

  describe('create', () => {
    it('should create a SCRAPE_ALL job', async () => {
      const job = await service.create('SCRAPE_ALL');

      expect(job.id).toBeDefined();
      expect(job.type).toBe('SCRAPE_ALL');
      expect(job.status).toBe('pending');
      expect(job.targetAccountId).toBeNull();
    });

    it('should create a SCRAPE_SPECIFIC job with target account', async () => {
      const account = await prisma.account.create({
        data: { name: '楽天銀行', type: 'BANK' },
      });

      const job = await service.create('SCRAPE_SPECIFIC', account.id);

      expect(job.type).toBe('SCRAPE_SPECIFIC');
      expect(job.targetAccountId).toBe(account.id);
    });

    it('should generate unique job IDs', async () => {
      const job1 = await service.create('SCRAPE_ALL');
      const job2 = await service.create('SCRAPE_ALL');

      expect(job1.id).not.toBe(job2.id);
    });
  });

  describe('getById', () => {
    it('should return job by id', async () => {
      const created = await service.create('SCRAPE_ALL');

      const result = await service.getById(created.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(created.id);
        expect(result.data.type).toBe('SCRAPE_ALL');
      }
    });

    it('should return error for non-existent job', async () => {
      const result = await service.getById('non-existent-id');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('NOT_FOUND');
      }
    });
  });

  describe('getNextPending', () => {
    it('should return oldest pending job', async () => {
      // Create jobs with slight delay to ensure different timestamps
      const job1 = await service.create('SCRAPE_ALL');
      await new Promise((resolve) => setTimeout(resolve, 10));
      const job2 = await service.create('SCRAPE_ALL');

      const nextJob = await service.getNextPending();

      expect(nextJob).not.toBeNull();
      expect(nextJob?.id).toBe(job1.id);
    });

    it('should return null when no pending jobs', async () => {
      const nextJob = await service.getNextPending();
      expect(nextJob).toBeNull();
    });

    it('should skip running jobs', async () => {
      const job1 = await service.create('SCRAPE_ALL');
      await service.updateStatus(job1.id, 'running');

      const job2 = await service.create('SCRAPE_ALL');

      const nextJob = await service.getNextPending();
      expect(nextJob?.id).toBe(job2.id);
    });

    it('should skip completed jobs', async () => {
      const job1 = await service.create('SCRAPE_ALL');
      await service.updateStatus(job1.id, 'completed');

      const job2 = await service.create('SCRAPE_ALL');

      const nextJob = await service.getNextPending();
      expect(nextJob?.id).toBe(job2.id);
    });

    it('should skip failed jobs', async () => {
      const job1 = await service.create('SCRAPE_ALL');
      await service.updateStatus(job1.id, 'failed', 'Some error');

      const job2 = await service.create('SCRAPE_ALL');

      const nextJob = await service.getNextPending();
      expect(nextJob?.id).toBe(job2.id);
    });
  });

  describe('hasRunningJob', () => {
    it('should return false when no running jobs', async () => {
      const result = await service.hasRunningJob();
      expect(result).toBe(false);
    });

    it('should return true when a job is running', async () => {
      const job = await service.create('SCRAPE_ALL');
      await service.updateStatus(job.id, 'running');

      const result = await service.hasRunningJob();
      expect(result).toBe(true);
    });

    it('should return false when jobs are pending or completed', async () => {
      const job1 = await service.create('SCRAPE_ALL');
      const job2 = await service.create('SCRAPE_ALL');
      await service.updateStatus(job2.id, 'completed');

      const result = await service.hasRunningJob();
      expect(result).toBe(false);
    });
  });

  describe('updateStatus', () => {
    it('should update job status to running', async () => {
      const job = await service.create('SCRAPE_ALL');

      const updated = await service.updateStatus(job.id, 'running');

      expect(updated.status).toBe('running');
    });

    it('should update job status to completed', async () => {
      const job = await service.create('SCRAPE_ALL');
      await service.updateStatus(job.id, 'running');

      const updated = await service.updateStatus(job.id, 'completed');

      expect(updated.status).toBe('completed');
    });

    it('should update job status to failed with error message', async () => {
      const job = await service.create('SCRAPE_ALL');
      await service.updateStatus(job.id, 'running');

      const updated = await service.updateStatus(
        job.id,
        'failed',
        'Authentication failed'
      );

      expect(updated.status).toBe('failed');
      expect(updated.errorMessage).toBe('Authentication failed');
    });

    it('should throw error for non-existent job', async () => {
      await expect(
        service.updateStatus('non-existent-id', 'running')
      ).rejects.toThrow();
    });
  });

  describe('getRecent', () => {
    it('should return recent jobs ordered by creation time desc', async () => {
      const job1 = await service.create('SCRAPE_ALL');
      await new Promise((resolve) => setTimeout(resolve, 10));
      const job2 = await service.create('SCRAPE_ALL');
      await new Promise((resolve) => setTimeout(resolve, 10));
      const job3 = await service.create('SCRAPE_ALL');

      const recent = await service.getRecent(10);

      expect(recent).toHaveLength(3);
      expect(recent[0].id).toBe(job3.id);
      expect(recent[1].id).toBe(job2.id);
      expect(recent[2].id).toBe(job1.id);
    });

    it('should respect limit parameter', async () => {
      await service.create('SCRAPE_ALL');
      await service.create('SCRAPE_ALL');
      await service.create('SCRAPE_ALL');

      const recent = await service.getRecent(2);

      expect(recent).toHaveLength(2);
    });

    it('should return empty array when no jobs', async () => {
      const recent = await service.getRecent(10);
      expect(recent).toEqual([]);
    });
  });

  describe('setWaitingForOtp', () => {
    it('should transition status to waiting_for_otp with auth method and timestamp', async () => {
      const job = await service.create('SCRAPE_ALL');
      await service.updateStatus(job.id, 'running');

      const before = Date.now();
      const updated = await service.setWaitingForOtp(job.id, 'TOTP');
      const after = Date.now();

      expect(updated.status).toBe('waiting_for_otp');
      expect(updated.otpAuthMethod).toBe('TOTP');
      expect(updated.otpRequestedAt).not.toBeNull();
      expect(updated.otpRequestedAt!.getTime()).toBeGreaterThanOrEqual(before);
      expect(updated.otpRequestedAt!.getTime()).toBeLessThanOrEqual(after);
      expect(updated.otpRetryCount).toBe(0);
    });

    it('should support all OTP auth methods', async () => {
      for (const method of ['TOTP', 'SMS', 'EMAIL', 'PUSH_APPROVAL'] as const) {
        const job = await service.create('SCRAPE_ALL');
        const updated = await service.setWaitingForOtp(job.id, method);
        expect(updated.otpAuthMethod).toBe(method);
      }
    });

    it('should reset otpRetryCount to 0 even after previous attempts', async () => {
      const job = await service.create('SCRAPE_ALL');
      await service.setWaitingForOtp(job.id, 'TOTP');
      await service.incrementOtpRetryCount(job.id);
      await service.incrementOtpRetryCount(job.id);

      const updated = await service.setWaitingForOtp(job.id, 'TOTP');
      expect(updated.otpRetryCount).toBe(0);
    });
  });

  describe('incrementOtpRetryCount', () => {
    it('should increment retry count by 1', async () => {
      const job = await service.create('SCRAPE_ALL');
      await service.setWaitingForOtp(job.id, 'TOTP');

      const after1 = await service.incrementOtpRetryCount(job.id);
      expect(after1.otpRetryCount).toBe(1);

      const after2 = await service.incrementOtpRetryCount(job.id);
      expect(after2.otpRetryCount).toBe(2);
    });
  });

  describe('getWaitingForOtpJobs', () => {
    it('should return only jobs with waiting_for_otp status', async () => {
      const j1 = await service.create('SCRAPE_ALL');
      await service.setWaitingForOtp(j1.id, 'TOTP');
      const j2 = await service.create('SCRAPE_ALL');
      await service.updateStatus(j2.id, 'running');
      const j3 = await service.create('SCRAPE_ALL');
      await service.setWaitingForOtp(j3.id, 'SMS');

      const result = await service.getWaitingForOtpJobs();

      expect(result.map((j) => j.id).sort()).toEqual([j1.id, j3.id].sort());
    });

    it('should order by otpRequestedAt ascending (oldest first)', async () => {
      const j1 = await service.create('SCRAPE_ALL');
      await service.setWaitingForOtp(j1.id, 'TOTP');
      await new Promise((resolve) => setTimeout(resolve, 10));
      const j2 = await service.create('SCRAPE_ALL');
      await service.setWaitingForOtp(j2.id, 'TOTP');

      const result = await service.getWaitingForOtpJobs();

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe(j1.id);
      expect(result[1]?.id).toBe(j2.id);
    });

    it('should return empty array when no jobs are waiting for OTP', async () => {
      const result = await service.getWaitingForOtpJobs();
      expect(result).toEqual([]);
    });
  });

  describe('recoverStaleOtpJobs', () => {
    it('should mark waiting_for_otp jobs older than 5 minutes as failed', async () => {
      const fresh = await service.create('SCRAPE_ALL');
      await service.setWaitingForOtp(fresh.id, 'TOTP');

      const stale = await service.create('SCRAPE_ALL');
      // Manually backdate the otpRequestedAt to 6 minutes ago
      await prisma.job.update({
        where: { id: stale.id },
        data: {
          status: 'waiting_for_otp',
          otpAuthMethod: 'TOTP',
          otpRequestedAt: new Date(Date.now() - 6 * 60 * 1000),
        },
      });

      await service.recoverStaleOtpJobs();

      const freshAfter = await prisma.job.findUnique({ where: { id: fresh.id } });
      const staleAfter = await prisma.job.findUnique({ where: { id: stale.id } });
      expect(freshAfter?.status).toBe('waiting_for_otp');
      expect(staleAfter?.status).toBe('failed');
      expect(staleAfter?.errorMessage).toBe('OTP timeout');
    });

    it('should be a no-op when there are no stale jobs', async () => {
      await expect(service.recoverStaleOtpJobs()).resolves.toBeUndefined();
    });
  });

  describe('isOtpTimedOut', () => {
    it('should return false for fresh waiting_for_otp jobs', async () => {
      const job = await service.create('SCRAPE_ALL');
      const waiting = await service.setWaitingForOtp(job.id, 'TOTP');

      expect(service.isOtpTimedOut(waiting)).toBe(false);
    });

    it('should return true for jobs older than 5 minutes', async () => {
      const job = await service.create('SCRAPE_ALL');
      await service.setWaitingForOtp(job.id, 'TOTP');
      const stale = await prisma.job.update({
        where: { id: job.id },
        data: { otpRequestedAt: new Date(Date.now() - 6 * 60 * 1000) },
      });

      expect(service.isOtpTimedOut(stale)).toBe(true);
    });

    it('should return false for non-waiting jobs', async () => {
      const job = await service.create('SCRAPE_ALL');
      const running = await service.updateStatus(job.id, 'running');
      expect(service.isOtpTimedOut(running)).toBe(false);
    });
  });

  describe('getRemainingOtpSeconds', () => {
    it('should return ~300 seconds for a freshly-requested OTP', async () => {
      const job = await service.create('SCRAPE_ALL');
      const waiting = await service.setWaitingForOtp(job.id, 'TOTP');

      const remaining = service.getRemainingOtpSeconds(waiting);
      expect(remaining).toBeGreaterThan(295);
      expect(remaining).toBeLessThanOrEqual(300);
    });

    it('should return 0 for jobs not in waiting_for_otp', async () => {
      const job = await service.create('SCRAPE_ALL');
      expect(service.getRemainingOtpSeconds(job)).toBe(0);
    });

    it('should return 0 for timed-out jobs', async () => {
      const job = await service.create('SCRAPE_ALL');
      await service.setWaitingForOtp(job.id, 'TOTP');
      const stale = await prisma.job.update({
        where: { id: job.id },
        data: { otpRequestedAt: new Date(Date.now() - 6 * 60 * 1000) },
      });

      expect(service.getRemainingOtpSeconds(stale)).toBe(0);
    });
  });
});
