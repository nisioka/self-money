import { describe, it, expect } from 'vitest';
import { RakutenSecuritiesScraper } from './rakuten-sec.scraper.js';

describe('RakutenSecuritiesScraper', () => {
  const scraper = new RakutenSecuritiesScraper();

  describe('getSupportedAccountName', () => {
    it('should return 楽天証券', () => {
      expect(scraper.getSupportedAccountName()).toBe('楽天証券');
    });
  });

  describe('getLoginUrl', () => {
    it('should return valid login URL', () => {
      const url = scraper.getLoginUrl();
      expect(url).toContain('rakuten-sec.co.jp');
    });
  });
});
