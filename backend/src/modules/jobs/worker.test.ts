import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BackgroundWorker, type JobExecutor } from './worker.js';
import type { JobService } from './job.service.js';
import type { Job } from '@prisma/client';

describe('BackgroundWorker', () => {
  let mockJobService: JobService;
  let mockExecutor: JobExecutor;
  let worker: BackgroundWorker;

  const createMockJob = (overrides: Partial<Job> = {}): Job => ({
    id: 'test-job-id',
    type: 'SCRAPE_ALL',
    status: 'pending',
    targetAccountId: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    vi.useFakeTimers();

    mockJobService = {
      create: vi.fn(),
      getById: vi.fn(),
      getNextPending: vi.fn().mockResolvedValue(null),
      hasRunningJob: vi.fn().mockResolvedValue(false),
      updateStatus: vi.fn().mockImplementation((id, status) =>
        Promise.resolve(createMockJob({ id, status }))
      ),
      getRecent: vi.fn(),
    } as unknown as JobService;

    mockExecutor = {
      execute: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    if (worker) {
      worker.stop();
    }
    vi.useRealTimers();
  });

  describe('start', () => {
    it('should start polling for jobs', () => {
      worker = new BackgroundWorker(mockJobService, mockExecutor);
      worker.start();

      expect(worker.isRunning()).toBe(true);
    });

    it('should not start if already running', () => {
      worker = new BackgroundWorker(mockJobService, mockExecutor);
      worker.start();
      worker.start(); // Second call should be ignored

      expect(worker.isRunning()).toBe(true);
    });
  });

  describe('stop', () => {
    it('should stop the worker', () => {
      worker = new BackgroundWorker(mockJobService, mockExecutor);
      worker.start();
      worker.stop();

      expect(worker.isRunning()).toBe(false);
    });
  });

  describe('job processing', () => {
    it('should skip processing when a job is already running', async () => {
      vi.mocked(mockJobService.hasRunningJob).mockResolvedValue(true);

      worker = new BackgroundWorker(mockJobService, mockExecutor, 100);
      worker.start();

      await vi.advanceTimersByTimeAsync(150);

      expect(mockJobService.hasRunningJob).toHaveBeenCalled();
      expect(mockJobService.getNextPending).not.toHaveBeenCalled();
    });

    it('should process pending job when no running job exists', async () => {
      const pendingJob = createMockJob();
      vi.mocked(mockJobService.hasRunningJob).mockResolvedValue(false);
      vi.mocked(mockJobService.getNextPending).mockResolvedValueOnce(pendingJob);

      worker = new BackgroundWorker(mockJobService, mockExecutor, 100);
      worker.start();

      await vi.advanceTimersByTimeAsync(150);

      expect(mockJobService.updateStatus).toHaveBeenCalledWith(
        pendingJob.id,
        'running'
      );
      expect(mockExecutor.execute).toHaveBeenCalledWith(pendingJob);
    });

    it('should mark job as completed on success', async () => {
      const pendingJob = createMockJob();
      vi.mocked(mockJobService.hasRunningJob).mockResolvedValue(false);
      vi.mocked(mockJobService.getNextPending).mockResolvedValueOnce(pendingJob);

      worker = new BackgroundWorker(mockJobService, mockExecutor, 100);
      worker.start();

      await vi.advanceTimersByTimeAsync(150);

      expect(mockJobService.updateStatus).toHaveBeenCalledWith(
        pendingJob.id,
        'completed'
      );
    });

    it('should mark job as failed on error', async () => {
      const pendingJob = createMockJob();
      vi.mocked(mockJobService.hasRunningJob).mockResolvedValue(false);
      vi.mocked(mockJobService.getNextPending).mockResolvedValueOnce(pendingJob);
      vi.mocked(mockExecutor.execute).mockRejectedValueOnce(
        new Error('Execution failed')
      );

      worker = new BackgroundWorker(mockJobService, mockExecutor, 100);
      worker.start();

      await vi.advanceTimersByTimeAsync(150);

      expect(mockJobService.updateStatus).toHaveBeenCalledWith(
        pendingJob.id,
        'failed',
        'Execution failed'
      );
    });

    it('should handle non-Error exceptions', async () => {
      const pendingJob = createMockJob();
      vi.mocked(mockJobService.hasRunningJob).mockResolvedValue(false);
      vi.mocked(mockJobService.getNextPending).mockResolvedValueOnce(pendingJob);
      vi.mocked(mockExecutor.execute).mockRejectedValueOnce('String error');

      worker = new BackgroundWorker(mockJobService, mockExecutor, 100);
      worker.start();

      await vi.advanceTimersByTimeAsync(150);

      expect(mockJobService.updateStatus).toHaveBeenCalledWith(
        pendingJob.id,
        'failed',
        'Unknown error'
      );
    });

    it('should continue polling after job completion', async () => {
      const job1 = createMockJob({ id: 'job-1' });
      const job2 = createMockJob({ id: 'job-2' });

      vi.mocked(mockJobService.hasRunningJob).mockResolvedValue(false);
      vi.mocked(mockJobService.getNextPending)
        .mockResolvedValueOnce(job1)
        .mockResolvedValueOnce(job2)
        .mockResolvedValue(null);

      worker = new BackgroundWorker(mockJobService, mockExecutor, 100);
      worker.start();

      await vi.advanceTimersByTimeAsync(350);

      expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
      expect(mockExecutor.execute).toHaveBeenCalledWith(job1);
      expect(mockExecutor.execute).toHaveBeenCalledWith(job2);
    });
  });
});
