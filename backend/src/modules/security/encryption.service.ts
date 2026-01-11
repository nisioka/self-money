import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

export interface EncryptedData {
  ciphertext: string; // Base64 encoded
  iv: string; // Base64 encoded (12 bytes)
  authTag: string; // Base64 encoded (16 bytes)
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 bytes for GCM
const AUTH_TAG_LENGTH = 16; // 16 bytes

export class EncryptionService {
  private readonly key: Buffer;

  constructor() {
    const masterKey = process.env['MASTER_KEY'];

    if (!masterKey) {
      throw new Error('MASTER_KEY environment variable is required');
    }

    if (masterKey.length !== 64) {
      throw new Error('MASTER_KEY must be 64 hex characters (32 bytes)');
    }

    if (!/^[0-9a-fA-F]+$/.test(masterKey)) {
      throw new Error('MASTER_KEY must be valid hex string');
    }

    this.key = Buffer.from(masterKey, 'hex');
  }

  encrypt(plaintext: string): EncryptedData {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  decrypt(encrypted: EncryptedData): string {
    const iv = Buffer.from(encrypted.iv, 'base64');
    const authTag = Buffer.from(encrypted.authTag, 'base64');
    const ciphertext = Buffer.from(encrypted.ciphertext, 'base64');

    const decipher = createDecipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    console.log(`[SECURITY] Decrypt operation performed at ${new Date().toISOString()}`);

    return decrypted.toString('utf8');
  }
}
