import type { Job } from '@prisma/client';
import type { JobService } from './job.service.js';

export interface JobExecutor {
  execute(job: Job): Promise<void>;
}

const DEFAULT_POLL_INTERVAL = 5000; // 5 seconds

export class BackgroundWorker {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly pollInterval: number;

  constructor(
    private readonly jobService: JobService,
    private readonly executor: JobExecutor,
    pollInterval?: number
  ) {
    this.pollInterval = pollInterval || DEFAULT_POLL_INTERVAL;
  }

  start(): void {
    if (this.intervalId) {
      return; // Already running
    }

    this.intervalId = setInterval(() => {
      this.processNextJob().catch((error) => {
        console.error('[WORKER] Error processing job:', error);
      });
    }, this.pollInterval);

    console.log(`[WORKER] Started with poll interval: ${this.pollInterval}ms`);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[WORKER] Stopped');
    }
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }

  private async processNextJob(): Promise<void> {
    // Check if there's already a running job
    const hasRunning = await this.jobService.hasRunningJob();
    if (hasRunning) {
      return; // Skip if a job is already running
    }

    // Get the next pending job
    const job = await this.jobService.getNextPending();
    if (!job) {
      return; // No pending jobs
    }

    // Mark job as running
    await this.jobService.updateStatus(job.id, 'running');

    try {
      // Execute the job
      await this.executor.execute(job);

      // Mark job as completed
      await this.jobService.updateStatus(job.id, 'completed');
    } catch (error) {
      // Mark job as failed with error message
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await this.jobService.updateStatus(job.id, 'failed', errorMessage);
    }
  }
}
