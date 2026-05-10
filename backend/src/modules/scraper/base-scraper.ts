import { chromium, type Browser, type Page } from 'playwright';
import { EventEmitter } from 'events';
import type {
  Scraper,
  ScrapeResult,
  ScrapedTransaction,
  DecryptedCredentials,
  OtpDetectionResult,
  OtpSelectors,
  OtpAuthMethod,
} from './scraper.types.js';

// OTP timeout in milliseconds (5 minutes)
const OTP_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * 抽象ベーススクレイパー
 * 各金融機関のスクレイパーはこのクラスを継承して実装する
 */
export abstract class BaseScraper implements Scraper {
  protected browser: Browser | null = null;
  protected page: Page | null = null;
  protected otpEmitter = new EventEmitter();
  protected currentOtp: string | null = null;

  abstract getSupportedAccountName(): string;
  abstract getLoginUrl(): string;

  /**
   * ログイン処理を実装する
   */
  abstract login(
    page: Page,
    credentials: DecryptedCredentials
  ): Promise<void>;

  /**
   * 取引データを取得する
   */
  abstract fetchTransactions(page: Page): Promise<ScrapedTransaction[]>;

  /**
   * 残高を取得する
   */
  abstract fetchBalance(page: Page): Promise<number>;

  /**
   * スクレイピングを実行する
   */
  async scrape(credentials: DecryptedCredentials): Promise<ScrapeResult> {
    try {
      // ブラウザを起動
      this.browser = await chromium.launch({
        headless: true,
      });
      this.page = await this.browser.newPage();

      // ログインページにアクセス
      await this.page.goto(this.getLoginUrl(), {
        waitUntil: 'domcontentloaded',
      });

      // ログイン処理
      await this.login(this.page, credentials);

      // 取引データを取得
      const transactions = await this.fetchTransactions(this.page);

      // 残高を取得
      const balance = await this.fetchBalance(this.page);

      return {
        accountId: 0, // 呼び出し元で設定される
        transactions,
        balance,
      };
    } finally {
      // リソースをクリーンアップ
      await this.cleanup();
    }
  }

