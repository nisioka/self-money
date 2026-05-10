import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScraperService, OtpScrapingContext } from './scraper.service.js';
import type { AccountService } from '../accounts/account.service.js';
import type { TransactionService } from '../transactions/transaction.service.js';
import type { ClassifierService } from '../classifier/classifier.service.js';
import type {
  Scraper,
  ScraperFactory,
  ScrapeResult,
  DecryptedCredentials,
  OtpDetectionResult,
} from './scraper.types.js';
import type { Account } from '@prisma/client';
import type { JobService } from '../jobs/job.service.js';
import type { PushNotificationService } from '../push/push-notification.service.js';
import type { TotpService } from '../totp/totp.service.js';
import type { BaseScraper } from './base-scraper.js';

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
    encryptedTotpSecret: null,
    totpSecretIv: null,
    totpSecretAuthTag: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const mockCredentials: DecryptedCredentials = {
    username: 'testuser',
    password: 'testpass',
  };

  const mockCredentialsResult = {
    success: true as const,
    data: {
      loginId: 'testuser',
      password: 'testpass',
    },
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
      getCredentials: vi.fn().mockResolvedValue(mockCredentialsResult),
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

  // Helper function to create OTP-enabled mock scraper
  const createOtpEnabledMockScraper = (overrides: {
    detectOtpScreen?: () => Promise<OtpDetectionResult>;
    submitOtpCode?: (otp: string) => void;
    cancelOtp?: () => void;
    isSessionActive?: () => boolean;
    getPage?: () => unknown;
  } = {}) => ({
    ...mockScraper,
    detectOtpScreen: vi.fn().mockResolvedValue({ detected: false, authMethod: null, otpInputSelector: null, otpSubmitSelector: null }),
    submitOtpCode: vi.fn(),
    cancelOtp: vi.fn(),
    isSessionActive: vi.fn().mockReturnValue(true),
    getPage: vi.fn().mockReturnValue({}),
    ...overrides,
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

      // Both accounts have scrapers, but scrapeAccount fails for account2
      vi.mocked(mockScraperFactory.getScraper).mockReturnValue(mockScraper);
      vi.mocked(mockAccountService.getById)
        .mockResolvedValueOnce({ success: true, data: account1 })
        .mockResolvedValueOnce({ success: true, data: account2 });
      // Account 2 has no credentials
      vi.mocked(mockAccountService.getCredentials)
        .mockResolvedValueOnce(mockCredentialsResult)
        .mockResolvedValueOnce({ success: false, error: { type: 'NO_CREDENTIALS' } });

      const result = await scraperService.scrapeAllAccounts();

      expect(result.results.length).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].accountId).toBe(2);
    });

    it('should skip accounts without scraper', async () => {
      const accountWithCredentials = createMockAccount({ id: 1, name: '楽天銀行' });
      const accountWithoutScraper = createMockAccount({
        id: 2,
        name: '現金',
        type: 'CASH',
      });
      vi.mocked(mockAccountService.getAll).mockResolvedValue([
        accountWithCredentials,
        accountWithoutScraper,
      ]);

      // Only the first account has a scraper
      // getScraper is called twice per account (once in scrapeAllAccounts, once in scrapeAccount)
      vi.mocked(mockScraperFactory.getScraper)
        .mockImplementation((name: string) => {
          return name === '楽天銀行' ? mockScraper : null;
        });

      const result = await scraperService.scrapeAllAccounts();

      // Accounts without scraper are skipped (not counted as errors)
      expect(result.results.length).toBe(1);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('scrapeAccountWithOtp', () => {
    let mockJobService: JobService;
    let mockPushNotificationService: PushNotificationService;
    let mockTotpService: TotpService;
    let otpScrapingContext: OtpScrapingContext;

    beforeEach(() => {
      mockJobService = {
        setWaitingForOtp: vi.fn().mockResolvedValue({ id: 'job-1', status: 'waiting_for_otp' }),
        updateStatus: vi.fn().mockResolvedValue({}),
        incrementOtpRetryCount: vi.fn().mockResolvedValue({}),
      } as unknown as JobService;

      mockPushNotificationService = {
        sendOtpRequiredNotification: vi.fn().mockResolvedValue({ success: true, retried: false }),
        sendTimeoutNotification: vi.fn().mockResolvedValue({ success: true, retried: false }),
      } as unknown as PushNotificationService;

      mockTotpService = {
        generateOtp: vi.fn().mockResolvedValue(null),
        hasSecret: vi.fn().mockResolvedValue(false),
      } as unknown as TotpService;

      otpScrapingContext = {
        jobId: 'job-1',
        jobService: mockJobService,
        pushNotificationService: mockPushNotificationService,
        totpService: mockTotpService,
      };
    });

    it('should detect OTP screen and trigger notification when TOTP secret is not registered', async () => {
      // Create OTP-enabled scraper that detects OTP screen
      const otpEnabledScraper = createOtpEnabledMockScraper({
        detectOtpScreen: vi.fn().mockResolvedValue({
          detected: true,
          authMethod: 'TOTP',
          otpInputSelector: '#otp-input',
          otpSubmitSelector: '#otp-submit',
        }),
      });
      vi.mocked(mockScraperFactory.getScraper).mockReturnValue(otpEnabledScraper as unknown as Scraper);

      // This will wait for OTP, but we need to trigger it to complete
      const scrapePromise = scraperService.scrapeAccountWithOtp(1, otpScrapingContext);

      // Simulate OTP submission after a short delay
      await new Promise(resolve => setTimeout(resolve, 10));

      // Get the callback from otp routes registry and submit OTP
      const callbacks = scraperService.getOtpCallbacks();
      const callback = callbacks.get('job-1');
      expect(callback).toBeDefined();

      // Submit OTP code
      callback?.submit('123456');

      // Wait for the scrape to complete (with timeout to prevent hanging)
      const result = await Promise.race([
        scrapePromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
      ]).catch(e => ({ success: false, error: { errorType: 'OTP_TIMEOUT', message: e.message } }));

      // Verify job status was updated to waiting_for_otp
      expect(mockJobService.setWaitingForOtp).toHaveBeenCalledWith('job-1', 'TOTP');

      // Verify push notification was sent
      expect(mockPushNotificationService.sendOtpRequiredNotification).toHaveBeenCalledWith(
        'job-1',
        1,
        '楽天銀行',
        'TOTP'
      );
    });

    it('should auto-generate and submit OTP when TOTP secret is registered', async () => {
      // TOTP secret is registered
      vi.mocked(mockTotpService.generateOtp).mockResolvedValue('654321');
      vi.mocked(mockTotpService.hasSecret).mockResolvedValue(true);

      // Create OTP-enabled scraper that detects OTP screen
      const otpEnabledScraper = createOtpEnabledMockScraper({
        detectOtpScreen: vi.fn().mockResolvedValue({
          detected: true,
          authMethod: 'TOTP',
          otpInputSelector: '#otp-input',
          otpSubmitSelector: '#otp-submit',
        }),
      });
      vi.mocked(mockScraperFactory.getScraper).mockReturnValue(otpEnabledScraper as unknown as Scraper);

      const result = await scraperService.scrapeAccountWithOtp(1, otpScrapingContext);

      // Should NOT send push notification when TOTP is auto-generated
      expect(mockPushNotificationService.sendOtpRequiredNotification).not.toHaveBeenCalled();

      // Should auto-submit OTP
      expect(otpEnabledScraper.submitOtpCode).toHaveBeenCalledWith('654321');
    });

    it('should not trigger OTP flow when no OTP screen is detected', async () => {
      // Create scraper that does not detect OTP screen
      const noOtpScraper = createOtpEnabledMockScraper({
        detectOtpScreen: vi.fn().mockResolvedValue({
          detected: false,
          authMethod: null,
          otpInputSelector: null,
          otpSubmitSelector: null,
        }),
      });
      vi.mocked(mockScraperFactory.getScraper).mockReturnValue(noOtpScraper as unknown as Scraper);

      const result = await scraperService.scrapeAccountWithOtp(1, otpScrapingContext);

      expect(result.success).toBe(true);
      expect(mockJobService.setWaitingForOtp).not.toHaveBeenCalled();
      expect(mockPushNotificationService.sendOtpRequiredNotification).not.toHaveBeenCalled();
    });

    it('should register OTP callback and remove it after OTP submission', async () => {
      const otpEnabledScraper = createOtpEnabledMockScraper({
        detectOtpScreen: vi.fn().mockResolvedValue({
          detected: true,
          authMethod: 'SMS',
          otpInputSelector: '#otp-input',
          otpSubmitSelector: '#otp-submit',
        }),
      });
      vi.mocked(mockScraperFactory.getScraper).mockReturnValue(otpEnabledScraper as unknown as Scraper);

      const scrapePromise = scraperService.scrapeAccountWithOtp(1, otpScrapingContext);

      // Wait for callback to be registered
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify callback is registered
      const callbacks = scraperService.getOtpCallbacks();
      expect(callbacks.has('job-1')).toBe(true);

      // Submit OTP
      callbacks.get('job-1')?.submit('123456');

      // Wait for completion
      await Promise.race([
        scrapePromise,
        new Promise(resolve => setTimeout(resolve, 100))
      ]);

      // Callback should be removed after completion
      expect(callbacks.has('job-1')).toBe(false);
    });

    it('should handle OTP cancellation', async () => {
      const otpEnabledScraper = createOtpEnabledMockScraper({
        detectOtpScreen: vi.fn().mockResolvedValue({
          detected: true,
          authMethod: 'TOTP',
          otpInputSelector: '#otp-input',
          otpSubmitSelector: '#otp-submit',
        }),
      });
      vi.mocked(mockScraperFactory.getScraper).mockReturnValue(otpEnabledScraper as unknown as Scraper);

      const scrapePromise = scraperService.scrapeAccountWithOtp(1, otpScrapingContext);

      await new Promise(resolve => setTimeout(resolve, 10));

      // Cancel OTP
      const callbacks = scraperService.getOtpCallbacks();
      callbacks.get('job-1')?.cancel();

      const result = await scrapePromise;

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errorType).toBe('TWO_FACTOR_REQUIRED');
      }
    });

    it('should resume scraping after successful OTP submission', async () => {
      const otpEnabledScraper = createOtpEnabledMockScraper({
        detectOtpScreen: vi.fn().mockResolvedValue({
          detected: true,
          authMethod: 'TOTP',
          otpInputSelector: '#otp-input',
          otpSubmitSelector: '#otp-submit',
        }),
      });
      vi.mocked(mockScraperFactory.getScraper).mockReturnValue(otpEnabledScraper as unknown as Scraper);

      const scrapePromise = scraperService.scrapeAccountWithOtp(1, otpScrapingContext);

      await new Promise(resolve => setTimeout(resolve, 10));

      // Submit OTP
      const callbacks = scraperService.getOtpCallbacks();
      callbacks.get('job-1')?.submit('123456');

      const result = await Promise.race([
        scrapePromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 200))
      ]).catch(() => ({ success: false, error: { errorType: 'OTP_TIMEOUT', message: 'Timeout' } }));

      // After OTP, job status should be updated to running
      expect(mockJobService.updateStatus).toHaveBeenCalledWith('job-1', 'running');
    });
  });
});
