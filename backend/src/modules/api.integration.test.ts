import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import { categoryRoutes } from './categories/category.routes.js';
import { accountRoutes } from './accounts/account.routes.js';
import { transactionRoutes } from './transactions/transaction.routes.js';
import { jobRoutes } from './jobs/job.routes.js';
import { analyticsRoutes } from './analytics/analytics.routes.js';

const prisma = new PrismaClient();

describe('API Integration Tests', () => {
  const fastify = Fastify();

  beforeAll(async () => {
    await prisma.$connect();
    await fastify.register(categoryRoutes, { prisma });
    await fastify.register(accountRoutes, { prisma });
    await fastify.register(transactionRoutes, { prisma });
    await fastify.register(jobRoutes, { prisma });
    await fastify.register(analyticsRoutes, { prisma });
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.job.deleteMany();
    await prisma.autoRule.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.category.deleteMany();
    await prisma.account.deleteMany();
  });

  describe('Cross-module flow: Category -> Transaction -> Analytics', () => {
    it('should create category, transaction, and verify analytics', async () => {
      // 1. Create category
      const categoryRes = await fastify.inject({
        method: 'POST',
        url: '/api/categories',
        payload: { name: '食費' },
      });
      expect(categoryRes.statusCode).toBe(201);
      const category = categoryRes.json();

      // 2. Create account
      const accountRes = await fastify.inject({
        method: 'POST',
        url: '/api/accounts',
        payload: { name: '楽天銀行', type: 'BANK' },
      });
      expect(accountRes.statusCode).toBe(201);
      const account = accountRes.json();

      // 3. Create transactions
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: {
          date: new Date(year, month - 1, 15).toISOString(),
          amount: -5000,
          description: 'スーパーマーケット',
          accountId: account.id,
          categoryId: category.id,
        },
      });

      await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: {
          date: new Date(year, month - 1, 20).toISOString(),
          amount: -3000,
          description: 'コンビニ',
          accountId: account.id,
          categoryId: category.id,
        },
      });

      // 4. Verify analytics monthly summary
      const summaryRes = await fastify.inject({
        method: 'GET',
        url: `/api/analytics/monthly?year=${year}&month=${month}`,
      });
      expect(summaryRes.statusCode).toBe(200);
      const summary = summaryRes.json();
      expect(summary.totalExpense).toBe(8000);
      expect(summary.totalIncome).toBe(0);
      expect(summary.netBalance).toBe(-8000);

      // 5. Verify category breakdown
      const breakdownRes = await fastify.inject({
        method: 'GET',
        url: `/api/analytics/categories?year=${year}&month=${month}`,
      });
      expect(breakdownRes.statusCode).toBe(200);
      const breakdown = breakdownRes.json();
      expect(breakdown).toHaveLength(1);
      expect(breakdown[0].categoryName).toBe('食費');
      expect(breakdown[0].amount).toBe(8000);
      expect(breakdown[0].percentage).toBe(100);
    });
  });

  describe('Account-Transaction relationship', () => {
    it('should filter transactions by account', async () => {
      // Create category
      const categoryRes = await fastify.inject({
        method: 'POST',
        url: '/api/categories',
        payload: { name: '交通費' },
      });
      const category = categoryRes.json();

      // Create two accounts
      const account1Res = await fastify.inject({
        method: 'POST',
        url: '/api/accounts',
        payload: { name: '楽天銀行', type: 'BANK' },
      });
      const account1 = account1Res.json();

      const account2Res = await fastify.inject({
        method: 'POST',
        url: '/api/accounts',
        payload: { name: '三井住友銀行', type: 'BANK' },
      });
      const account2 = account2Res.json();

      // Create transactions for each account
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: {
          date: new Date(year, month - 1, 10).toISOString(),
          amount: -1000,
          description: '楽天の取引',
          accountId: account1.id,
          categoryId: category.id,
        },
      });

      await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: {
          date: new Date(year, month - 1, 11).toISOString(),
          amount: -2000,
          description: 'SMBCの取引',
          accountId: account2.id,
          categoryId: category.id,
        },
      });

      // Filter by account1
      const filteredRes = await fastify.inject({
        method: 'GET',
        url: `/api/transactions?year=${year}&month=${month}&accountId=${account1.id}`,
      });
      expect(filteredRes.statusCode).toBe(200);
      const filtered = filteredRes.json();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].description).toBe('楽天の取引');
    });
  });

  describe('Job submission API', () => {
    it('should submit job and retrieve status', async () => {
      // Submit job
      const submitRes = await fastify.inject({
        method: 'POST',
        url: '/api/jobs',
        payload: { type: 'SCRAPE_ALL' },
      });
      expect(submitRes.statusCode).toBe(202);
      const job = submitRes.json();
      expect(job.status).toBe('pending');

      // Get job status
      const statusRes = await fastify.inject({
        method: 'GET',
        url: `/api/jobs/${job.id}`,
      });
      expect(statusRes.statusCode).toBe(200);
      expect(statusRes.json().status).toBe('pending');

      // List recent jobs
      const listRes = await fastify.inject({
        method: 'GET',
        url: '/api/jobs',
      });
      expect(listRes.statusCode).toBe(200);
      const jobs = listRes.json();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].id).toBe(job.id);
    });

    it('should submit SCRAPE_SPECIFIC job with target account', async () => {
      // Create account first
      const accountRes = await fastify.inject({
        method: 'POST',
        url: '/api/accounts',
        payload: { name: '楽天銀行', type: 'BANK' },
      });
      const account = accountRes.json();

      // Submit specific job
      const submitRes = await fastify.inject({
        method: 'POST',
        url: '/api/jobs',
        payload: {
          type: 'SCRAPE_SPECIFIC',
          targetAccountId: account.id,
        },
      });
      expect(submitRes.statusCode).toBe(202);
      const job = submitRes.json();
      expect(job.type).toBe('SCRAPE_SPECIFIC');
      expect(job.targetAccountId).toBe(account.id);
    });
  });

  describe('Category management with constraints', () => {
    it('should prevent deletion of category with transactions', async () => {
      // Create category
      const categoryRes = await fastify.inject({
        method: 'POST',
        url: '/api/categories',
        payload: { name: '食費' },
      });
      const category = categoryRes.json();

      // Create account
      const accountRes = await fastify.inject({
        method: 'POST',
        url: '/api/accounts',
        payload: { name: '楽天銀行', type: 'BANK' },
      });
      const account = accountRes.json();

      // Create transaction with this category
      await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: {
          date: new Date().toISOString(),
          amount: -1000,
          description: 'テスト',
          accountId: account.id,
          categoryId: category.id,
        },
      });

      // Try to delete category
      const deleteRes = await fastify.inject({
        method: 'DELETE',
        url: `/api/categories/${category.id}`,
      });
      expect(deleteRes.statusCode).toBe(409);
      const error = deleteRes.json();
      expect(error.transactionCount).toBe(1);
    });

    it('should prevent duplicate category names', async () => {
      // Create first category
      await fastify.inject({
        method: 'POST',
        url: '/api/categories',
        payload: { name: '食費' },
      });

      // Try to create duplicate
      const duplicateRes = await fastify.inject({
        method: 'POST',
        url: '/api/categories',
        payload: { name: '食費' },
      });
      expect(duplicateRes.statusCode).toBe(409);
    });
  });

  describe('Transaction validation', () => {
    it('should return error for invalid account', async () => {
      const categoryRes = await fastify.inject({
        method: 'POST',
        url: '/api/categories',
        payload: { name: '食費' },
      });
      const category = categoryRes.json();

      const res = await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: {
          date: new Date().toISOString(),
          amount: -1000,
          description: 'テスト',
          accountId: 9999,
          categoryId: category.id,
        },
      });
      // Expect either 400 (Bad Request) or 422 (Unprocessable Entity)
      expect([400, 422]).toContain(res.statusCode);
    });

    it('should return error for invalid category', async () => {
      const accountRes = await fastify.inject({
        method: 'POST',
        url: '/api/accounts',
        payload: { name: '楽天銀行', type: 'BANK' },
      });
      const account = accountRes.json();

      const res = await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: {
          date: new Date().toISOString(),
          amount: -1000,
          description: 'テスト',
          accountId: account.id,
          categoryId: 9999,
        },
      });
      // Expect either 400 (Bad Request) or 422 (Unprocessable Entity)
      expect([400, 422]).toContain(res.statusCode);
    });
  });

  describe('Analytics trend API', () => {
    it('should return monthly trend data', async () => {
      // Create test data
      const categoryRes = await fastify.inject({
        method: 'POST',
        url: '/api/categories',
        payload: { name: '給与' },
      });
      const category = categoryRes.json();

      const accountRes = await fastify.inject({
        method: 'POST',
        url: '/api/accounts',
        payload: { name: '楽天銀行', type: 'BANK' },
      });
      const account = accountRes.json();

      const now = new Date();
      await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: {
          date: now.toISOString(),
          amount: 300000,
          description: '給与振込',
          accountId: account.id,
          categoryId: category.id,
        },
      });

      // Get trend
      const trendRes = await fastify.inject({
        method: 'GET',
        url: '/api/analytics/trend?months=3',
      });
      expect(trendRes.statusCode).toBe(200);
      const trend = trendRes.json();
      expect(trend).toHaveLength(3);

      // Verify current month has data
      const currentMonth = trend.find(
        (t: { year: number; month: number }) =>
          t.year === now.getFullYear() && t.month === now.getMonth() + 1
      );
      expect(currentMonth).toBeDefined();
      expect(currentMonth.income).toBe(300000);
    });
  });
});
