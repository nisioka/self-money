import { describe, it, expect } from 'vitest';
import { SMBCScraper } from './smbc.scraper.js';

describe('SMBCScraper', () => {
  const scraper = new SMBCScraper();

  describe('getSupportedAccountName', () => {
    it('should return 三井住友銀行', () => {
      expect(scraper.getSupportedAccountName()).toBe('三井住友銀行');
    });
  });

  describe('getLoginUrl', () => {
    it('should return valid login URL', () => {
      const url = scraper.getLoginUrl();
      expect(url).toContain('smbc.co.jp');
    });
  });
});
