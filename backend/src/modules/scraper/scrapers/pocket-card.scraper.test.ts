import { describe, it, expect } from 'vitest';
import { PocketCardScraper } from './pocket-card.scraper.js';

describe('PocketCardScraper', () => {
  const scraper = new PocketCardScraper();

  describe('getSupportedAccountName', () => {
    it('should return ポケットカード', () => {
      expect(scraper.getSupportedAccountName()).toBe('ポケットカード');
    });
  });

  describe('getLoginUrl', () => {
    it('should return valid login URL', () => {
      const url = scraper.getLoginUrl();
      expect(url).toContain('pocketcard.co.jp');
    });
  });
});
