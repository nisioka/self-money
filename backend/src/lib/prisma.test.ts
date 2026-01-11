import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Prisma Schema', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up database before each test
    await prisma.autoRule.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.category.deleteMany();
    await prisma.account.deleteMany();
    await prisma.job.deleteMany();
  });

  describe('Account model', () => {
    it('should create an account', async () => {
      const account = await prisma.account.create({
        data: {
          name: 'Test Bank',
          type: 'BANK',
        },
      });

      expect(account.id).toBeDefined();
      expect(account.name).toBe('Test Bank');
      expect(account.type).toBe('BANK');
      expect(account.balance).toBe(0);
    });

    it('should store encrypted credentials', async () => {
      const account = await prisma.account.create({
        data: {
          name: 'Test Bank',
          type: 'BANK',
          encryptedCredentials: 'encrypted_data',
          credentialsIv: 'iv_data',
          credentialsAuthTag: 'auth_tag_data',
        },
      });

      expect(account.encryptedCredentials).toBe('encrypted_data');
      expect(account.credentialsIv).toBe('iv_data');
      expect(account.credentialsAuthTag).toBe('auth_tag_data');
    });
  });

  describe('Category model', () => {
    it('should create a category', async () => {
      const category = await prisma.category.create({
        data: {
          name: '食費',
          isDefault: true,
        },
      });

      expect(category.id).toBeDefined();
      expect(category.name).toBe('食費');
      expect(category.isDefault).toBe(true);
    });

    it('should enforce unique category name', async () => {
      await prisma.category.create({
        data: { name: '食費' },
      });

      await expect(
        prisma.category.create({
          data: { name: '食費' },
        })
      ).rejects.toThrow();
    });
  });

  describe('Transaction model', () => {
    it('should create a transaction with relations', async () => {
      const account = await prisma.account.create({
        data: { name: 'Test Bank', type: 'BANK' },
      });
      const category = await prisma.category.create({
        data: { name: '食費' },
      });

      const transaction = await prisma.transaction.create({
        data: {
          date: new Date('2024-01-15'),
          amount: -1000,
          description: 'コンビニ',
          accountId: account.id,
          categoryId: category.id,
        },
        include: {
          account: true,
          category: true,
        },
      });

      expect(transaction.id).toBeDefined();
      expect(transaction.amount).toBe(-1000);
      expect(transaction.description).toBe('コンビニ');
      expect(transaction.isManual).toBe(false);
      expect(transaction.account.name).toBe('Test Bank');
      expect(transaction.category.name).toBe('食費');
    });

    it('should enforce unique externalId', async () => {
      const account = await prisma.account.create({
        data: { name: 'Test Bank', type: 'BANK' },
      });
      const category = await prisma.category.create({
        data: { name: '食費' },
      });

      await prisma.transaction.create({
        data: {
          date: new Date(),
          amount: -1000,
          description: 'Test',
          accountId: account.id,
          categoryId: category.id,
          externalId: 'unique-id-123',
        },
      });

      await expect(
        prisma.transaction.create({
          data: {
            date: new Date(),
            amount: -2000,
            description: 'Test2',
            accountId: account.id,
            categoryId: category.id,
            externalId: 'unique-id-123',
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('AutoRule model', () => {
    it('should create an auto rule', async () => {
      const category = await prisma.category.create({
        data: { name: '食費' },
      });

      const rule = await prisma.autoRule.create({
        data: {
          keyword: 'コンビニ',
          categoryId: category.id,
        },
        include: {
          category: true,
        },
      });

      expect(rule.id).toBeDefined();
      expect(rule.keyword).toBe('コンビニ');
      expect(rule.category.name).toBe('食費');
    });

    it('should enforce unique keyword', async () => {
      const category = await prisma.category.create({
        data: { name: '食費' },
      });

      await prisma.autoRule.create({
        data: {
          keyword: 'コンビニ',
          categoryId: category.id,
        },
      });

      await expect(
        prisma.autoRule.create({
          data: {
            keyword: 'コンビニ',
            categoryId: category.id,
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('Job model', () => {
    it('should create a job with default status', async () => {
      const job = await prisma.job.create({
        data: {
          type: 'SCRAPE_ALL',
        },
      });

      expect(job.id).toBeDefined();
      expect(job.type).toBe('SCRAPE_ALL');
      expect(job.status).toBe('pending');
    });

    it('should create a job with target account', async () => {
      const job = await prisma.job.create({
        data: {
          type: 'SCRAPE_SPECIFIC',
          targetAccountId: 1,
        },
      });

      expect(job.targetAccountId).toBe(1);
    });

    it('should store error message for failed job', async () => {
      const job = await prisma.job.create({
        data: {
          type: 'SCRAPE_ALL',
          status: 'failed',
          errorMessage: 'Connection timeout',
        },
      });

      expect(job.status).toBe('failed');
      expect(job.errorMessage).toBe('Connection timeout');
    });
  });
});
