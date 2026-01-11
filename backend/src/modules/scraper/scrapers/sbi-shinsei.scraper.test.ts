import { describe, it, expect } from 'vitest';
import { SBIShinseiScraper } from './sbi-shinsei.scraper.js';

describe('SBIShinseiScraper', () => {
  const scraper = new SBIShinseiScraper();

  describe('getSupportedAccountName', () => {
    it('should return SBI新生銀行', () => {
      expect(scraper.getSupportedAccountName()).toBe('SBI新生銀行');
    });
  });

  describe('getLoginUrl', () => {
    it('should return valid login URL', () => {
      const url = scraper.getLoginUrl();
      expect(url).toContain('shinseibank.com');
    });
  });
});
