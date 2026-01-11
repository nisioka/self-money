import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from './api';

describe('API Client', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('apiGet', () => {
    it('should fetch data successfully', async () => {
      const mockData = { id: 1, name: 'Test' };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData),
      });

      const result = await apiGet<typeof mockData>('/test');

      expect(result).toEqual(mockData);
      expect(fetch).toHaveBeenCalledWith('/api/test', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    it('should throw ApiError on failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('{"message": "Resource not found"}'),
      });

      await expect(apiGet('/test')).rejects.toThrow(ApiError);
      await expect(apiGet('/test')).rejects.toMatchObject({
        status: 404,
        statusText: 'Not Found',
        message: 'Resource not found',
      });
    });
  });

  describe('apiPost', () => {
    it('should post data successfully', async () => {
      const mockResponse = { id: 1 };
      const postData = { name: 'Test' };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await apiPost<typeof mockResponse>('/test', postData);

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postData),
      });
    });
  });

  describe('apiPatch', () => {
    it('should patch data successfully', async () => {
      const mockResponse = { id: 1, name: 'Updated' };
      const patchData = { name: 'Updated' };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await apiPatch<typeof mockResponse>('/test/1', patchData);

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith('/api/test/1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchData),
      });
    });
  });

  describe('apiDelete', () => {
    it('should delete successfully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: () => Promise.reject(),
      });

      const result = await apiDelete('/test/1');

      expect(result).toBeUndefined();
      expect(fetch).toHaveBeenCalledWith('/api/test/1', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });
});
