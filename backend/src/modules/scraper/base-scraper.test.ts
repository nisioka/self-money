import { describe, it, expect } from 'vitest';
import type { Page } from 'playwright';
import { BaseScraper } from './base-scraper.js';
import type { ScrapedTransaction, DecryptedCredentials } from './scraper.types.js';

// テスト用の具象クラス
class TestScraper extends BaseScraper {
  getSupportedAccountName(): string {
    return 'テスト銀行';
  }

  getLoginUrl(): string {
    return 'https://example.com/login';
  }

  async login(_page: Page, _credentials: DecryptedCredentials): Promise<void> {
    // テスト用のダミー実装
  }

  async fetchTransactions(_page: Page): Promise<ScrapedTransaction[]> {
    return [];
  }

  async fetchBalance(_page: Page): Promise<number> {
    return 100000;
  }

  // protectedメソッドをテスト用に公開
  public testParseDate(dateStr: string): Date {
    return this.parseDate(dateStr);
  }

  public testParseAmount(amountStr: string): number {
    return this.parseAmount(amountStr);
  }

  public testGenerateExternalId(
    date: Date,
    amount: number,
    description: string,
    index = 0
  ): string {
    return this.generateExternalId(date, amount, description, index);
  }
}

describe('BaseScraper', () => {
  const scraper = new TestScraper();

  describe('parseDate', () => {
    it('should parse YYYY/MM/DD format', () => {
      const date = scraper.testParseDate('2026/01/15');
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(0); // 0-indexed
      expect(date.getDate()).toBe(15);
    });

    it('should parse YYYY-MM-DD format', () => {
      const date = scraper.testParseDate('2026-12-25');
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(11);
      expect(date.getDate()).toBe(25);
    });

    it('should parse YYYY年MM月DD日 format', () => {
      const date = scraper.testParseDate('2026年3月5日');
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(2);
      expect(date.getDate()).toBe(5);
    });

    it('should parse MM/DD format with current year', () => {
      const date = scraper.testParseDate('6/10');
      const now = new Date();
      expect(date.getFullYear()).toBe(now.getFullYear());
      expect(date.getMonth()).toBe(5);
      expect(date.getDate()).toBe(10);
    });

    it('should throw error for invalid date format', () => {
      expect(() => scraper.testParseDate('invalid')).toThrow(
        'Unable to parse date'
      );
    });
  });

  describe('parseAmount', () => {
    it('should parse plain number', () => {
      expect(scraper.testParseAmount('1000')).toBe(1000);
    });

    it('should parse number with comma', () => {
      expect(scraper.testParseAmount('1,000,000')).toBe(1000000);
    });

    it('should parse number with yen symbol', () => {
      expect(scraper.testParseAmount('￥5,000')).toBe(5000);
    });

    it('should parse negative number', () => {
      expect(scraper.testParseAmount('-3,500')).toBe(-3500);
    });

    it('should parse number with 円', () => {
      expect(scraper.testParseAmount('2,500円')).toBe(2500);
    });

    it('should throw error for invalid amount', () => {
      expect(() => scraper.testParseAmount('invalid')).toThrow(
        'Unable to parse amount'
      );
    });
  });

  describe('generateExternalId', () => {
    it('should generate unique external ID', () => {
      const date = new Date('2026-01-15');
      const id = scraper.testGenerateExternalId(date, -1000, 'スーパーマーケット');

      expect(id).toBe('テスト銀行-2026-01-15--1000-スーパーマーケット-0');
    });

    it('should include index for duplicate transactions', () => {
      const date = new Date('2026-01-15');
      const id1 = scraper.testGenerateExternalId(date, -500, 'コンビニ', 0);
      const id2 = scraper.testGenerateExternalId(date, -500, 'コンビニ', 1);

      expect(id1).not.toBe(id2);
      expect(id1).toContain('-0');
      expect(id2).toContain('-1');
    });

    it('should handle empty description', () => {
      const date = new Date('2026-01-15');
      const id = scraper.testGenerateExternalId(date, 10000, '');

      expect(id).toBe('テスト銀行-2026-01-15-10000--0');
    });
  });
});
