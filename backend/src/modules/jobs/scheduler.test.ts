import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { JobScheduler } from './scheduler.js';
import type { JobService } from './job.service.js';

describe('JobScheduler', () => {
  let mockJobService: JobService;
  let scheduler: JobScheduler;

  beforeEach(() => {
    vi.useFakeTimers();

    mockJobService = {
      create: vi.fn().mockResolvedValue({
        id: 'test-job-id',
        type: 'SCRAPE_ALL',
        status: 'pending',
      }),
      getById: vi.fn(),
      getNextPending: vi.fn(),
      hasRunningJob: vi.fn(),
      updateStatus: vi.fn(),
      getRecent: vi.fn(),
    } as unknown as JobService;
  });

  afterEach(() => {
    if (scheduler) {
      scheduler.stop();
    }
    vi.useRealTimers();
  });

  describe('start', () => {
    it('should schedule job at default time (3:00 AM)', () => {
      scheduler = new JobScheduler(mockJobService);
      scheduler.start();

      expect(scheduler.isRunning()).toBe(true);
    });

    it('should schedule job at custom time', () => {
      scheduler = new JobScheduler(mockJobService, '0 4 * * *');
      scheduler.start();

      expect(scheduler.isRunning()).toBe(true);
    });

    it('should not start if already running', () => {
      scheduler = new JobScheduler(mockJobService);
      scheduler.start();
      scheduler.start(); // Second call should be ignored

      expect(scheduler.isRunning()).toBe(true);
    });
  });

  describe('stop', () => {
    it('should stop the scheduler', () => {
      scheduler = new JobScheduler(mockJobService);
      scheduler.start();
      scheduler.stop();

      expect(scheduler.isRunning()).toBe(false);
    });

    it('should do nothing if not running', () => {
      scheduler = new JobScheduler(mockJobService);
      scheduler.stop(); // Should not throw

      expect(scheduler.isRunning()).toBe(false);
    });
  });

  describe('triggerNow', () => {
    it('should create a SCRAPE_ALL job immediately', async () => {
      scheduler = new JobScheduler(mockJobService);

      await scheduler.triggerNow();

      expect(mockJobService.create).toHaveBeenCalledWith('SCRAPE_ALL');
    });

    it('should return the created job', async () => {
      scheduler = new JobScheduler(mockJobService);

      const job = await scheduler.triggerNow();

      expect(job.id).toBe('test-job-id');
      expect(job.type).toBe('SCRAPE_ALL');
    });
  });

  describe('getCronExpression', () => {
    it('should return the cron expression', () => {
      scheduler = new JobScheduler(mockJobService, '0 5 * * *');

      expect(scheduler.getCronExpression()).toBe('0 5 * * *');
    });

    it('should return default cron expression', () => {
      scheduler = new JobScheduler(mockJobService);

      expect(scheduler.getCronExpression()).toBe('0 3 * * *');
    });
  });
});
