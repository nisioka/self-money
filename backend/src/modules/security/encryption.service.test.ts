import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EncryptionService } from './encryption.service.js';
import type { EncryptedData } from './encryption.service.js';

describe('EncryptionService', () => {
  const validMasterKey = 'a'.repeat(64); // 32 bytes hex encoded
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env['MASTER_KEY'];
    process.env['MASTER_KEY'] = validMasterKey;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['MASTER_KEY'] = originalEnv;
    } else {
      delete process.env['MASTER_KEY'];
    }
  });

  describe('constructor', () => {
    it('should throw error when MASTER_KEY is not set', () => {
      delete process.env['MASTER_KEY'];
      expect(() => new EncryptionService()).toThrow('MASTER_KEY environment variable is required');
    });

    it('should throw error when MASTER_KEY is invalid length', () => {
      process.env['MASTER_KEY'] = 'short';
      expect(() => new EncryptionService()).toThrow('MASTER_KEY must be 64 hex characters (32 bytes)');
    });

    it('should throw error when MASTER_KEY contains non-hex characters', () => {
      process.env['MASTER_KEY'] = 'g'.repeat(64);
      expect(() => new EncryptionService()).toThrow('MASTER_KEY must be valid hex string');
    });

    it('should create instance with valid MASTER_KEY', () => {
      const service = new EncryptionService();
      expect(service).toBeInstanceOf(EncryptionService);
    });
  });

  describe('encrypt', () => {
    it('should encrypt plaintext and return EncryptedData', () => {
      const service = new EncryptionService();
      const plaintext = 'my-secret-password';

      const result = service.encrypt(plaintext);

      expect(result).toHaveProperty('ciphertext');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('authTag');
      expect(result.ciphertext).not.toBe(plaintext);
    });

    it('should generate unique IV for each encryption', () => {
      const service = new EncryptionService();
      const plaintext = 'my-secret-password';

      const result1 = service.encrypt(plaintext);
      const result2 = service.encrypt(plaintext);

      expect(result1.iv).not.toBe(result2.iv);
      expect(result1.ciphertext).not.toBe(result2.ciphertext);
    });

    it('should return base64 encoded values', () => {
      const service = new EncryptionService();
      const plaintext = 'test';

      const result = service.encrypt(plaintext);

      // Base64 regex pattern
      const base64Pattern = /^[A-Za-z0-9+/]+=*$/;
      expect(result.ciphertext).toMatch(base64Pattern);
      expect(result.iv).toMatch(base64Pattern);
      expect(result.authTag).toMatch(base64Pattern);
    });

    it('should generate 12-byte IV (16 base64 chars)', () => {
      const service = new EncryptionService();
      const result = service.encrypt('test');

      // 12 bytes = 16 base64 characters
      expect(result.iv.length).toBe(16);
    });

    it('should generate 16-byte authTag (24 base64 chars with padding)', () => {
      const service = new EncryptionService();
      const result = service.encrypt('test');

      // 16 bytes = 24 base64 characters (with padding)
      expect(result.authTag.length).toBeGreaterThanOrEqual(22);
    });
  });

  describe('decrypt', () => {
    it('should decrypt encrypted data back to original plaintext', () => {
      const service = new EncryptionService();
      const plaintext = 'my-secret-password';

      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt Japanese text correctly', () => {
      const service = new EncryptionService();
      const plaintext = 'パスワード123';

      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should throw error when ciphertext is tampered', () => {
      const service = new EncryptionService();
      const encrypted = service.encrypt('test');

      const tampered: EncryptedData = {
        ...encrypted,
        ciphertext: 'tampereddata',
      };

      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('should throw error when authTag is invalid', () => {
      const service = new EncryptionService();
      const encrypted = service.encrypt('test');

      const tampered: EncryptedData = {
        ...encrypted,
        authTag: 'invalidauthtagvalue=',
      };

      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('should throw error when IV is invalid', () => {
      const service = new EncryptionService();
      const encrypted = service.encrypt('test');

      const tampered: EncryptedData = {
        ...encrypted,
        iv: 'invalidiv===',
      };

      expect(() => service.decrypt(tampered)).toThrow();
    });
  });

  describe('decrypt logging', () => {
    it('should log decrypt operation', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const service = new EncryptionService();
      const encrypted = service.encrypt('test');

      service.decrypt(encrypted);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SECURITY] Decrypt operation performed')
      );
      consoleSpy.mockRestore();
    });
  });
});
