import cron, { type ScheduledTask } from 'node-cron';
import type { Job } from '@prisma/client';
import type { JobService } from './job.service.js';

const DEFAULT_CRON_EXPRESSION = '0 3 * * *'; // 3:00 AM daily

export class JobScheduler {
  private task: ScheduledTask | null = null;
  private readonly cronExpression: string;

  constructor(
    private readonly jobService: JobService,
    cronExpression?: string
  ) {
    this.cronExpression = cronExpression || DEFAULT_CRON_EXPRESSION;
  }

  start(): void {
    if (this.task) {
      return; // Already running
    }

    this.task = cron.schedule(this.cronExpression, async () => {
      await this.triggerNow();
    });

    console.log(`[SCHEDULER] Started with cron expression: ${this.cronExpression}`);
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('[SCHEDULER] Stopped');
    }
  }

  isRunning(): boolean {
    return this.task !== null;
  }

  async triggerNow(): Promise<Job> {
    console.log('[SCHEDULER] Triggering SCRAPE_ALL job');
    return this.jobService.create('SCRAPE_ALL');
  }

  getCronExpression(): string {
    return this.cronExpression;
  }
}
