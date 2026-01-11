import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScrapeExecutor } from './scrape-executor.js';
import type { ScraperService, ScrapeSingleResult } from './scraper.service.js';
import type { Job } from '@prisma/client';
import type { ScrapeAccountError } from './scraper.types.js';

describe('ScrapeExecutor', () => {
  let executor: ScrapeExecutor;
  let mockScraperService: ScraperService;

  const createMockJob = (overrides: Partial<Job> = {}): Job => ({
    id: 'test-job-id',
    type: 'SCRAPE_ALL',
    status: 'running',
    targetAccountId: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const createMockResult = (
    overrides: Partial<ScrapeSingleResult> = {}
  ): ScrapeSingleResult => ({
    accountId: 1,
    transactionsAdded: 5,
    transactionsSkipped: 2,
    newBalance: 100000,
    ...overrides,
  });

  beforeEach(() => {
    mockScraperService = {
      scrapeAllAccounts: vi.fn().mockResolvedValue({
        results: [createMockResult()],
        errors: [],
      }),
      scrapeAccount: vi.fn().mockResolvedValue({
        success: true,
        data: createMockResult(),
      }),
    } as unknown as ScraperService;

    executor = new ScrapeExecutor(mockScraperService);
  });

  describe('execute with SCRAPE_ALL', () => {
    it('should scrape all accounts', async () => {
      const job = createMockJob({ type: 'SCRAPE_ALL' });

      await executor.execute(job);

      expect(mockScraperService.scrapeAllAccounts).toHaveBeenCalled();
    });

    it('should complete successfully when some accounts fail', async () => {
      const error: ScrapeAccountError = {
        accountId: 2,
        errorType: 'AUTH_FAILED',
        message: 'Login failed',
      };

      vi.mocked(mockScraperService.scrapeAllAccounts).mockResolvedValue({
        results: [createMockResult({ accountId: 1 })],
        errors: [error],
      });

      const job = createMockJob({ type: 'SCRAPE_ALL' });

      // Should not throw because at least one succeeded
      await expect(executor.execute(job)).resolves.toBeUndefined();
    });

    it('should throw error when all accounts fail', async () => {
      const errors: ScrapeAccountError[] = [
        { accountId: 1, errorType: 'AUTH_FAILED', message: 'Login failed' },
        { accountId: 2, errorType: 'NETWORK_ERROR', message: 'Timeout' },
      ];

      vi.mocked(mockScraperService.scrapeAllAccounts).mockResolvedValue({
        results: [],
        errors,
      });

      const job = createMockJob({ type: 'SCRAPE_ALL' });

      await expect(executor.execute(job)).rejects.toThrow(
        'All accounts failed to scrape'
      );
    });

    it('should complete successfully when no accounts exist', async () => {
      vi.mocked(mockScraperService.scrapeAllAccounts).mockResolvedValue({
        results: [],
        errors: [],
      });

      const job = createMockJob({ type: 'SCRAPE_ALL' });

      // No accounts means no errors, should complete
      await expect(executor.execute(job)).resolves.toBeUndefined();
    });
  });

  describe('execute with SCRAPE_SPECIFIC', () => {
    it('should scrape specific account', async () => {
      const job = createMockJob({
        type: 'SCRAPE_SPECIFIC',
        targetAccountId: 123,
      });

      await executor.execute(job);

      expect(mockScraperService.scrapeAccount).toHaveBeenCalledWith(123);
    });

    it('should throw error when account scrape fails', async () => {
      vi.mocked(mockScraperService.scrapeAccount).mockResolvedValue({
        success: false,
        error: {
          accountId: 123,
          errorType: 'AUTH_FAILED',
          message: 'Invalid password',
        },
      });

      const job = createMockJob({
        type: 'SCRAPE_SPECIFIC',
        targetAccountId: 123,
      });

      await expect(executor.execute(job)).rejects.toThrow('Invalid password');
    });
  });

  describe('execute with unknown job type', () => {
    it('should throw error for unknown job type', async () => {
      const job = createMockJob({ type: 'UNKNOWN_TYPE' });

      await expect(executor.execute(job)).rejects.toThrow('Unknown job type');
    });
  });
});
