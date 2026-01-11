import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { JobService } from './job.service.js';
import { BackgroundWorker, type JobExecutor } from './worker.js';

const prisma = new PrismaClient();

describe('Job Flow Integration', () => {
  let jobService: JobService;
  let worker: BackgroundWorker;
  let mockExecutor: JobExecutor;

  beforeAll(async () => {
    await prisma.$connect();
    jobService = new JobService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    if (worker) {
      worker.stop();
    }
    await prisma.job.deleteMany();
    await prisma.autoRule.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.category.deleteMany();
    await prisma.account.deleteMany();

    mockExecutor = {
      execute: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe('Job submission to completion flow', () => {
    it('should complete job flow: submit -> pending -> running -> completed', async () => {
      // 1. Submit a job
      const job = await jobService.create('SCRAPE_ALL');
      expect(job.status).toBe('pending');

      // 2. Verify job is retrievable
      const retrievedResult = await jobService.getById(job.id);
      expect(retrievedResult.success).toBe(true);
      if (retrievedResult.success) {
        expect(retrievedResult.data.status).toBe('pending');
      }

      // 3. Start worker to process job
      worker = new BackgroundWorker(jobService, mockExecutor, 50);
      worker.start();

      // Wait for job to be processed
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 4. Verify job completed
      const completedResult = await jobService.getById(job.id);
      expect(completedResult.success).toBe(true);
      if (completedResult.success) {
        expect(completedResult.data.status).toBe('completed');
      }
      expect(mockExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({ id: job.id })
      );
    });

    it('should update job status to failed with error message', async () => {
      // Test the job service directly for failure case
      // (Worker failure handling is tested in worker.test.ts with mocks)
      const job = await jobService.create('SCRAPE_ALL');

      // Simulate failure by updating status directly
      await jobService.updateStatus(job.id, 'failed', 'Scraping failed');

      // Verify job is failed with error message
      const failedResult = await jobService.getById(job.id);
      expect(failedResult.success).toBe(true);
      if (failedResult.success) {
        expect(failedResult.data.status).toBe('failed');
        expect(failedResult.data.errorMessage).toBe('Scraping failed');
      }
    });

    it('should process jobs in order (FIFO)', async () => {
      const processOrder: string[] = [];

      const trackingExecutor: JobExecutor = {
        execute: vi.fn().mockImplementation(async (job) => {
          processOrder.push(job.id);
          await new Promise((resolve) => setTimeout(resolve, 10));
        }),
      };

      // Submit multiple jobs
      const job1 = await jobService.create('SCRAPE_ALL');
      const job2 = await jobService.create('SCRAPE_ALL');
      const job3 = await jobService.create('SCRAPE_ALL');

      // Start worker
      worker = new BackgroundWorker(jobService, trackingExecutor, 30);
      worker.start();

      // Wait for all jobs to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify FIFO order
      expect(processOrder).toEqual([job1.id, job2.id, job3.id]);

      // Verify all jobs completed
      const status1 = await jobService.getById(job1.id);
      const status2 = await jobService.getById(job2.id);
      const status3 = await jobService.getById(job3.id);
      expect(status1.success && status1.data.status).toBe('completed');
      expect(status2.success && status2.data.status).toBe('completed');
      expect(status3.success && status3.data.status).toBe('completed');
    });

    it('should check for running jobs before processing', async () => {
      // This test verifies the hasRunningJob check in worker logic
      // Submit a job and mark it as running manually
      const runningJob = await jobService.create('SCRAPE_ALL');
      await jobService.updateStatus(runningJob.id, 'running');

      // Submit another pending job
      const pendingJob = await jobService.create('SCRAPE_ALL');

      // Start worker - it should skip processing because a job is running
      worker = new BackgroundWorker(jobService, mockExecutor, 50);
      worker.start();

      // Wait for a poll cycle
      await new Promise((resolve) => setTimeout(resolve, 100));

      // The pending job should still be pending because there's a running job
      const pendingResult = await jobService.getById(pendingJob.id);
      expect(pendingResult.success).toBe(true);
      if (pendingResult.success) {
        expect(pendingResult.data.status).toBe('pending');
      }

      // The executor should not have been called
      expect(mockExecutor.execute).not.toHaveBeenCalled();
    });
  });

  describe('Job with target account', () => {
    it('should create and process SCRAPE_SPECIFIC job with account', async () => {
      const account = await prisma.account.create({
        data: { name: '楽天銀行', type: 'BANK' },
      });

      // Submit job with target account
      const job = await jobService.create('SCRAPE_SPECIFIC', account.id);
      expect(job.targetAccountId).toBe(account.id);

      // Start worker
      worker = new BackgroundWorker(jobService, mockExecutor, 50);
      worker.start();

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify executor received job with correct target
      expect(mockExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SCRAPE_SPECIFIC',
          targetAccountId: account.id,
        })
      );
    });
  });

  describe('Job service queries', () => {
    it('should return recent jobs in descending order', async () => {
      await jobService.create('SCRAPE_ALL');
      await new Promise((resolve) => setTimeout(resolve, 10));
      await jobService.create('SCRAPE_ALL');
      await new Promise((resolve) => setTimeout(resolve, 10));
      await jobService.create('SCRAPE_ALL');

      const recentJobs = await jobService.getRecent(10);

      expect(recentJobs.length).toBe(3);
      // Verify descending order (newest first)
      for (let i = 1; i < recentJobs.length; i++) {
        expect(recentJobs[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(
          recentJobs[i].createdAt.getTime()
        );
      }
    });

    it('should correctly identify running jobs', async () => {
      // Initially no running jobs
      expect(await jobService.hasRunningJob()).toBe(false);

      // Create and manually set to running
      const job = await jobService.create('SCRAPE_ALL');
      await jobService.updateStatus(job.id, 'running');

      // Now should have running job
      expect(await jobService.hasRunningJob()).toBe(true);

      // Complete the job
      await jobService.updateStatus(job.id, 'completed');

      // No more running jobs
      expect(await jobService.hasRunningJob()).toBe(false);
    });

    it('should get next pending job in FIFO order', async () => {
      const job1 = await jobService.create('SCRAPE_ALL');
      await new Promise((resolve) => setTimeout(resolve, 10));
      await jobService.create('SCRAPE_ALL');

      const nextPending = await jobService.getNextPending();

      expect(nextPending?.id).toBe(job1.id);
    });
  });
});
