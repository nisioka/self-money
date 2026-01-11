import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { AutoRuleService } from './auto-rule.service.js';

const prisma = new PrismaClient();

describe('AutoRuleService', () => {
  let service: AutoRuleService;
  let testCategoryId: number;

  beforeAll(async () => {
    await prisma.$connect();
    service = new AutoRuleService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.autoRule.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.category.deleteMany();
    await prisma.account.deleteMany();

    const category = await prisma.category.create({
      data: { name: '食費' },
    });
    testCategoryId = category.id;
  });

  describe('getAll', () => {
    it('should return empty array when no rules exist', async () => {
      const result = await service.getAll();
      expect(result).toEqual([]);
    });

    it('should return all rules with category', async () => {
      await prisma.autoRule.create({
        data: {
          keyword: 'コンビニ',
          categoryId: testCategoryId,
        },
      });

      const result = await service.getAll();
      expect(result).toHaveLength(1);
      expect(result[0].keyword).toBe('コンビニ');
      expect(result[0].category).toBeDefined();
      expect(result[0].category.name).toBe('食費');
    });

    it('should return rules ordered by keyword', async () => {
      const category2 = await prisma.category.create({
        data: { name: '交通費' },
      });

      await prisma.autoRule.createMany({
        data: [
          { keyword: 'タクシー', categoryId: category2.id },
          { keyword: 'コンビニ', categoryId: testCategoryId },
        ],
      });

      const result = await service.getAll();
      expect(result).toHaveLength(2);
      expect(result[0].keyword).toBe('コンビニ');
      expect(result[1].keyword).toBe('タクシー');
    });
  });

  describe('findByKeyword', () => {
    it('should return rule matching keyword exactly', async () => {
      await prisma.autoRule.create({
        data: {
          keyword: 'セブンイレブン',
          categoryId: testCategoryId,
        },
      });

      const result = await service.findByKeyword('セブンイレブン');
      expect(result).not.toBeNull();
      expect(result?.keyword).toBe('セブンイレブン');
      expect(result?.category.name).toBe('食費');
    });

    it('should return null for non-matching keyword', async () => {
      const result = await service.findByKeyword('存在しないキーワード');
      expect(result).toBeNull();
    });

    it('should match partial keyword in description', async () => {
      await prisma.autoRule.create({
        data: {
          keyword: 'スーパー',
          categoryId: testCategoryId,
        },
      });

      const result = await service.findMatchingRule('イオンスーパー三鷹店');
      expect(result).not.toBeNull();
      expect(result?.keyword).toBe('スーパー');
    });

    it('should return null when no keyword matches description', async () => {
      await prisma.autoRule.create({
        data: {
          keyword: 'スーパー',
          categoryId: testCategoryId,
        },
      });

      const result = await service.findMatchingRule('コンビニローソン');
      expect(result).toBeNull();
    });
  });

  describe('createOrUpdate', () => {
    it('should create new rule', async () => {
      const result = await service.createOrUpdate('コンビニ', testCategoryId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.keyword).toBe('コンビニ');
        expect(result.data.categoryId).toBe(testCategoryId);
      }
    });

    it('should update existing rule', async () => {
      await prisma.autoRule.create({
        data: {
          keyword: 'コンビニ',
          categoryId: testCategoryId,
        },
      });

      const newCategory = await prisma.category.create({
        data: { name: '日用品' },
      });

      const result = await service.createOrUpdate('コンビニ', newCategory.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.keyword).toBe('コンビニ');
        expect(result.data.categoryId).toBe(newCategory.id);
      }

      // Verify only one rule exists
      const allRules = await prisma.autoRule.findMany();
      expect(allRules).toHaveLength(1);
    });

    it('should return error for invalid category', async () => {
      const result = await service.createOrUpdate('コンビニ', 9999);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('INVALID_CATEGORY');
      }
    });

    it('should return error for empty keyword', async () => {
      const result = await service.createOrUpdate('', testCategoryId);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('VALIDATION_ERROR');
      }
    });

    it('should trim keyword whitespace', async () => {
      const result = await service.createOrUpdate('  コンビニ  ', testCategoryId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.keyword).toBe('コンビニ');
      }
    });
  });

  describe('delete', () => {
    it('should delete existing rule', async () => {
      const rule = await prisma.autoRule.create({
        data: {
          keyword: 'コンビニ',
          categoryId: testCategoryId,
        },
      });

      const result = await service.delete(rule.id);
      expect(result.success).toBe(true);

      const deleted = await prisma.autoRule.findUnique({
        where: { id: rule.id },
      });
      expect(deleted).toBeNull();
    });

    it('should return error for non-existent rule', async () => {
      const result = await service.delete(9999);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('NOT_FOUND');
      }
    });
  });

  describe('findById', () => {
    it('should return rule by id', async () => {
      const rule = await prisma.autoRule.create({
        data: {
          keyword: 'コンビニ',
          categoryId: testCategoryId,
        },
      });

      const result = await service.findById(rule.id);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.keyword).toBe('コンビニ');
      }
    });

    it('should return error for non-existent rule', async () => {
      const result = await service.findById(9999);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('NOT_FOUND');
      }
    });
  });
});
