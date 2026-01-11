import { describe, it, expect } from 'vitest';
import { MUFGScraper } from './mufg.scraper.js';

describe('MUFGScraper', () => {
  const scraper = new MUFGScraper();

  describe('getSupportedAccountName', () => {
    it('should return 三菱UFJ銀行', () => {
      expect(scraper.getSupportedAccountName()).toBe('三菱UFJ銀行');
    });
  });

  describe('getLoginUrl', () => {
    it('should return valid login URL', () => {
      const url = scraper.getLoginUrl();
      expect(url).toContain('mufg.jp');
    });
  });
});
