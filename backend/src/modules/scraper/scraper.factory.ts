import type { Scraper, ScraperFactory } from './scraper.types.js';

/**
 * スクレイパーファクトリの実装
 * 各金融機関のスクレイパーをレジストリとして管理
 */
export class ScraperFactoryImpl implements ScraperFactory {
  private readonly scrapers: Map<string, Scraper> = new Map();

  /**
   * スクレイパーを登録する
   */
  register(scraper: Scraper): void {
    this.scrapers.set(scraper.getSupportedAccountName(), scraper);
  }

  /**
   * 口座名に対応するスクレイパーを取得する
   */
  getScraper(accountName: string): Scraper | null {
    return this.scrapers.get(accountName) ?? null;
  }

  /**
   * サポートされている口座名の一覧を取得する
   */
  getSupportedAccountNames(): string[] {
    return Array.from(this.scrapers.keys());
  }
}
