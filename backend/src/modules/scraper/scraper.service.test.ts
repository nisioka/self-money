import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScraperService } from './scraper.service.js';
import type { AccountService } from '../accounts/account.service.js';
import type { TransactionService } from '../transactions/transaction.service.js';
import type { ClassifierService } from '../classifier/classifier.service.js';
import type {
  Scraper,
  ScraperFactory,
  ScrapeResult,
  DecryptedCredentials,
} from './scraper.types.js';
import type { Account } from '@prisma/client';

describe('ScraperService', () => {
  let scraperService: ScraperService;
  let mockAccountService: AccountService;
  let mockTransactionService: TransactionService;
  let mockClassifierService: ClassifierService;
  let mockScraperFactory: ScraperFactory;
  let mockScraper: Scraper;

  const createMockAccount = (overrides: Partial<Account> = {}): Account => ({
    id: 1,
    name: '楽天銀行',
    type: 'BANK',
    balance: 100000,
    encryptedCredentials: 'encrypted',
    credentialsIv: 'iv',
    credentialsAuthTag: 'tag',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const mockCredentials: DecryptedCredentials = {
    username: 'testuser',
    password: 'testpass',
  };

  const mockScrapeResult: ScrapeResult = {
    accountId: 1,
    transactions: [
      {
        date: new Date('2026-01-10'),
        amount: -1000,
        description: 'スーパーマーケット',
        externalId: 'ext-001',
      },
      {
        date: new Date('2026-01-11'),
        amount: 50000,
        description: '給与振込',
        externalId: 'ext-002',
      },
    ],
    balance: 149000,
  };

  beforeEach(() => {
    mockAccountService = {
      getAll: vi.fn().mockResolvedValue([createMockAccount()]),
      getById: vi.fn().mockResolvedValue({ success: true, data: createMockAccount() }),
      getCredentials: vi.fn().mockResolvedValue(mockCredentials),
      updateBalance: vi.fn().mockResolvedValue(undefined),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as AccountService;

    mockTransactionService = {
      create: vi.fn().mockResolvedValue({ success: true, data: {} }),
      findByExternalId: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      delete: vi.fn(),
      findById: vi.fn(),
      findByMonth: vi.fn(),
      findByAccount: vi.fn(),
    } as unknown as TransactionService;

    mockClassifierService = {
      classify: vi.fn().mockResolvedValue({
        categoryId: 8,
        categoryName: '食費',
        source: 'AI',
      }),
    } as unknown as ClassifierService;

    mockScraper = {
      getSupportedAccountName: vi.fn().mockReturnValue('楽天銀行'),
      scrape: vi.fn().mockResolvedValue(mockScrapeResult),
    };

    mockScraperFactory = {
      getScraper: vi.fn().mockReturnValue(mockScraper),
      getSupportedAccountNames: vi.fn().mockReturnValue(['楽天銀行']),
    };

    scraperService = new ScraperService(
      mockAccountService,
      mockTransactionService,
      mockClassifierService,
      mockScraperFactory
    );
  });

  describe('scrapeAccount', () => {
    it('should scrape account and return result', async () => {
      const result = await scraperService.scrapeAccount(1);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accountId).toBe(1);
        expect(result.data.transactionsAdded).toBe(2);
        expect(result.data.newBalance).toBe(149000);
      }
    });

    it('should return error when account not found', async () => {
      vi.mocked(mockAccountService.getById).mockResolvedValue({
        success: false,
        error: { type: 'NOT_FOUND' },
      });

      const result = await scraperService.scrapeAccount(999);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errorType).toBe('NETWORK_ERROR');
      }
    });

    it('should return error when no scraper available for account', async () => {
      vi.mocked(mockScraperFactory.getScraper).mockReturnValue(null);

      const result = await scraperService.scrapeAccount(1);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errorType).toBe('SITE_CHANGED');
        expect(result.error.message).toContain('スクレイパーが見つかりません');
      }
    });

    it('should return error when account has no credentials', async () => {
      const accountWithoutCredentials = createMockAccount({
        encryptedCredentials: null,
      });
      vi.mocked(mockAccountService.getById).mockResolvedValue({
        success: true,
        data: accountWithoutCredentials,
      });

      const result = await scraperService.scrapeAccount(1);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errorType).toBe('NO_CREDENTIALS');
      }
    });

    it('should skip duplicate transactions by externalId', async () => {
      vi.mocked(mockTransactionService.findByExternalId)
        .mockResolvedValueOnce({ id: 100 }) // 1つ目は既存
        .mockResolvedValueOnce(null); // 2つ目は新規

      const result = await scraperService.scrapeAccount(1);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.transactionsAdded).toBe(1);
        expect(result.data.transactionsSkipped).toBe(1);
      }
    });

    it('should classify transactions with classifier service', async () => {
      await scraperService.scrapeAccount(1);

      expect(mockClassifierService.classify).toHaveBeenCalledWith('スーパーマーケット');
      expect(mockClassifierService.classify).toHaveBeenCalledWith('給与振込');
    });

    it('should update account balance after scraping', async () => {
      await scraperService.scrapeAccount(1);

      expect(mockAccountService.updateBalance).toHaveBeenCalledWith(1, 149000);
    });

    it('should handle scraper errors gracefully', async () => {
      vi.mocked(mockScraper.scrape).mockRejectedValue(new Error('Login failed'));

      const result = await scraperService.scrapeAccount(1);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errorType).toBe('AUTH_FAILED');
        expect(result.error.message).toBe('Login failed');
      }
    });
  });

  describe('scrapeAllAccounts', () => {
    it('should scrape all accounts and return aggregated results', async () => {
      const result = await scraperService.scrapeAllAccounts();

      expect(result.results.length).toBe(1);
      expect(result.errors.length).toBe(0);
      expect(result.results[0].transactionsAdded).toBe(2);
    });

    it('should return error when no accounts exist', async () => {
      vi.mocked(mockAccountService.getAll).mockResolvedValue([]);

      const result = await scraperService.scrapeAllAccounts();

      expect(result.results.length).toBe(0);
      expect(result.errors.length).toBe(0);
    });

    it('should continue processing other accounts when one fails', async () => {
      const account1 = createMockAccount({ id: 1, name: '楽天銀行' });
      const account2 = createMockAccount({ id: 2, name: '三井住友銀行' });
      vi.mocked(mockAccountService.getAll).mockResolvedValue([account1, account2]);

      // 1つ目は成功、2つ目はスクレイパーがない
      vi.mocked(mockScraperFactory.getScraper)
        .mockReturnValueOnce(mockScraper)
        .mockReturnValueOnce(null);
      vi.mocked(mockAccountService.getById)
        .mockResolvedValueOnce({ success: true, data: account1 })
        .mockResolvedValueOnce({ success: true, data: account2 });

      const result = await scraperService.scrapeAllAccounts();

      expect(result.results.length).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].accountId).toBe(2);
    });

    it('should skip accounts without credentials', async () => {
      const accountWithCredentials = createMockAccount({ id: 1 });
      const accountWithoutCredentials = createMockAccount({
        id: 2,
        name: '現金',
        type: 'CASH',
        encryptedCredentials: null,
      });
      vi.mocked(mockAccountService.getAll).mockResolvedValue([
        accountWithCredentials,
        accountWithoutCredentials,
      ]);

      const result = await scraperService.scrapeAllAccounts();

      // 認証情報がない口座はスキップ（エラーとしてカウント）
      expect(result.results.length).toBe(1);
    });
  });
});
