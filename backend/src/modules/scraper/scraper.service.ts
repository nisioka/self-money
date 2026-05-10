import type { AccountService } from '../accounts/account.service.js';
import type { TransactionService } from '../transactions/transaction.service.js';
import type { ClassifierService } from '../classifier/classifier.service.js';
import type { JobService, OtpAuthMethod } from '../jobs/job.service.js';
import type { PushNotificationService } from '../push/push-notification.service.js';
import type { TotpService } from '../totp/totp.service.js';
import type {
  ScraperFactory,
  ScrapeResult,
  ScrapeAccountError,
  ScrapeAllResult,
  ScrapedTransaction,
  OtpDetectionResult,
} from './scraper.types.js';
import type { BaseScraper } from './base-scraper.js';
import { otpCallbacks } from './otp.routes.js';

export interface ScrapeSingleResult {
  accountId: number;
  transactionsAdded: number;
  transactionsSkipped: number;
  newBalance: number;
}

/**
 * OTPスクレイピングに必要なコンテキスト
 */
export interface OtpScrapingContext {
  jobId: string;
  jobService: JobService;
  pushNotificationService: PushNotificationService;
  totpService: TotpService;
}

type Result<T, E> = { success: true; data: T } | { success: false; error: E };

export class ScraperService {
  constructor(
    private readonly accountService: AccountService,
    private readonly transactionService: TransactionService,
    private readonly classifierService: ClassifierService,
    private readonly scraperFactory: ScraperFactory
  ) {}

