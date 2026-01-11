import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { AnalyticsService } from './analytics.service.js';

const prisma = new PrismaClient();

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let accountId: number;
  let categoryFood: number;
  let categorySalary: number;
  let categoryUtility: number;

  beforeAll(async () => {
    await prisma.$connect();
    service = new AnalyticsService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up
    await prisma.transaction.deleteMany();
    await prisma.autoRule.deleteMany();
    await prisma.category.deleteMany();
    await prisma.account.deleteMany();

    // Create test account
    const account = await prisma.account.create({
      data: { name: '楽天銀行', type: 'BANK' },
    });
    accountId = account.id;

    // Create test categories
    const food = await prisma.category.create({
      data: { name: '食費' },
    });
    categoryFood = food.id;

    const salary = await prisma.category.create({
      data: { name: '給与' },
    });
    categorySalary = salary.id;

    const utility = await prisma.category.create({
      data: { name: '水道光熱費' },
    });
    categoryUtility = utility.id;
  });

  describe('getMonthlySummary', () => {
    it('should return zero values when no transactions exist', async () => {
      const result = await service.getMonthlySummary(2026, 1);

      expect(result.year).toBe(2026);
      expect(result.month).toBe(1);
      expect(result.totalIncome).toBe(0);
      expect(result.totalExpense).toBe(0);
      expect(result.netBalance).toBe(0);
    });

    it('should calculate total income correctly', async () => {
      await prisma.transaction.createMany({
        data: [
          {
            date: new Date('2026-01-15'),
            amount: 300000, // 給与
            description: '給与振込',
            categoryId: categorySalary,
            accountId,
            isManual: false,
          },
          {
            date: new Date('2026-01-20'),
            amount: 50000, // 臨時収入
            description: '副業収入',
            categoryId: categorySalary,
            accountId,
            isManual: false,
          },
        ],
      });

      const result = await service.getMonthlySummary(2026, 1);

      expect(result.totalIncome).toBe(350000);
      expect(result.totalExpense).toBe(0);
      expect(result.netBalance).toBe(350000);
    });

    it('should calculate total expense correctly', async () => {
      await prisma.transaction.createMany({
        data: [
          {
            date: new Date('2026-01-10'),
            amount: -5000,
            description: 'スーパーマーケット',
            categoryId: categoryFood,
            accountId,
            isManual: false,
          },
          {
            date: new Date('2026-01-15'),
            amount: -10000,
            description: '電気代',
            categoryId: categoryUtility,
            accountId,
            isManual: false,
          },
        ],
      });

      const result = await service.getMonthlySummary(2026, 1);

      expect(result.totalIncome).toBe(0);
      expect(result.totalExpense).toBe(15000);
      expect(result.netBalance).toBe(-15000);
    });

    it('should calculate net balance correctly', async () => {
      await prisma.transaction.createMany({
        data: [
          {
            date: new Date('2026-01-15'),
            amount: 300000,
            description: '給与振込',
            categoryId: categorySalary,
            accountId,
            isManual: false,
          },
          {
            date: new Date('2026-01-20'),
            amount: -50000,
            description: '食費',
            categoryId: categoryFood,
            accountId,
            isManual: false,
          },
          {
            date: new Date('2026-01-25'),
            amount: -20000,
            description: '水道光熱費',
            categoryId: categoryUtility,
            accountId,
            isManual: false,
          },
        ],
      });

      const result = await service.getMonthlySummary(2026, 1);

      expect(result.totalIncome).toBe(300000);
      expect(result.totalExpense).toBe(70000);
      expect(result.netBalance).toBe(230000);
    });

    it('should only include transactions from the specified month', async () => {
      await prisma.transaction.createMany({
        data: [
          {
            date: new Date('2026-01-15'),
            amount: 100000,
            description: '1月の収入',
            categoryId: categorySalary,
            accountId,
            isManual: false,
          },
          {
            date: new Date('2026-02-15'),
            amount: 200000,
            description: '2月の収入',
            categoryId: categorySalary,
            accountId,
            isManual: false,
          },
        ],
      });

      const jan = await service.getMonthlySummary(2026, 1);
      const feb = await service.getMonthlySummary(2026, 2);

      expect(jan.totalIncome).toBe(100000);
      expect(feb.totalIncome).toBe(200000);
    });
  });

  describe('getCategoryBreakdown', () => {
    it('should return empty array when no transactions exist', async () => {
      const result = await service.getCategoryBreakdown(2026, 1);

      expect(result).toEqual([]);
    });

    it('should return category breakdown for expenses', async () => {
      await prisma.transaction.createMany({
        data: [
          {
            date: new Date('2026-01-10'),
            amount: -30000,
            description: '食費1',
            categoryId: categoryFood,
            accountId,
            isManual: false,
          },
          {
            date: new Date('2026-01-15'),
            amount: -20000,
            description: '食費2',
            categoryId: categoryFood,
            accountId,
            isManual: false,
          },
          {
            date: new Date('2026-01-20'),
            amount: -10000,
            description: '電気代',
            categoryId: categoryUtility,
            accountId,
            isManual: false,
          },
        ],
      });

      const result = await service.getCategoryBreakdown(2026, 1);

      expect(result).toHaveLength(2);

      const foodCategory = result.find((c) => c.categoryId === categoryFood);
      expect(foodCategory).toBeDefined();
      expect(foodCategory?.amount).toBe(50000);
      expect(foodCategory?.percentage).toBeCloseTo(83.33, 1);

      const utilityCategory = result.find(
        (c) => c.categoryId === categoryUtility
      );
      expect(utilityCategory).toBeDefined();
      expect(utilityCategory?.amount).toBe(10000);
      expect(utilityCategory?.percentage).toBeCloseTo(16.67, 1);
    });

    it('should sort by amount descending', async () => {
      await prisma.transaction.createMany({
        data: [
          {
            date: new Date('2026-01-10'),
            amount: -10000,
            description: '食費',
            categoryId: categoryFood,
            accountId,
            isManual: false,
          },
          {
            date: new Date('2026-01-15'),
            amount: -50000,
            description: '電気代',
            categoryId: categoryUtility,
            accountId,
            isManual: false,
          },
        ],
      });

      const result = await service.getCategoryBreakdown(2026, 1);

      expect(result[0].categoryId).toBe(categoryUtility);
      expect(result[1].categoryId).toBe(categoryFood);
    });

    it('should only include expenses (negative amounts)', async () => {
      await prisma.transaction.createMany({
        data: [
          {
            date: new Date('2026-01-10'),
            amount: 300000, // 収入
            description: '給与',
            categoryId: categorySalary,
            accountId,
            isManual: false,
          },
          {
            date: new Date('2026-01-15'),
            amount: -50000, // 支出
            description: '食費',
            categoryId: categoryFood,
            accountId,
            isManual: false,
          },
        ],
      });

      const result = await service.getCategoryBreakdown(2026, 1);

      expect(result).toHaveLength(1);
      expect(result[0].categoryId).toBe(categoryFood);
    });
  });

  describe('getMonthlyTrend', () => {
    it('should return empty array when months is 0', async () => {
      const result = await service.getMonthlyTrend(0);

      expect(result).toEqual([]);
    });

    it('should return trend data for specified number of months', async () => {
      // 1月と2月のデータを作成
      await prisma.transaction.createMany({
        data: [
          {
            date: new Date('2026-01-15'),
            amount: 300000,
            description: '1月給与',
            categoryId: categorySalary,
            accountId,
            isManual: false,
          },
          {
            date: new Date('2026-01-20'),
            amount: -50000,
            description: '1月支出',
            categoryId: categoryFood,
            accountId,
            isManual: false,
          },
        ],
      });

      const result = await service.getMonthlyTrend(3);

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]).toHaveProperty('year');
      expect(result[0]).toHaveProperty('month');
      expect(result[0]).toHaveProperty('income');
      expect(result[0]).toHaveProperty('expense');
    });

    it('should include months with no transactions', async () => {
      // 現在月のみデータを作成
      const now = new Date();
      await prisma.transaction.create({
        data: {
          date: now,
          amount: 100000,
          description: '今月の収入',
          categoryId: categorySalary,
          accountId,
          isManual: false,
        },
      });

      const result = await service.getMonthlyTrend(3);

      // 3ヶ月分のデータがあること
      expect(result).toHaveLength(3);
    });

    it('should order by date ascending (oldest first)', async () => {
      const result = await service.getMonthlyTrend(3);

      // 古い順に並んでいること
      for (let i = 1; i < result.length; i++) {
        const prevDate = new Date(result[i - 1].year, result[i - 1].month - 1);
        const currDate = new Date(result[i].year, result[i].month - 1);
        expect(currDate.getTime()).toBeGreaterThanOrEqual(prevDate.getTime());
      }
    });
  });
});
