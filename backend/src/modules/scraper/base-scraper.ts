import { chromium, type Browser, type Page } from 'playwright';
import type {
  Scraper,
  ScrapeResult,
  ScrapedTransaction,
  DecryptedCredentials,
} from './scraper.types.js';

/**
 * 抽象ベーススクレイパー
 * 各金融機関のスクレイパーはこのクラスを継承して実装する
 */
export abstract class BaseScraper implements Scraper {
  protected browser: Browser | null = null;
  protected page: Page | null = null;

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
        parseInt(slashMatch[1]),
        parseInt(slashMatch[2]) - 1,
        parseInt(slashMatch[3])
      );
    }

    // YYYY年MM月DD日 形式
    const jpMatch = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (jpMatch) {
      return new Date(
        parseInt(jpMatch[1]),
        parseInt(jpMatch[2]) - 1,
        parseInt(jpMatch[3])
      );
    }

    // MM/DD 形式（今年と仮定）
    const shortMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})/);
    if (shortMatch) {
      const now = new Date();
      return new Date(
        now.getFullYear(),
        parseInt(shortMatch[1]) - 1,
        parseInt(shortMatch[2])
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
}
