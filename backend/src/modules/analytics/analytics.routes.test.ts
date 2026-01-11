import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import { analyticsRoutes } from './analytics.routes.js';

const prisma = new PrismaClient();

describe('Analytics Routes', () => {
  const fastify = Fastify();
  let accountId: number;
  let categoryFood: number;
  let categorySalary: number;

  beforeAll(async () => {
    await prisma.$connect();
    await fastify.register(analyticsRoutes, { prisma });
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.transaction.deleteMany();
    await prisma.autoRule.deleteMany();
    await prisma.category.deleteMany();
    await prisma.account.deleteMany();

    const account = await prisma.account.create({
      data: { name: '楽天銀行', type: 'BANK' },
    });
    accountId = account.id;

    const food = await prisma.category.create({
      data: { name: '食費' },
    });
    categoryFood = food.id;

    const salary = await prisma.category.create({
      data: { name: '給与' },
    });
    categorySalary = salary.id;
  });

  describe('GET /api/analytics/monthly', () => {
    it('should return monthly summary', async () => {
      await prisma.transaction.createMany({
        data: [
          {
            date: new Date('2026-01-15'),
            amount: 300000,
            description: '給与',
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
        ],
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/analytics/monthly?year=2026&month=1',
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.year).toBe(2026);
      expect(data.month).toBe(1);
      expect(data.totalIncome).toBe(300000);
      expect(data.totalExpense).toBe(50000);
      expect(data.netBalance).toBe(250000);
    });

    it('should return 400 for missing year', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/analytics/monthly?month=1',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for missing month', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/analytics/monthly?year=2026',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid month', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/analytics/monthly?year=2026&month=13',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should use current date when no parameters provided', async () => {
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

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/analytics/monthly',
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.year).toBe(now.getFullYear());
      expect(data.month).toBe(now.getMonth() + 1);
    });
  });

  describe('GET /api/analytics/categories', () => {
    it('should return category breakdown', async () => {
      await prisma.transaction.createMany({
        data: [
          {
            date: new Date('2026-01-10'),
            amount: -30000,
            description: '食費',
            categoryId: categoryFood,
            accountId,
            isManual: false,
          },
          {
            date: new Date('2026-01-15'),
            amount: -20000,
            description: '追加食費',
            categoryId: categoryFood,
            accountId,
            isManual: false,
          },
        ],
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/analytics/categories?year=2026&month=1',
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data).toHaveLength(1);
      expect(data[0].categoryId).toBe(categoryFood);
      expect(data[0].amount).toBe(50000);
      expect(data[0].percentage).toBe(100);
    });

    it('should return empty array when no expenses', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/analytics/categories?year=2026&month=1',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it('should use current date when no parameters provided', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/analytics/categories',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /api/analytics/trend', () => {
    it('should return monthly trend', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/analytics/trend?months=3',
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data).toHaveLength(3);
      expect(data[0]).toHaveProperty('year');
      expect(data[0]).toHaveProperty('month');
      expect(data[0]).toHaveProperty('income');
      expect(data[0]).toHaveProperty('expense');
    });

    it('should default to 6 months', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/analytics/trend',
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data).toHaveLength(6);
    });

    it('should return 400 for invalid months', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/analytics/trend?months=0',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for negative months', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/analytics/trend?months=-1',
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
