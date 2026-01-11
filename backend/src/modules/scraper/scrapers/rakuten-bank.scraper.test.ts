import { describe, it, expect } from 'vitest';
import { RakutenBankScraper } from './rakuten-bank.scraper.js';

describe('RakutenBankScraper', () => {
  const scraper = new RakutenBankScraper();

  describe('getSupportedAccountName', () => {
    it('should return 楽天銀行', () => {
      expect(scraper.getSupportedAccountName()).toBe('楽天銀行');
    });
  });

  describe('getLoginUrl', () => {
    it('should return valid login URL', () => {
      const url = scraper.getLoginUrl();
      expect(url).toContain('rakuten-bank.co.jp');
      expect(url).toContain('LOGIN');
    });
  });
});
