import type { PrismaClient, Account } from '@prisma/client';
import type { EncryptionService, EncryptedData } from '../security/encryption.service.js';

export type AccountType = 'BANK' | 'CARD' | 'SECURITIES' | 'CASH';

const VALID_ACCOUNT_TYPES: AccountType[] = ['BANK', 'CARD', 'SECURITIES', 'CASH'];

export interface CredentialsInput {
  loginId: string;
  password: string;
  additionalFields?: Record<string, string>;
}

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  credentials?: CredentialsInput;
  initialBalance?: number;
}

export interface UpdateAccountInput {
  name?: string;
  credentials?: CredentialsInput;
}

export interface AccountWithBalance {
  id: number;
  name: string;
  type: AccountType;
  balance: number;
}

export type AccountError =
  | { type: 'NOT_FOUND' }
  | { type: 'HAS_TRANSACTIONS'; transactionCount: number }
  | { type: 'VALIDATION_ERROR'; message: string }
  | { type: 'NO_CREDENTIALS' };

export type Result<T, E> =
  | { success: true; data: T }
  | { success: false; error: E };

export class AccountService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly encryptionService: EncryptionService
  ) {}

  async getAll(): Promise<AccountWithBalance[]> {
    const accounts = await this.prisma.account.findMany({
      orderBy: { id: 'asc' },
    });

    return accounts.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type as AccountType,
      balance: account.balance,
    }));
  }

  async getById(id: number): Promise<Result<Account, AccountError>> {
    const account = await this.prisma.account.findUnique({
      where: { id },
    });

    if (!account) {
      return { success: false, error: { type: 'NOT_FOUND' } };
    }

    return { success: true, data: account };
  }

  async create(data: CreateAccountInput): Promise<Result<Account, AccountError>> {
    const trimmedName = data.name.trim();

    if (!trimmedName) {
      return {
        success: false,
        error: { type: 'VALIDATION_ERROR', message: 'Name is required' },
      };
    }

    if (!VALID_ACCOUNT_TYPES.includes(data.type)) {
      return {
        success: false,
        error: { type: 'VALIDATION_ERROR', message: 'Invalid account type' },
      };
    }

    let encryptedCredentials: EncryptedData | undefined;
    if (data.credentials) {
      const credentialsJson = JSON.stringify(data.credentials);
      encryptedCredentials = this.encryptionService.encrypt(credentialsJson);
    }

    const account = await this.prisma.account.create({
      data: {
        name: trimmedName,
        type: data.type,
        balance: data.initialBalance ?? 0,
        encryptedCredentials: encryptedCredentials?.ciphertext,
        credentialsIv: encryptedCredentials?.iv,
        credentialsAuthTag: encryptedCredentials?.authTag,
      },
    });

    return { success: true, data: account };
  }

  async update(id: number, data: UpdateAccountInput): Promise<Result<Account, AccountError>> {
    const existing = await this.prisma.account.findUnique({
      where: { id },
    });

    if (!existing) {
      return { success: false, error: { type: 'NOT_FOUND' } };
    }

    const updateData: {
      name?: string;
      encryptedCredentials?: string;
      credentialsIv?: string;
      credentialsAuthTag?: string;
    } = {};

    if (data.name !== undefined) {
      const trimmedName = data.name.trim();
      if (!trimmedName) {
        return {
          success: false,
          error: { type: 'VALIDATION_ERROR', message: 'Name is required' },
        };
      }
      updateData.name = trimmedName;
    }

    if (data.credentials) {
      const credentialsJson = JSON.stringify(data.credentials);
      const encrypted = this.encryptionService.encrypt(credentialsJson);
      updateData.encryptedCredentials = encrypted.ciphertext;
      updateData.credentialsIv = encrypted.iv;
      updateData.credentialsAuthTag = encrypted.authTag;
    }

    const account = await this.prisma.account.update({
      where: { id },
      data: updateData,
    });

    return { success: true, data: account };
  }

  async delete(id: number): Promise<Result<void, AccountError>> {
    const existing = await this.prisma.account.findUnique({
      where: { id },
    });

    if (!existing) {
      return { success: false, error: { type: 'NOT_FOUND' } };
    }

    const transactionCount = await this.prisma.transaction.count({
      where: { accountId: id },
    });

    if (transactionCount > 0) {
      return {
        success: false,
        error: { type: 'HAS_TRANSACTIONS', transactionCount },
      };
    }

    await this.prisma.account.delete({
      where: { id },
    });

    return { success: true, data: undefined };
  }

  async updateBalance(id: number, balance: number): Promise<void> {
    await this.prisma.account.update({
      where: { id },
      data: { balance },
    });
  }

  async getCredentials(id: number): Promise<Result<CredentialsInput, AccountError>> {
    const account = await this.prisma.account.findUnique({
      where: { id },
    });

    if (!account) {
      return { success: false, error: { type: 'NOT_FOUND' } };
    }

    if (!account.encryptedCredentials || !account.credentialsIv || !account.credentialsAuthTag) {
      return { success: false, error: { type: 'NO_CREDENTIALS' } };
    }

    const decrypted = this.encryptionService.decrypt({
      ciphertext: account.encryptedCredentials,
      iv: account.credentialsIv,
      authTag: account.credentialsAuthTag,
    });

    const credentials = JSON.parse(decrypted) as CredentialsInput;
    return { success: true, data: credentials };
  }
}
