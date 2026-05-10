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

  /**
   * OTP対応スクレイパーのモック生成ヘルパー。
   *
   * 新しい設計では BaseScraper.scrapeWithOtpCallback が
   *   1. login → detectOtpScreen を内部で実行
   *   2. OTP 検知時は onOtpRequired(detection) を呼ぶ
   *   3. waitForOtp で OTP 入力を待ち、submitOtp で送信
   * を一気通貫で実施する。テストではこのメソッドをモックして
   * 「検知シナリオ」と「待機シナリオ」を再現する。
   */
  const createOtpEnabledMockScraper = (
    overrides: {
      otpDetection?: OtpDetectionResult;
      // OTP 検知時に呼ばれるコールバックの結果に応じて scrape 結果を変える
      scrapeWithOtpCallback?: (
        credentials: DecryptedCredentials,
        onOtpRequired: (detection: OtpDetectionResult) => Promise<void>
      ) => Promise<ScrapeResult>;
      submitOtpCode?: (otp: string) => void;
      cancelOtp?: () => void;
    } = {}
  ) => {
    const detection: OtpDetectionResult = overrides.otpDetection ?? {
      detected: false,
      authMethod: null,
      otpInputSelector: null,
      otpSubmitSelector: null,
    };

    // emitter-style: callback を受け、OTP が submit されるまで待つ簡易実装
    let resolveOtp: ((otp: string) => void) | null = null;
    let rejectOtp: ((err: Error) => void) | null = null;
    // Promise を「先行して」作っておき、onOtpRequired 内で同期的に
    // submitOtpCode が呼ばれても取りこぼさないようにする
    const otpAwaiter = new Promise<string>((resolve, reject) => {
      resolveOtp = resolve;
      rejectOtp = reject;
    });

    const scraper = {
      ...mockScraper,
      submitOtpCode: vi.fn((otp: string) => {
        if (resolveOtp) resolveOtp(otp);
      }),
      cancelOtp: vi.fn(() => {
        if (rejectOtp) rejectOtp(new Error('OTP_CANCELLED'));
      }),
      isSessionActive: vi.fn().mockReturnValue(true),
      getPage: vi.fn().mockReturnValue({}),
      scrapeWithOtpCallback:
        overrides.scrapeWithOtpCallback ??
        vi.fn(async (_credentials, onOtpRequired) => {
          if (detection.detected) {
            await onOtpRequired(detection);
            // submitOtpCode/cancelOtp が呼ばれるまで待つ
            await otpAwaiter;
          }
          return mockScrapeResult;
        }),
      ...overrides,
    };

    return scraper;
  };

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

    const otpDetectedTotp: OtpDetectionResult = {
      detected: true,
      authMethod: 'TOTP',
      otpInputSelector: '#otp-input',
      otpSubmitSelector: '#otp-submit',
    };

    it('should detect OTP screen and trigger notification when TOTP secret is not registered', async () => {
      const otpEnabledScraper = createOtpEnabledMockScraper({
        otpDetection: otpDetectedTotp,
      });
      vi.mocked(mockScraperFactory.getScraper).mockReturnValue(
        otpEnabledScraper as unknown as Scraper
      );

      const scrapePromise = scraperService.scrapeAccountWithOtp(1, otpScrapingContext);

      // Allow the callback registration to settle
      await new Promise((resolve) => setTimeout(resolve, 10));

      const callbacks = scraperService.getOtpCallbacks();
      const callback = callbacks.get('job-1');
      expect(callback).toBeDefined();

      // Manual OTP path: setWaitingForOtp + push notification must have fired
      expect(mockJobService.setWaitingForOtp).toHaveBeenCalledWith('job-1', 'TOTP');
      expect(mockPushNotificationService.sendOtpRequiredNotification).toHaveBeenCalledWith(
        'job-1',
        1,
        '楽天銀行',
        'TOTP'
      );

      // Submit OTP and wait for scrape to complete
      callback?.submit('123456');
      await scrapePromise;

      expect(otpEnabledScraper.submitOtpCode).toHaveBeenCalledWith('123456');
    });

    it('should auto-generate and submit OTP when TOTP secret is registered', async () => {
      vi.mocked(mockTotpService.generateOtp).mockResolvedValue('654321');
      vi.mocked(mockTotpService.hasSecret).mockResolvedValue(true);

      const otpEnabledScraper = createOtpEnabledMockScraper({
        otpDetection: otpDetectedTotp,
      });
      vi.mocked(mockScraperFactory.getScraper).mockReturnValue(
        otpEnabledScraper as unknown as Scraper
      );

      const result = await scraperService.scrapeAccountWithOtp(1, otpScrapingContext);

      expect(result.success).toBe(true);
      // Auto-fill must NOT trigger setWaitingForOtp or push notification
      expect(mockJobService.setWaitingForOtp).not.toHaveBeenCalled();
      expect(mockPushNotificationService.sendOtpRequiredNotification).not.toHaveBeenCalled();
      expect(otpEnabledScraper.submitOtpCode).toHaveBeenCalledWith('654321');
    });

    it('should not trigger OTP flow when no OTP screen is detected', async () => {
      const noOtpScraper = createOtpEnabledMockScraper({
        otpDetection: {
          detected: false,
          authMethod: null,
          otpInputSelector: null,
          otpSubmitSelector: null,
        },
      });
      vi.mocked(mockScraperFactory.getScraper).mockReturnValue(
        noOtpScraper as unknown as Scraper
      );

      const result = await scraperService.scrapeAccountWithOtp(1, otpScrapingContext);

      expect(result.success).toBe(true);
      expect(mockJobService.setWaitingForOtp).not.toHaveBeenCalled();
      expect(mockPushNotificationService.sendOtpRequiredNotification).not.toHaveBeenCalled();
    });

    it('should register OTP callback and remove it after OTP submission', async () => {
      const otpEnabledScraper = createOtpEnabledMockScraper({
        otpDetection: { ...otpDetectedTotp, authMethod: 'SMS' },
      });
      vi.mocked(mockScraperFactory.getScraper).mockReturnValue(
        otpEnabledScraper as unknown as Scraper
      );

      const scrapePromise = scraperService.scrapeAccountWithOtp(1, otpScrapingContext);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const callbacks = scraperService.getOtpCallbacks();
      expect(callbacks.has('job-1')).toBe(true);

      callbacks.get('job-1')?.submit('123456');
      await scrapePromise;

      expect(callbacks.has('job-1')).toBe(false);
    });

    it('should handle OTP cancellation', async () => {
      const otpEnabledScraper = createOtpEnabledMockScraper({
        otpDetection: otpDetectedTotp,
      });
      vi.mocked(mockScraperFactory.getScraper).mockReturnValue(
        otpEnabledScraper as unknown as Scraper
      );

      const scrapePromise = scraperService.scrapeAccountWithOtp(1, otpScrapingContext);

      await new Promise((resolve) => setTimeout(resolve, 10));

      scraperService.getOtpCallbacks().get('job-1')?.cancel();

      const result = await scrapePromise;

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errorType).toBe('TWO_FACTOR_REQUIRED');
      }
    });

    it('should resume scraping after successful OTP submission', async () => {
      const otpEnabledScraper = createOtpEnabledMockScraper({
        otpDetection: otpDetectedTotp,
      });
      vi.mocked(mockScraperFactory.getScraper).mockReturnValue(
        otpEnabledScraper as unknown as Scraper
      );

      const scrapePromise = scraperService.scrapeAccountWithOtp(1, otpScrapingContext);

      await new Promise((resolve) => setTimeout(resolve, 10));

      scraperService.getOtpCallbacks().get('job-1')?.submit('123456');
      await scrapePromise;

      // updateStatus('running') is fired (best-effort, fire-and-forget) after OTP submit
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockJobService.updateStatus).toHaveBeenCalledWith('job-1', 'running');
    });

    it('aborts with OTP_TIMEOUT when waitForOtp times out (no callback fires)', async () => {
      // Simulate scrapeWithOtpCallback that times out internally
      const otpEnabledScraper = createOtpEnabledMockScraper({
        otpDetection: otpDetectedTotp,
        scrapeWithOtpCallback: vi.fn(async (_creds, onOtpRequired) => {
          await onOtpRequired(otpDetectedTotp);
          throw new Error('OTP_TIMEOUT');
        }),
      });
      vi.mocked(mockScraperFactory.getScraper).mockReturnValue(
        otpEnabledScraper as unknown as Scraper
      );

      const result = await scraperService.scrapeAccountWithOtp(1, otpScrapingContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errorType).toBe('OTP_TIMEOUT');
      }
    });
  });
});
