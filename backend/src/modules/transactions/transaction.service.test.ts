import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { TransactionService } from './transaction.service.js';

const prisma = new PrismaClient();

describe('TransactionService', () => {
  let service: TransactionService;
  let testAccountId: number;
  let testCategoryId: number;

  beforeAll(async () => {
    await prisma.$connect();
    service = new TransactionService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.autoRule.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.category.deleteMany();
    await prisma.account.deleteMany();

    // Create test account and category
    const account = await prisma.account.create({
      data: { name: '楽天銀行', type: 'BANK' },
    });
    testAccountId = account.id;

    const category = await prisma.category.create({
      data: { name: '食費' },
    });
    testCategoryId = category.id;
  });

  describe('create', () => {
    it('should create a manual transaction', async () => {
      const result = await service.create({
        date: new Date('2026-01-15'),
        amount: -1500,
        description: 'ランチ',
        accountId: testAccountId,
        categoryId: testCategoryId,
        isManual: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.amount).toBe(-1500);
        expect(result.data.description).toBe('ランチ');
        expect(result.data.isManual).toBe(true);
      }
    });

    it('should create a transaction with externalId', async () => {
      const result = await service.create({
        date: new Date('2026-01-15'),
        amount: -3000,
        description: 'ATM引き出し',
        accountId: testAccountId,
        categoryId: testCategoryId,
        isManual: false,
        externalId: 'rakuten-2026-01-15-001',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.externalId).toBe('rakuten-2026-01-15-001');
        expect(result.data.isManual).toBe(false);
      }
    });

    it('should create a transaction with memo', async () => {
      const result = await service.create({
        date: new Date('2026-01-15'),
        amount: -1000,
        description: 'コンビニ',
        accountId: testAccountId,
        categoryId: testCategoryId,
        isManual: true,
        memo: 'お菓子購入',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.memo).toBe('お菓子購入');
      }
    });

    it('should reject duplicate externalId', async () => {
      await service.create({
        date: new Date('2026-01-15'),
        amount: -1000,
        description: 'First',
        accountId: testAccountId,
        categoryId: testCategoryId,
        isManual: false,
        externalId: 'duplicate-id',
      });

      const result = await service.create({
        date: new Date('2026-01-16'),
        amount: -2000,
        description: 'Second',
        accountId: testAccountId,
        categoryId: testCategoryId,
        isManual: false,
        externalId: 'duplicate-id',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('DUPLICATE_EXTERNAL_ID');
      }
    });

    it('should return error for invalid account', async () => {
      const result = await service.create({
        date: new Date('2026-01-15'),
        amount: -1000,
        description: 'Test',
        accountId: 9999,
        categoryId: testCategoryId,
        isManual: true,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('INVALID_ACCOUNT');
      }
    });

    it('should return error for invalid category', async () => {
      const result = await service.create({
        date: new Date('2026-01-15'),
        amount: -1000,
        description: 'Test',
        accountId: testAccountId,
        categoryId: 9999,
        isManual: true,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('INVALID_CATEGORY');
      }
    });

    it('should return error for empty description', async () => {
      const result = await service.create({
        date: new Date('2026-01-15'),
        amount: -1000,
        description: '',
        accountId: testAccountId,
        categoryId: testCategoryId,
        isManual: true,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('findById', () => {
    it('should return transaction by id', async () => {
      const created = await prisma.transaction.create({
        data: {
          date: new Date('2026-01-15'),
          amount: -1000,
          description: 'Test',
          accountId: testAccountId,
          categoryId: testCategoryId,
        },
      });

      const result = await service.findById(created.id);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(created.id);
        expect(result.data.description).toBe('Test');
      }
    });

    it('should return error for non-existent transaction', async () => {
      const result = await service.findById(9999);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('NOT_FOUND');
      }
    });
  });

  describe('update', () => {
    it('should update transaction amount', async () => {
      const created = await prisma.transaction.create({
        data: {
          date: new Date('2026-01-15'),
          amount: -1000,
          description: 'Test',
          accountId: testAccountId,
          categoryId: testCategoryId,
        },
      });

      const result = await service.update(created.id, { amount: -1500 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.amount).toBe(-1500);
      }
    });

    it('should update transaction category', async () => {
      const created = await prisma.transaction.create({
        data: {
          date: new Date('2026-01-15'),
          amount: -1000,
          description: 'Test',
          accountId: testAccountId,
          categoryId: testCategoryId,
        },
      });

      const newCategory = await prisma.category.create({
        data: { name: '交通費' },
      });

      const result = await service.update(created.id, { categoryId: newCategory.id });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.categoryId).toBe(newCategory.id);
      }
    });

    it('should update transaction memo', async () => {
      const created = await prisma.transaction.create({
        data: {
          date: new Date('2026-01-15'),
          amount: -1000,
          description: 'Test',
          accountId: testAccountId,
          categoryId: testCategoryId,
        },
      });

      const result = await service.update(created.id, { memo: '更新メモ' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.memo).toBe('更新メモ');
      }
    });

    it('should return error for non-existent transaction', async () => {
      const result = await service.update(9999, { amount: -1500 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('NOT_FOUND');
      }
    });

    it('should return error for invalid category', async () => {
      const created = await prisma.transaction.create({
        data: {
          date: new Date('2026-01-15'),
          amount: -1000,
          description: 'Test',
          accountId: testAccountId,
          categoryId: testCategoryId,
        },
      });

      const result = await service.update(created.id, { categoryId: 9999 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('INVALID_CATEGORY');
      }
    });
  });

  describe('delete', () => {
    it('should delete transaction', async () => {
      const created = await prisma.transaction.create({
        data: {
          date: new Date('2026-01-15'),
          amount: -1000,
          description: 'Test',
          accountId: testAccountId,
          categoryId: testCategoryId,
        },
      });

      const result = await service.delete(created.id);
      expect(result.success).toBe(true);

      const deleted = await prisma.transaction.findUnique({
        where: { id: created.id },
      });
      expect(deleted).toBeNull();
    });

    it('should return error for non-existent transaction', async () => {
      const result = await service.delete(9999);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('NOT_FOUND');
      }
    });
  });

  describe('findByMonth', () => {
    it('should return transactions for specific month', async () => {
      await prisma.transaction.createMany({
        data: [
          {
            date: new Date('2026-01-15'),
            amount: -1000,
            description: 'January 1',
            accountId: testAccountId,
            categoryId: testCategoryId,
          },
          {
            date: new Date('2026-01-20'),
            amount: -2000,
            description: 'January 2',
            accountId: testAccountId,
            categoryId: testCategoryId,
          },
          {
            date: new Date('2026-02-10'),
            amount: -3000,
            description: 'February 1',
            accountId: testAccountId,
            categoryId: testCategoryId,
          },
        ],
      });

      const result = await service.findByMonth(2026, 1);
      expect(result).toHaveLength(2);
      expect(result.every((t) => t.description.includes('January'))).toBe(true);
    });

    it('should return empty array for month with no transactions', async () => {
      const result = await service.findByMonth(2026, 12);
      expect(result).toEqual([]);
    });

    it('should order transactions by date descending', async () => {
      await prisma.transaction.createMany({
        data: [
          {
            date: new Date('2026-01-10'),
            amount: -1000,
            description: 'Early',
            accountId: testAccountId,
            categoryId: testCategoryId,
          },
          {
            date: new Date('2026-01-25'),
            amount: -2000,
            description: 'Late',
            accountId: testAccountId,
            categoryId: testCategoryId,
          },
        ],
      });

      const result = await service.findByMonth(2026, 1);
      expect(result[0].description).toBe('Late');
      expect(result[1].description).toBe('Early');
    });
  });

  describe('findByAccount', () => {
    it('should return transactions for specific account', async () => {
      const anotherAccount = await prisma.account.create({
        data: { name: '三井住友銀行', type: 'BANK' },
      });

      await prisma.transaction.createMany({
        data: [
          {
            date: new Date('2026-01-15'),
            amount: -1000,
            description: 'Rakuten 1',
            accountId: testAccountId,
            categoryId: testCategoryId,
          },
          {
            date: new Date('2026-01-16'),
            amount: -2000,
            description: 'SMBC 1',
            accountId: anotherAccount.id,
            categoryId: testCategoryId,
          },
        ],
      });

      const result = await service.findByAccount(testAccountId);
      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('Rakuten 1');
    });

    it('should return empty array for account with no transactions', async () => {
      const result = await service.findByAccount(testAccountId);
      expect(result).toEqual([]);
    });
  });

  describe('findByMonthAndAccount', () => {
    it('should filter by both month and account', async () => {
      const anotherAccount = await prisma.account.create({
        data: { name: '三井住友銀行', type: 'BANK' },
      });

      await prisma.transaction.createMany({
        data: [
          {
            date: new Date('2026-01-15'),
            amount: -1000,
            description: 'Rakuten Jan',
            accountId: testAccountId,
            categoryId: testCategoryId,
          },
          {
            date: new Date('2026-01-16'),
            amount: -2000,
            description: 'SMBC Jan',
            accountId: anotherAccount.id,
            categoryId: testCategoryId,
          },
          {
            date: new Date('2026-02-10'),
            amount: -3000,
            description: 'Rakuten Feb',
            accountId: testAccountId,
            categoryId: testCategoryId,
          },
        ],
      });

      const result = await service.findByMonthAndAccount(2026, 1, testAccountId);
      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('Rakuten Jan');
    });
  });

  describe('checkDuplicateExternalId', () => {
    it('should return true for existing externalId', async () => {
      await prisma.transaction.create({
        data: {
          date: new Date('2026-01-15'),
          amount: -1000,
          description: 'Test',
          accountId: testAccountId,
          categoryId: testCategoryId,
          externalId: 'existing-id',
        },
      });

      const result = await service.checkDuplicateExternalId('existing-id');
      expect(result).toBe(true);
    });

    it('should return false for non-existing externalId', async () => {
      const result = await service.checkDuplicateExternalId('non-existing-id');
      expect(result).toBe(false);
    });
  });
});