  /**
   * リソースをクリーンアップする
   */
  protected async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }

  /**
   * 日付文字列をDateオブジェクトに変換する
   * @param dateStr 日付文字列（例: "2026/01/11", "2026年1月11日"）
   */
  protected parseDate(dateStr: string): Date {
    // YYYY/MM/DD または YYYY-MM-DD 形式
    const slashMatch = dateStr.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (slashMatch) {
      return new Date(
        parseInt(slashMatch[1]!, 10),
        parseInt(slashMatch[2]!, 10) - 1,
        parseInt(slashMatch[3]!, 10)
      );
    }

    // YYYY年MM月DD日 形式
    const jpMatch = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (jpMatch) {
      return new Date(
        parseInt(jpMatch[1]!, 10),
        parseInt(jpMatch[2]!, 10) - 1,
        parseInt(jpMatch[3]!, 10)
      );
    }

    // MM/DD 形式（今年と仮定）
    const shortMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})/);
    if (shortMatch) {
      const now = new Date();
      return new Date(
        now.getFullYear(),
        parseInt(shortMatch[1]!, 10) - 1,
        parseInt(shortMatch[2]!, 10)
      );
    }

    throw new Error(`Unable to parse date: ${dateStr}`);
  }

  /**
   * 金額文字列を数値に変換する
   * @param amountStr 金額文字列（例: "1,000", "￥1,000", "-500円"）
   */
  protected parseAmount(amountStr: string): number {
    // カンマ、円記号、スペースを除去
    const cleaned = amountStr.replace(/[,￥¥円\s]/g, '');
    const amount = parseInt(cleaned, 10);
    if (isNaN(amount)) {
      throw new Error(`Unable to parse amount: ${amountStr}`);
    }
    return amount;
  }

  /**
   * 一意なexternalIdを生成する
   * @param date 日付
   * @param amount 金額
   * @param description 摘要
   * @param index 同日同額取引の識別用インデックス
   */
  protected generateExternalId(
    date: Date,
    amount: number,
    description: string,
    index = 0
  ): string {
    const dateStr = date.toISOString().split('T')[0];
    const accountName = this.getSupportedAccountName();
    // 簡易ハッシュとして摘要の先頭10文字を使用
    const descHash = description.slice(0, 10).replace(/\s/g, '');
    return `${accountName}-${dateStr}-${amount}-${descHash}-${index}`;
  }

  // OTP-related methods

  /**
   * OTPセレクターを取得する（サブクラスでオーバーライド）
   * @returns OTPセレクター定義、またはnull（OTP未対応の場合）
   */
  protected getOtpSelectors(): OtpSelectors | null {
    return null;
  }

  /**
   * OTP画面を検知する
   */
  protected async detectOtpScreen(page: Page): Promise<OtpDetectionResult> {
    const selectors = this.getOtpSelectors();
    if (!selectors) {
      return {
        detected: false,
        authMethod: null,
        otpInputSelector: null,
        otpSubmitSelector: null,
      };
    }

    // 検知セレクターをチェック
    for (const selector of selectors.detectionSelectors) {
      const element = await page.$(selector);
      if (element) {
        // 認証方式を判定
        let authMethod: OtpAuthMethod = 'TOTP'; // デフォルト
        if (selectors.authMethodSelectors) {
          for (const [method, methodSelector] of Object.entries(
            selectors.authMethodSelectors
          )) {
            const methodElement = await page.$(methodSelector);
            if (methodElement) {
              authMethod = method as OtpAuthMethod;
              break;
            }
          }
        }

        console.log(
          `[SCRAPER] OTP screen detected for ${this.getSupportedAccountName()}, method: ${authMethod}`
        );

        return {
          detected: true,
          authMethod,
          otpInputSelector: selectors.inputSelector,
          otpSubmitSelector: selectors.submitSelector,
        };
      }
    }

    return {
      detected: false,
      authMethod: null,
      otpInputSelector: null,
      otpSubmitSelector: null,
    };
  }

  /**
   * OTP入力を待機する
   */
  protected async waitForOtp(
    timeoutMs: number = OTP_TIMEOUT_MS
  ): Promise<{ success: boolean; otp: string | null; timedOut: boolean }> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.otpEmitter.removeAllListeners('otp');
        this.otpEmitter.removeAllListeners('cancel');
        resolve({ success: false, otp: null, timedOut: true });
      }, timeoutMs);

      this.otpEmitter.once('otp', (otp: string) => {
        clearTimeout(timeout);
        this.otpEmitter.removeAllListeners('cancel');
        resolve({ success: true, otp, timedOut: false });
      });

      this.otpEmitter.once('cancel', () => {
        clearTimeout(timeout);
        this.otpEmitter.removeAllListeners('otp');
        resolve({ success: false, otp: null, timedOut: false });
      });
    });
  }

  /**
   * OTPを送信する（外部から呼び出される）
   */
  public submitOtpCode(otp: string): void {
    console.log(`[SCRAPER] OTP code received for ${this.getSupportedAccountName()}`);
    this.otpEmitter.emit('otp', otp);
  }

  /**
   * OTPをキャンセルする（外部から呼び出される）
   */
  public cancelOtp(): void {
    console.log(`[SCRAPER] OTP cancelled for ${this.getSupportedAccountName()}`);
    this.otpEmitter.emit('cancel');
  }

  /**
   * OTPを金融機関サイトに入力する
   */
  protected async submitOtp(
    page: Page,
    otp: string,
    selectors: { input: string; submit: string }
  ): Promise<boolean> {
    try {
      // OTP入力フィールドに値を入力
      await page.fill(selectors.input, otp);

      // 送信ボタンをクリック
      await page.click(selectors.submit);

      // ページ遷移を待機
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 });

      // OTPエラーをチェック（サブクラスでオーバーライド可能）
      const hasError = await this.checkOtpError(page);
      if (hasError) {
        console.log(`[SCRAPER] OTP verification failed for ${this.getSupportedAccountName()}`);
        return false;
      }

      console.log(`[SCRAPER] OTP verified successfully for ${this.getSupportedAccountName()}`);
      return true;
    } catch (error) {
      console.error(`[SCRAPER] OTP submission error:`, error);
      return false;
    }
  }

  /**
   * OTPエラーをチェックする（サブクラスでオーバーライド可能）
   */
  protected async checkOtpError(_page: Page): Promise<boolean> {
    // デフォルトではエラーなし
    return false;
  }

  /**
   * ブラウザセッションを維持したままページを取得する
   */
  public getPage(): Page | null {
    return this.page;
  }

  /**
   * ブラウザセッションを維持しているかどうか
   */
  public isSessionActive(): boolean {
    return this.browser !== null && this.page !== null;
  }
}
