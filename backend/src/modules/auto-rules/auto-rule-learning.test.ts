import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { TransactionService } from '../transactions/transaction.service.js';
import { AutoRuleService } from './auto-rule.service.js';
import { TransactionWithLearning } from './transaction-with-learning.service.js';

const prisma = new PrismaClient();

describe('Auto Rule Learning Integration', () => {
  let autoRuleService: AutoRuleService;
  let transactionService: TransactionService;
  let learningService: TransactionWithLearning;
  let testAccountId: number;
  let testCategoryId: number;
  let anotherCategoryId: number;

  beforeAll(async () => {
    await prisma.$connect();
    autoRuleService = new AutoRuleService(prisma);
    transactionService = new TransactionService(prisma);
    learningService = new TransactionWithLearning(transactionService, autoRuleService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.autoRule.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.category.deleteMany();
    await prisma.account.deleteMany();

    const account = await prisma.account.create({
      data: { name: '楽天銀行', type: 'BANK' },
    });
    testAccountId = account.id;

    const category1 = await prisma.category.create({
      data: { name: '食費' },
    });
    testCategoryId = category1.id;

    const category2 = await prisma.category.create({
      data: { name: '交通費' },
    });
    anotherCategoryId = category2.id;
  });

  describe('updateWithLearning', () => {
    it('should create auto rule when category is changed', async () => {
      // Create a transaction
      const transaction = await prisma.transaction.create({
        data: {
          date: new Date(),
          amount: -1000,
          description: 'セブンイレブン 三鷹店',
          accountId: testAccountId,
          categoryId: testCategoryId,
        },
      });

      // Update category - this should create a learning rule
      const result = await learningService.updateWithLearning(transaction.id, {
        categoryId: anotherCategoryId,
      });

      expect(result.success).toBe(true);

      // Verify auto rule was created
      const rule = await autoRuleService.findByKeyword('セブンイレブン 三鷹店');
      expect(rule).not.toBeNull();
      expect(rule?.categoryId).toBe(anotherCategoryId);
    });

    it('should update existing auto rule when category is changed again', async () => {
      // Create initial rule
      await autoRuleService.createOrUpdate('ローソン', testCategoryId);

      // Create a transaction with that description
      const transaction = await prisma.transaction.create({
        data: {
          date: new Date(),
          amount: -500,
          description: 'ローソン',
          accountId: testAccountId,
          categoryId: testCategoryId,
        },
      });

      // Update category - this should update the existing rule
      await learningService.updateWithLearning(transaction.id, {
        categoryId: anotherCategoryId,
      });

      // Verify auto rule was updated
      const rule = await autoRuleService.findByKeyword('ローソン');
      expect(rule).not.toBeNull();
      expect(rule?.categoryId).toBe(anotherCategoryId);

      // Verify only one rule exists
      const allRules = await prisma.autoRule.findMany();
      expect(allRules).toHaveLength(1);
    });

    it('should not create auto rule when category is not changed', async () => {
      const transaction = await prisma.transaction.create({
        data: {
          date: new Date(),
          amount: -1000,
          description: 'ファミリーマート',
          accountId: testAccountId,
          categoryId: testCategoryId,
        },
      });

      // Update only amount, not category
      await learningService.updateWithLearning(transaction.id, {
        amount: -1500,
      });

      // Verify no auto rule was created
      const rule = await autoRuleService.findByKeyword('ファミリーマート');
      expect(rule).toBeNull();
    });

    it('should return error for non-existent transaction', async () => {
      const result = await learningService.updateWithLearning(9999, {
        categoryId: anotherCategoryId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('NOT_FOUND');
      }
    });

    it('should work with memo update along with category change', async () => {
      const transaction = await prisma.transaction.create({
        data: {
          date: new Date(),
          amount: -800,
          description: 'スターバックス',
          accountId: testAccountId,
          categoryId: testCategoryId,
        },
      });

      const result = await learningService.updateWithLearning(transaction.id, {
        categoryId: anotherCategoryId,
        memo: 'コーヒー代',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.memo).toBe('コーヒー代');
        expect(result.data.categoryId).toBe(anotherCategoryId);
      }

      // Verify auto rule was created
      const rule = await autoRuleService.findByKeyword('スターバックス');
      expect(rule).not.toBeNull();
    });
  });
});
