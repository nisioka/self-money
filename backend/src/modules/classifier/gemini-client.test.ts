import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GeminiApiClient } from './gemini-client.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('GeminiApiClient', () => {
  let client: GeminiApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GeminiApiClient('test-api-key');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('classify', () => {
    it('should call Gemini API with correct prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: '食費' }],
              },
            },
          ],
        }),
      });

      const result = await client.classify('セブンイレブン', ['食費', '交通費', '日用品']);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('generativelanguage.googleapis.com');
      expect(url).toContain('test-api-key');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.contents[0].parts[0].text).toContain('セブンイレブン');
      expect(body.contents[0].parts[0].text).toContain('食費');
      expect(body.contents[0].parts[0].text).toContain('交通費');
    });

    it('should extract category from API response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: '交通費' }],
              },
            },
          ],
        }),
      });

      const result = await client.classify('JR東日本', ['食費', '交通費']);

      expect(result).toBe('交通費');
    });

    it('should handle category with extra whitespace', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: '  食費  \n' }],
              },
            },
          ],
        }),
      });

      const result = await client.classify('コンビニ', ['食費', '交通費']);

      expect(result).toBe('食費');
    });

    it('should return null for API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      const result = await client.classify('テスト', ['食費']);

      expect(result).toBeNull();
    });

    it('should return null for network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await client.classify('テスト', ['食費']);

      expect(result).toBeNull();
    });

    it('should return null for empty candidates', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [],
        }),
      });

      const result = await client.classify('テスト', ['食費']);

      expect(result).toBeNull();
    });

    it('should return null for malformed response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const result = await client.classify('テスト', ['食費']);

      expect(result).toBeNull();
    });

    it('should validate response against provided categories', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: '食費' }],
              },
            },
          ],
        }),
      });

      const result = await client.classify('テスト', ['食費', '交通費']);

      // Should return the matched category
      expect(result).toBe('食費');
    });
  });

  describe('Rate limiting', () => {
    it('should handle rate limit errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      const result = await client.classify('テスト', ['食費']);

      expect(result).toBeNull();
    });
  });

  describe('Constructor', () => {
    it('should throw error when API key is not provided', () => {
      expect(() => new GeminiApiClient('')).toThrow('GEMINI_API_KEY is required');
    });
  });
});
