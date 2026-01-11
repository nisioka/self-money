import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScraperFactoryImpl } from './scraper.factory.js';
import type { Scraper, ScrapeResult } from './scraper.types.js';

describe('ScraperFactory', () => {
  let factory: ScraperFactoryImpl;
  let mockScraper: Scraper;

  beforeEach(() => {
    factory = new ScraperFactoryImpl();
    mockScraper = {
      getSupportedAccountName: () => '楽天銀行',
      scrape: vi.fn().mockResolvedValue({} as ScrapeResult),
    };
  });

  describe('register', () => {
    it('should register a scraper', () => {
      factory.register(mockScraper);

      const result = factory.getScraper('楽天銀行');
      expect(result).toBe(mockScraper);
    });

    it('should allow multiple scrapers', () => {
      const anotherScraper: Scraper = {
        getSupportedAccountName: () => '三井住友銀行',
        scrape: vi.fn().mockResolvedValue({} as ScrapeResult),
      };

      factory.register(mockScraper);
      factory.register(anotherScraper);

      expect(factory.getScraper('楽天銀行')).toBe(mockScraper);
      expect(factory.getScraper('三井住友銀行')).toBe(anotherScraper);
    });
  });

  describe('getScraper', () => {
    it('should return null for unregistered account', () => {
      const result = factory.getScraper('未知の銀行');
      expect(result).toBeNull();
    });
  });

  describe('getSupportedAccountNames', () => {
    it('should return empty array when no scrapers registered', () => {
      const names = factory.getSupportedAccountNames();
      expect(names).toEqual([]);
    });

    it('should return all registered account names', () => {
      factory.register(mockScraper);
      factory.register({
        getSupportedAccountName: () => '三井住友銀行',
        scrape: vi.fn().mockResolvedValue({} as ScrapeResult),
      });

      const names = factory.getSupportedAccountNames();
      expect(names).toContain('楽天銀行');
      expect(names).toContain('三井住友銀行');
      expect(names).toHaveLength(2);
    });
  });
});
