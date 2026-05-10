import type { PrismaClient } from '@prisma/client';
import { generateSync } from 'otplib';
import type { EncryptionService } from '../security/encryption.service.js';

export class TotpService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly encryption: EncryptionService
  ) {}

  async generateOtp(accountId: number): Promise<string | null> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        encryptedTotpSecret: true,
        totpSecretIv: true,
        totpSecretAuthTag: true,
      },
    });

    if (
      !account ||
      !account.encryptedTotpSecret ||
      !account.totpSecretIv ||
      !account.totpSecretAuthTag
    ) {
      return null;
    }

    const secret = this.encryption.decrypt({
      ciphertext: account.encryptedTotpSecret,
      iv: account.totpSecretIv,
      authTag: account.totpSecretAuthTag,
    });

    // Generate TOTP (RFC 6238 compliant via otplib)
    return generateSync({ secret });
  }

  async saveSecret(accountId: number, secret: string): Promise<void> {
    // Validate account exists
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      throw new Error('Account not found');
    }

    // Validate Base32 format
    if (!this.isValidBase32(secret)) {
      throw new Error('Invalid TOTP secret format');
    }

    // Validate length (16-32 characters)
    if (secret.length < 16 || secret.length > 32) {
      throw new Error('TOTP secret must be between 16 and 32 characters');
    }

    // Encrypt and store
    const encrypted = this.encryption.encrypt(secret);

    await this.prisma.account.update({
      where: { id: accountId },
      data: {
        encryptedTotpSecret: encrypted.ciphertext,
        totpSecretIv: encrypted.iv,
        totpSecretAuthTag: encrypted.authTag,
      },
    });
  }

  async deleteSecret(accountId: number): Promise<void> {
    await this.prisma.account.update({
      where: { id: accountId },
      data: {
        encryptedTotpSecret: null,
        totpSecretIv: null,
        totpSecretAuthTag: null,
      },
    });
  }

  async hasSecret(accountId: number): Promise<boolean> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { encryptedTotpSecret: true },
    });

    return account?.encryptedTotpSecret != null;
  }

  private isValidBase32(secret: string): boolean {
    // Base32 alphabet: A-Z and 2-7
    return /^[A-Z2-7]+$/.test(secret);
  }
}
