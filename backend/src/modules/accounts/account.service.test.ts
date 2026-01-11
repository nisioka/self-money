import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { AccountService } from './account.service.js';
import { EncryptionService } from '../security/encryption.service.js';

const prisma = new PrismaClient();

describe('AccountService', () => {
  let service: AccountService;
  let encryptionService: EncryptionService;

  beforeAll(async () => {
    await prisma.$connect();
    process.env['MASTER_KEY'] = 'a'.repeat(64);
    encryptionService = new EncryptionService();
    service = new AccountService(prisma, encryptionService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.autoRule.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.category.deleteMany();
    await prisma.account.deleteMany();
  });

  describe('getAll', () => {
    it('should return empty array when no accounts exist', async () => {
      const result = await service.getAll();
      expect(result).toEqual([]);
    });

    it('should return all accounts with balance', async () => {
      await prisma.account.createMany({
        data: [
          { name: '楽天銀行', type: 'BANK', balance: 100000 },
          { name: '楽天カード', type: 'CARD', balance: -50000 },
        ],
      });

      const result = await service.getAll();
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('balance');
    });
  });

  describe('getById', () => {
    it('should return account by id', async () => {
      const account = await prisma.account.create({
        data: { name: '楽天銀行', type: 'BANK' },
      });

      const result = await service.getById(account.id);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('楽天銀行');
      }
    });

    it('should return error for non-existent account', async () => {
      const result = await service.getById(9999);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('NOT_FOUND');
      }
    });
  });

  describe('create', () => {
    it('should create account without credentials', async () => {
      const result = await service.create({
        name: '現金',
        type: 'CASH',
        initialBalance: 10000,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('現金');
        expect(result.data.type).toBe('CASH');
        expect(result.data.balance).toBe(10000);
      }
    });

    it('should create account with encrypted credentials', async () => {
      const result = await service.create({
        name: '楽天銀行',
        type: 'BANK',
        credentials: {
          loginId: 'user123',
          password: 'pass123',
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const account = await prisma.account.findUnique({
          where: { id: result.data.id },
        });
        expect(account?.encryptedCredentials).toBeDefined();
        expect(account?.credentialsIv).toBeDefined();
        expect(account?.credentialsAuthTag).toBeDefined();
      }
    });

    it('should return error for empty name', async () => {
      const result = await service.create({
        name: '',
        type: 'BANK',
      });

      expect(result.success).toBe(false);
    });

    it('should return error for invalid account type', async () => {
      const result = await service.create({
        name: 'Test',
        type: 'INVALID' as any,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('update', () => {
    it('should update account name', async () => {
      const account = await prisma.account.create({
        data: { name: '楽天銀行', type: 'BANK' },
      });

      const result = await service.update(account.id, { name: '楽天銀行（メイン）' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('楽天銀行（メイン）');
      }
    });

    it('should update credentials', async () => {
      const account = await prisma.account.create({
        data: { name: '楽天銀行', type: 'BANK' },
      });

      const result = await service.update(account.id, {
        credentials: { loginId: 'newuser', password: 'newpass' },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const updated = await prisma.account.findUnique({
          where: { id: account.id },
        });
        expect(updated?.encryptedCredentials).toBeDefined();
      }
    });

    it('should return error for non-existent account', async () => {
      const result = await service.update(9999, { name: 'Test' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('NOT_FOUND');
      }
    });
  });

  describe('delete', () => {
    it('should delete account without transactions', async () => {
      const account = await prisma.account.create({
        data: { name: '楽天銀行', type: 'BANK' },
      });

      const result = await service.delete(account.id);
      expect(result.success).toBe(true);

      const deleted = await prisma.account.findUnique({ where: { id: account.id } });
      expect(deleted).toBeNull();
    });

    it('should return error for non-existent account', async () => {
      const result = await service.delete(9999);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('NOT_FOUND');
      }
    });

    it('should return error when account has transactions', async () => {
      const account = await prisma.account.create({
        data: { name: '楽天銀行', type: 'BANK' },
      });
      const category = await prisma.category.create({ data: { name: '食費' } });
      await prisma.transaction.create({
        data: {
          date: new Date(),
          amount: -1000,
          description: 'Test',
          accountId: account.id,
          categoryId: category.id,
        },
      });

      const result = await service.delete(account.id);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('HAS_TRANSACTIONS');
      }
    });
  });

  describe('updateBalance', () => {
    it('should update account balance', async () => {
      const account = await prisma.account.create({
        data: { name: '楽天銀行', type: 'BANK', balance: 0 },
      });

      await service.updateBalance(account.id, 150000);

      const updated = await prisma.account.findUnique({ where: { id: account.id } });
      expect(updated?.balance).toBe(150000);
    });
  });

  describe('getCredentials', () => {
    it('should return decrypted credentials', async () => {
      const credentials = { loginId: 'user123', password: 'pass123' };
      const createResult = await service.create({
        name: '楽天銀行',
        type: 'BANK',
        credentials,
      });

      if (!createResult.success) throw new Error('Failed to create account');

      const result = await service.getCredentials(createResult.data.id);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.loginId).toBe('user123');
        expect(result.data.password).toBe('pass123');
      }
    });

    it('should return error when no credentials exist', async () => {
      const account = await prisma.account.create({
        data: { name: '現金', type: 'CASH' },
      });

      const result = await service.getCredentials(account.id);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('NO_CREDENTIALS');
      }
    });
  });
});
