import type { Job } from '@prisma/client';
import type { JobExecutor } from '../jobs/worker.js';
import type { ScraperService, ScrapeSingleResult } from './scraper.service.js';
import type { ScrapeAccountError } from './scraper.types.js';

export interface ScrapeExecutorResult {
  jobId: string;
  totalAccounts: number;
  successCount: number;
  failedCount: number;
  transactionsAdded: number;
  transactionsSkipped: number;
  results: ScrapeSingleResult[];
  errors: ScrapeAccountError[];
}

/**
 * スクレイピングジョブ実行クラス
 * BackgroundWorkerのJobExecutorインターフェースを実装
 */
export class ScrapeExecutor implements JobExecutor {
  constructor(private readonly scraperService: ScraperService) {}

  async execute(job: Job): Promise<void> {
    console.log(`[SCRAPE_EXECUTOR] Starting job: ${job.id} (type: ${job.type})`);

    const startTime = Date.now();

    try {
      if (job.type === 'SCRAPE_ALL') {
        const result = await this.executeAll();
        this.logResult(job.id, result, startTime);

        // 全て失敗した場合はエラーをthrow
        if (result.successCount === 0 && result.failedCount > 0) {
          throw new Error(
            `All accounts failed to scrape: ${result.errors
              .map((e) => `${e.accountId}: ${e.message}`)
              .join(', ')}`
          );
        }
      } else if (job.type === 'SCRAPE_SPECIFIC' && job.targetAccountId) {
        await this.executeSpecific(job.targetAccountId);
      } else {
        throw new Error(`Unknown job type: ${job.type}`);
      }
    } catch (error) {
      console.error(`[SCRAPE_EXECUTOR] Job ${job.id} failed:`, error);
      throw error;
    }
  }

  private async executeAll(): Promise<ScrapeExecutorResult> {
    const { results, errors } = await this.scraperService.scrapeAllAccounts();

    const transactionsAdded = results.reduce(
      (sum, r) => sum + r.transactionsAdded,
      0
    );
    const transactionsSkipped = results.reduce(
      (sum, r) => sum + r.transactionsSkipped,
      0
    );

    return {
      jobId: '',
      totalAccounts: results.length + errors.length,
      successCount: results.length,
      failedCount: errors.length,
      transactionsAdded,
      transactionsSkipped,
      results,
      errors,
    };
  }

  private async executeSpecific(accountId: number): Promise<void> {
    const result = await this.scraperService.scrapeAccount(accountId);

    if (!result.success) {
      throw new Error(
        `Account ${accountId} scrape failed: ${result.error.message}`
      );
    }

    console.log(
      `[SCRAPE_EXECUTOR] Account ${accountId}: ` +
        `added ${result.data.transactionsAdded}, ` +
        `skipped ${result.data.transactionsSkipped}`
    );
  }

  private logResult(
    jobId: string,
    result: ScrapeExecutorResult,
    startTime: number
  ): void {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(
      `[SCRAPE_EXECUTOR] Job ${jobId} completed in ${duration}s: ` +
        `${result.successCount}/${result.totalAccounts} accounts, ` +
        `${result.transactionsAdded} added, ${result.transactionsSkipped} skipped`
    );

    if (result.errors.length > 0) {
      console.warn(
        `[SCRAPE_EXECUTOR] Errors: ` +
          result.errors.map((e) => `${e.accountId}:${e.errorType}`).join(', ')
      );
    }
  }
}
