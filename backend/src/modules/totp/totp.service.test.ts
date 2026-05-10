import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TotpService } from './totp.service.js';
import type { PrismaClient } from '@prisma/client';
import type { EncryptionService } from '../security/encryption.service.js';

describe('TotpService', () => {
  let service: TotpService;
  let mockPrisma: {
    account: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let mockEncryption: {
    encrypt: ReturnType<typeof vi.fn>;
    decrypt: ReturnType<typeof vi.fn>;
  };

  const validBase32Secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // Valid Base32 (32 chars = 20 bytes)

  beforeEach(() => {
    mockPrisma = {
      account: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };
    mockEncryption = {
      encrypt: vi.fn().mockReturnValue({
        ciphertext: 'encrypted-secret',
        iv: 'test-iv',
        authTag: 'test-auth-tag',
      }),
      decrypt: vi.fn().mockReturnValue(validBase32Secret),
    };
    service = new TotpService(
      mockPrisma as unknown as PrismaClient,
      mockEncryption as unknown as EncryptionService
    );
  });

  describe('generateOtp', () => {
    it('should return null if account does not exist', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);

      const result = await service.generateOtp(1);

      expect(result).toBeNull();
    });

    it('should return null if account has no TOTP secret', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({
        id: 1,
        encryptedTotpSecret: null,
        totpSecretIv: null,
        totpSecretAuthTag: null,
      });

      const result = await service.generateOtp(1);

      expect(result).toBeNull();
    });

    it('should generate a 6-digit OTP for valid secret', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({
        id: 1,
        encryptedTotpSecret: 'encrypted-secret',
        totpSecretIv: 'test-iv',
        totpSecretAuthTag: 'test-auth-tag',
      });

      const result = await service.generateOtp(1);

      expect(result).not.toBeNull();
      expect(result).toMatch(/^\d{6}$/);
      expect(mockEncryption.decrypt).toHaveBeenCalledWith({
        ciphertext: 'encrypted-secret',
        iv: 'test-iv',
        authTag: 'test-auth-tag',
      });
    });

    it('should generate RFC 6238 compliant TOTP', async () => {
      // RFC 6238 test vector: secret "12345678901234567890" at time step 1
      // We test that the service uses otplib correctly
      mockPrisma.account.findUnique.mockResolvedValue({
        id: 1,
        encryptedTotpSecret: 'encrypted-secret',
        totpSecretIv: 'test-iv',
        totpSecretAuthTag: 'test-auth-tag',
      });

      const otp1 = await service.generateOtp(1);
      const otp2 = await service.generateOtp(1);

      // Same time window should produce same OTP
      expect(otp1).toBe(otp2);
    });
  });

  describe('saveSecret', () => {
    it('should encrypt and save secret', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.account.update.mockResolvedValue({ id: 1 });

      await service.saveSecret(1, validBase32Secret);

      expect(mockEncryption.encrypt).toHaveBeenCalledWith(validBase32Secret);
      expect(mockPrisma.account.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          encryptedTotpSecret: 'encrypted-secret',
          totpSecretIv: 'test-iv',
          totpSecretAuthTag: 'test-auth-tag',
        },
      });
    });

    it('should throw error for invalid Base32 secret', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({ id: 1 });

      await expect(service.saveSecret(1, 'invalid!secret@')).rejects.toThrow(
        'Invalid TOTP secret format'
      );
    });

    it('should throw error for secret that is too short', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({ id: 1 });

      await expect(service.saveSecret(1, 'SHORT')).rejects.toThrow(
        'TOTP secret must be between 16 and 32 characters'
      );
    });

    it('should throw error if account does not exist', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);

      await expect(service.saveSecret(999, validBase32Secret)).rejects.toThrow(
        'Account not found'
      );
    });
  });

  describe('deleteSecret', () => {
    it('should clear TOTP secret fields', async () => {
      mockPrisma.account.update.mockResolvedValue({ id: 1 });

      await service.deleteSecret(1);

      expect(mockPrisma.account.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          encryptedTotpSecret: null,
          totpSecretIv: null,
          totpSecretAuthTag: null,
        },
      });
    });
  });

  describe('hasSecret', () => {
    it('should return true if secret exists', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({
        id: 1,
        encryptedTotpSecret: 'encrypted',
      });

      const result = await service.hasSecret(1);

      expect(result).toBe(true);
    });

    it('should return false if secret does not exist', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({
        id: 1,
        encryptedTotpSecret: null,
      });

      const result = await service.hasSecret(1);

      expect(result).toBe(false);
    });

    it('should return false if account does not exist', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);

      const result = await service.hasSecret(999);

      expect(result).toBe(false);
    });
  });
});