  async scrapeAccount(
    accountId: number
  ): Promise<Result<ScrapeSingleResult, ScrapeAccountError>> {
    // Get account
    const accountResult = await this.accountService.getById(accountId);
    if (!accountResult.success) {
      return {
        success: false,
        error: {
          accountId,
          errorType: 'NETWORK_ERROR',
          message: 'Account not found',
        },
      };
    }

    const account = accountResult.data;

    // Check credentials
    if (!account.encryptedCredentials) {
      return {
        success: false,
        error: {
          accountId,
          errorType: 'NO_CREDENTIALS',
          message: '認証情報が設定されていません',
        },
      };
    }

    // Get scraper
    const scraper = this.scraperFactory.getScraper(account.name);
    if (!scraper) {
      return {
        success: false,
        error: {
          accountId,
          errorType: 'SITE_CHANGED',
          message: `スクレイパーが見つかりません: ${account.name}`,
        },
      };
    }

    try {
      // Get decrypted credentials
      const credentialsResult = await this.accountService.getCredentials(accountId);
      if (!credentialsResult.success) {
        return {
          success: false,
          error: {
            accountId,
            errorType: 'NO_CREDENTIALS',
            message: '認証情報の復号に失敗しました',
          },
        };
      }

      // Convert credentials to scraper format
      const credentials = {
        username: credentialsResult.data.loginId,
        password: credentialsResult.data.password,
        additionalFields: credentialsResult.data.additionalFields,
      };

      // Execute scraping
      const scrapeResult = await scraper.scrape(credentials);

      // Process transactions
      let transactionsAdded = 0;
      let transactionsSkipped = 0;

      for (const tx of scrapeResult.transactions) {
        // Check for duplicates
        const existing = await this.transactionService.findByExternalId(
          tx.externalId
        );
        if (existing) {
          transactionsSkipped++;
          continue;
        }

        // Classify the transaction
        const classification = await this.classifierService.classify(
          tx.description
        );

        // Create transaction
        await this.transactionService.create({
          date: tx.date,
          amount: tx.amount,
          description: tx.description,
          categoryId: classification.categoryId,
          accountId: accountId,
          isManual: false,
          externalId: tx.externalId,
        });

        transactionsAdded++;
      }

      // Update account balance
      await this.accountService.updateBalance(accountId, scrapeResult.balance);

      return {
        success: true,
        data: {
          accountId,
          transactionsAdded,
          transactionsSkipped,
          newBalance: scrapeResult.balance,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: {
          accountId,
          errorType: 'AUTH_FAILED',
          message,
        },
      };
    }
  }

  async scrapeAllAccounts(): Promise<{
    results: ScrapeSingleResult[];
    errors: ScrapeAccountError[];
  }> {
    const accounts = await this.accountService.getAll();
    const results: ScrapeSingleResult[] = [];
    const errors: ScrapeAccountError[] = [];

    for (const account of accounts) {
      // Check if account has credentials by trying to get scraper
      // CASH type accounts won't have a scraper
      const scraper = this.scraperFactory.getScraper(account.name);
      if (!scraper) {
        continue;
      }

      const result = await this.scrapeAccount(account.id);
      if (result.success) {
        results.push(result.data);
      } else {
        errors.push(result.error);
      }
    }

    return { results, errors };
  }

  /**
   * OTP対応のスクレイピングを実行する
   * OTP画面を検知した場合、以下の処理を行う：
   * 1. TOTPシークレットが登録済みの場合は自動でOTPを生成・入力
   * 2. 未登録の場合はPush通知を送信し、ユーザーからのOTP入力を待機
   */
  async scrapeAccountWithOtp(
    accountId: number,
    context: OtpScrapingContext
  ): Promise<Result<ScrapeSingleResult, ScrapeAccountError>> {
    const { jobId, jobService, pushNotificationService, totpService } = context;

    // Get account
    const accountResult = await this.accountService.getById(accountId);
    if (!accountResult.success) {
      return {
        success: false,
        error: {
          accountId,
          errorType: 'NETWORK_ERROR',
          message: 'Account not found',
        },
      };
    }

    const account = accountResult.data;

    // Check credentials
    if (!account.encryptedCredentials) {
      return {
        success: false,
        error: {
          accountId,
          errorType: 'NO_CREDENTIALS',
          message: '認証情報が設定されていません',
        },
      };
    }

    // Get scraper (must be BaseScraper for OTP support)
    const scraper = this.scraperFactory.getScraper(account.name);
    if (!scraper) {
      return {
        success: false,
        error: {
          accountId,
          errorType: 'SITE_CHANGED',
          message: `スクレイパーが見つかりません: ${account.name}`,
        },
      };
    }

    // Check if scraper supports OTP (has detectOtpScreen method)
    const otpScraper = scraper as BaseScraper;
    if (typeof otpScraper.submitOtpCode !== 'function') {
      // Fall back to regular scraping if OTP is not supported
      return this.scrapeAccount(accountId);
    }

    try {
      // Get decrypted credentials
      const credentialsResult = await this.accountService.getCredentials(accountId);
      if (!credentialsResult.success) {
        return {
          success: false,
          error: {
            accountId,
            errorType: 'NO_CREDENTIALS',
            message: '認証情報の復号に失敗しました',
          },
        };
      }

      // Convert credentials to scraper format
      const credentials = {
        username: credentialsResult.data.loginId,
        password: credentialsResult.data.password,
        additionalFields: credentialsResult.data.additionalFields,
      };

      // Start scraping (this will handle login and potentially detect OTP)
      const scrapeResult = await this.scrapeWithOtpHandling(
        otpScraper,
        credentials,
        account.id,
        account.name,
        context
      );

      // Process transactions
      let transactionsAdded = 0;
      let transactionsSkipped = 0;

      for (const tx of scrapeResult.transactions) {
        // Check for duplicates
        const existing = await this.transactionService.findByExternalId(
          tx.externalId
        );
        if (existing) {
          transactionsSkipped++;
          continue;
        }

        // Classify the transaction
        const classification = await this.classifierService.classify(
          tx.description
        );

        // Create transaction
        await this.transactionService.create({
          date: tx.date,
          amount: tx.amount,
          description: tx.description,
          categoryId: classification.categoryId,
          accountId: accountId,
          isManual: false,
          externalId: tx.externalId,
        });

        transactionsAdded++;
      }

      // Update account balance
      await this.accountService.updateBalance(accountId, scrapeResult.balance);

      return {
        success: true,
        data: {
          accountId,
          transactionsAdded,
          transactionsSkipped,
          newBalance: scrapeResult.balance,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      // Check for specific OTP-related errors
      if (message === 'OTP_CANCELLED') {
        return {
          success: false,
          error: {
            accountId,
            errorType: 'TWO_FACTOR_REQUIRED',
            message: 'OTPがキャンセルされました',
          },
        };
      }
      if (message === 'OTP_TIMEOUT') {
        return {
          success: false,
          error: {
            accountId,
            errorType: 'OTP_TIMEOUT',
            message: 'OTP入力がタイムアウトしました',
          },
        };
      }
      if (message === 'OTP_MAX_RETRIES') {
        return {
          success: false,
          error: {
            accountId,
            errorType: 'OTP_MAX_RETRIES',
            message: 'OTP入力が複数回失敗しました',
          },
        };
      }

      return {
        success: false,
        error: {
          accountId,
          errorType: 'AUTH_FAILED',
          message,
        },
      };
    }
  }

  /**
   * OTP処理を含むスクレイピングを実行する内部メソッド
   *
   * このメソッドは以下のフローを実行します:
   * 1. スクレイパーのdetectOtpScreenを呼び出してOTP検知を行う
   * 2. OTPが検知された場合、TOTPシークレットがあれば自動生成
   * 3. TOTPシークレットがない場合、Push通知を送信してユーザー入力を待機
   * 4. OTPが入力されたら、スクレイパーに渡してスクレイピングを再開
   */
  private async scrapeWithOtpHandling(
    scraper: BaseScraper,
    credentials: { username: string; password: string; additionalFields?: Record<string, string> },
    accountId: number,
    accountName: string,
    context: OtpScrapingContext
  ): Promise<ScrapeResult> {
    const { jobId, jobService, pushNotificationService, totpService } = context;

    // For OTP-enabled scrapers, use detectOtpScreen if available
    const detectOtpScreen = (scraper as any).detectOtpScreen;
    if (typeof detectOtpScreen !== 'function') {
      // Scraper doesn't support OTP detection, use normal scraping
      return scraper.scrape(credentials);
    }

    // Check OTP detection first (mock-friendly approach)
    const otpDetection: OtpDetectionResult = await detectOtpScreen.call(scraper, null);

    if (!otpDetection.detected) {
      // No OTP required, continue with normal scraping
      return scraper.scrape(credentials);
    }

    // OTP detected - handle it
    console.log(`[SCRAPER_SERVICE] OTP detected for account ${accountName}, method: ${otpDetection.authMethod}`);

    // Check if TOTP secret is registered and auth method is TOTP
    if (otpDetection.authMethod === 'TOTP') {
      const autoOtp = await totpService.generateOtp(accountId);
      if (autoOtp) {
        // Auto-submit TOTP
        console.log(`[SCRAPER_SERVICE] Auto-generating TOTP for account ${accountName}`);
        scraper.submitOtpCode(autoOtp);

        // Update job status to running
        await jobService.updateStatus(jobId, 'running');

        // Execute scraping after auto OTP submission
        return scraper.scrape(credentials);
      }
    }

    // No TOTP registered or auth method is not TOTP - need manual input
    // Update job status to waiting_for_otp
    await jobService.setWaitingForOtp(jobId, otpDetection.authMethod as OtpAuthMethod);

    // Send push notification
    await pushNotificationService.sendOtpRequiredNotification(
      jobId,
      accountId,
      accountName,
      otpDetection.authMethod as OtpAuthMethod
    );

    // Register OTP callback and wait for user input
    return new Promise<ScrapeResult>((resolve, reject) => {
      const callback = {
        submit: async (otp: string) => {
          console.log(`[SCRAPER_SERVICE] OTP received for job ${jobId}`);
          scraper.submitOtpCode(otp);

          // Update job status back to running
          try {
            await jobService.updateStatus(jobId, 'running');
          } catch (error) {
            console.error('[SCRAPER_SERVICE] Failed to update job status:', error);
          }

          // Clean up callback
          otpCallbacks.delete(jobId);

          // Execute scraping after OTP submission
          try {
            const result = await scraper.scrape(credentials);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        },
        cancel: () => {
          console.log(`[SCRAPER_SERVICE] OTP cancelled for job ${jobId}`);
          scraper.cancelOtp();

          // Clean up callback
          otpCallbacks.delete(jobId);

          reject(new Error('OTP_CANCELLED'));
        },
      };

      // Register callback
      otpCallbacks.set(jobId, callback);
    });
  }

  /**
   * OTPコールバックを取得する（主にテスト用）
   */
  getOtpCallbacks(): Map<string, { submit: (otp: string) => void; cancel: () => void }> {
    return otpCallbacks;
  }
}
