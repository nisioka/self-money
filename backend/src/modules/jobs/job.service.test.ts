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
});
