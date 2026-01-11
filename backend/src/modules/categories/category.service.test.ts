import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { CategoryService } from './category.service.js';

const prisma = new PrismaClient();

describe('CategoryService', () => {
  let service: CategoryService;

  beforeAll(async () => {
    await prisma.$connect();
    service = new CategoryService(prisma);
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
    it('should return empty array when no categories exist', async () => {
      const result = await service.getAll();
      expect(result).toEqual([]);
    });

    it('should return all categories', async () => {
      await prisma.category.createMany({
        data: [
          { name: '食費' },
          { name: '交通費' },
        ],
      });

      const result = await service.getAll();
      expect(result).toHaveLength(2);
      expect(result.map(c => c.name)).toContain('食費');
      expect(result.map(c => c.name)).toContain('交通費');
    });
  });

  describe('create', () => {
    it('should create a new category', async () => {
      const result = await service.create('食費');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('食費');
        expect(result.data.id).toBeDefined();
      }
    });

    it('should return error for duplicate name', async () => {
      await prisma.category.create({ data: { name: '食費' } });

      const result = await service.create('食費');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('DUPLICATE_NAME');
      }
    });

    it('should return error for empty name', async () => {
      const result = await service.create('');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('VALIDATION_ERROR');
      }
    });

    it('should return error for whitespace-only name', async () => {
      const result = await service.create('   ');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('update', () => {
    it('should update category name', async () => {
      const category = await prisma.category.create({ data: { name: '食費' } });

      const result = await service.update(category.id, '食料品');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('食料品');
      }
    });

    it('should return error for non-existent category', async () => {
      const result = await service.update(9999, '新しい名前');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('NOT_FOUND');
      }
    });

    it('should return error for duplicate name', async () => {
      await prisma.category.create({ data: { name: '食費' } });
      const category = await prisma.category.create({ data: { name: '交通費' } });

      const result = await service.update(category.id, '食費');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('DUPLICATE_NAME');
      }
    });
  });

  describe('delete', () => {
    it('should delete category without transactions', async () => {
      const category = await prisma.category.create({ data: { name: '食費' } });

      const result = await service.delete(category.id);

      expect(result.success).toBe(true);

      const deleted = await prisma.category.findUnique({ where: { id: category.id } });
      expect(deleted).toBeNull();
    });

    it('should return error for non-existent category', async () => {
      const result = await service.delete(9999);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('NOT_FOUND');
      }
    });

    it('should return error when category has transactions', async () => {
      const category = await prisma.category.create({ data: { name: '食費' } });
      const account = await prisma.account.create({ data: { name: 'Test Bank', type: 'BANK' } });
      await prisma.transaction.create({
        data: {
          date: new Date(),
          amount: -1000,
          description: 'Test',
          accountId: account.id,
          categoryId: category.id,
        },
      });

      const result = await service.delete(category.id);

      expect(result.success).toBe(false);
      if (!result.success && result.error.type === 'IN_USE') {
        expect(result.error.transactionCount).toBe(1);
      } else {
        throw new Error('Expected IN_USE error');
      }
    });
  });

  describe('seedDefaults', () => {
    it('should seed default categories', async () => {
      await service.seedDefaults();

      const categories = await prisma.category.findMany();
      expect(categories.length).toBeGreaterThanOrEqual(15);
      expect(categories.every(c => c.isDefault)).toBe(true);
    });

    it('should not duplicate categories on multiple calls', async () => {
      await service.seedDefaults();
      await service.seedDefaults();

      const categories = await prisma.category.findMany();
      const uniqueNames = new Set(categories.map(c => c.name));
      expect(categories.length).toBe(uniqueNames.size);
    });

    it('should include common expense categories', async () => {
      await service.seedDefaults();

      const categories = await prisma.category.findMany();
      const names = categories.map(c => c.name);

      expect(names).toContain('食費');
      expect(names).toContain('交通費');
      expect(names).toContain('住居費');
      expect(names).toContain('光熱費');
    });
  });
});
