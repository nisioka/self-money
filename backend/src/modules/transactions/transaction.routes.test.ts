import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import { transactionRoutes } from './transaction.routes.js';

const prisma = new PrismaClient();

describe('Transaction Routes', () => {
  const fastify = Fastify();
  let testAccountId: number;
  let testCategoryId: number;

  beforeAll(async () => {
    await prisma.$connect();
    await fastify.register(transactionRoutes, { prisma });
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
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

    const category = await prisma.category.create({
      data: { name: '食費' },
    });
    testCategoryId = category.id;
  });

  describe('GET /api/transactions', () => {
    it('should return transactions for current month by default', async () => {
      const now = new Date();
      await prisma.transaction.create({
        data: {
          date: now,
          amount: -1000,
          description: 'Test',
          accountId: testAccountId,
          categoryId: testCategoryId,
        },
      });

      const response = await fastify.inject({
        method: 'GET',
        url: `/api/transactions?year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
      });

      expect(response.statusCode).toBe(200);
      const transactions = response.json();
      expect(transactions).toHaveLength(1);
      expect(transactions[0].account).toBeDefined();
      expect(transactions[0].category).toBeDefined();
    });

    it('should filter by account when accountId provided', async () => {
      const anotherAccount = await prisma.account.create({
        data: { name: '三井住友銀行', type: 'BANK' },
      });

      const now = new Date();
      await prisma.transaction.createMany({
        data: [
          {
            date: now,
            amount: -1000,
            description: 'Rakuten',
            accountId: testAccountId,
            categoryId: testCategoryId,
          },
          {
            date: now,
            amount: -2000,
            description: 'SMBC',
            accountId: anotherAccount.id,
            categoryId: testCategoryId,
          },
        ],
      });

      const response = await fastify.inject({
        method: 'GET',
        url: `/api/transactions?year=${now.getFullYear()}&month=${now.getMonth() + 1}&accountId=${testAccountId}`,
      });

      expect(response.statusCode).toBe(200);
      const transactions = response.json();
      expect(transactions).toHaveLength(1);
      expect(transactions[0].description).toBe('Rakuten');
    });

    it('should return 400 for missing year or month', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/transactions',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/transactions/:id', () => {
    it('should return transaction by id', async () => {
      const transaction = await prisma.transaction.create({
        data: {
          date: new Date(),
          amount: -1000,
          description: 'Test',
          accountId: testAccountId,
          categoryId: testCategoryId,
        },
      });

      const response = await fastify.inject({
        method: 'GET',
        url: `/api/transactions/${transaction.id}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().id).toBe(transaction.id);
    });

    it('should return 404 for non-existent transaction', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/transactions/9999',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for invalid id', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/transactions/invalid',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/transactions', () => {
    it('should create a manual transaction', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: {
          date: '2026-01-15',
          amount: -1500,
          description: 'ランチ',
          accountId: testAccountId,
          categoryId: testCategoryId,
          isManual: true,
        },
      });

      expect(response.statusCode).toBe(201);
      const transaction = response.json();
      expect(transaction.amount).toBe(-1500);
      expect(transaction.description).toBe('ランチ');
      expect(transaction.isManual).toBe(true);
    });

    it('should create a transaction with memo', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: {
          date: '2026-01-15',
          amount: -1000,
          description: 'コンビニ',
          accountId: testAccountId,
          categoryId: testCategoryId,
          isManual: true,
          memo: 'お菓子購入',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().memo).toBe('お菓子購入');
    });

    it('should return 400 for missing required fields', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: {
          amount: -1000,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for empty description', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: {
          date: '2026-01-15',
          amount: -1000,
          description: '',
          accountId: testAccountId,
          categoryId: testCategoryId,
          isManual: true,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 422 for invalid category', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: {
          date: '2026-01-15',
          amount: -1000,
          description: 'Test',
          accountId: testAccountId,
          categoryId: 9999,
          isManual: true,
        },
      });

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 for invalid account', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: {
          date: '2026-01-15',
          amount: -1000,
          description: 'Test',
          accountId: 9999,
          categoryId: testCategoryId,
          isManual: true,
        },
      });

      expect(response.statusCode).toBe(422);
    });

    it('should return 409 for duplicate externalId', async () => {
      await prisma.transaction.create({
        data: {
          date: new Date(),
          amount: -1000,
          description: 'First',
          accountId: testAccountId,
          categoryId: testCategoryId,
          externalId: 'duplicate-id',
        },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: {
          date: '2026-01-15',
          amount: -2000,
          description: 'Second',
          accountId: testAccountId,
          categoryId: testCategoryId,
          isManual: false,
          externalId: 'duplicate-id',
        },
      });

      expect(response.statusCode).toBe(409);
    });
  });

  describe('PATCH /api/transactions/:id', () => {
    it('should update transaction amount', async () => {
      const transaction = await prisma.transaction.create({
        data: {
          date: new Date(),
          amount: -1000,
          description: 'Test',
          accountId: testAccountId,
          categoryId: testCategoryId,
        },
      });

      const response = await fastify.inject({
        method: 'PATCH',
        url: `/api/transactions/${transaction.id}`,
        payload: { amount: -1500 },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().amount).toBe(-1500);
    });

    it('should update transaction category', async () => {
      const transaction = await prisma.transaction.create({
        data: {
          date: new Date(),
          amount: -1000,
          description: 'Test',
          accountId: testAccountId,
          categoryId: testCategoryId,
        },
      });

      const newCategory = await prisma.category.create({
        data: { name: '交通費' },
      });

      const response = await fastify.inject({
        method: 'PATCH',
        url: `/api/transactions/${transaction.id}`,
        payload: { categoryId: newCategory.id },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().categoryId).toBe(newCategory.id);
    });

    it('should update transaction memo', async () => {
      const transaction = await prisma.transaction.create({
        data: {
          date: new Date(),
          amount: -1000,
          description: 'Test',
          accountId: testAccountId,
          categoryId: testCategoryId,
        },
      });

      const response = await fastify.inject({
        method: 'PATCH',
        url: `/api/transactions/${transaction.id}`,
        payload: { memo: '更新メモ' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().memo).toBe('更新メモ');
    });

    it('should return 404 for non-existent transaction', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/transactions/9999',
        payload: { amount: -1500 },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 422 for invalid category', async () => {
      const transaction = await prisma.transaction.create({
        data: {
          date: new Date(),
          amount: -1000,
          description: 'Test',
          accountId: testAccountId,
          categoryId: testCategoryId,
        },
      });

      const response = await fastify.inject({
        method: 'PATCH',
        url: `/api/transactions/${transaction.id}`,
        payload: { categoryId: 9999 },
      });

      expect(response.statusCode).toBe(422);
    });

    it('should return 400 for invalid id', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/transactions/invalid',
        payload: { amount: -1500 },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/transactions/:id', () => {
    it('should delete transaction', async () => {
      const transaction = await prisma.transaction.create({
        data: {
          date: new Date(),
          amount: -1000,
          description: 'Test',
          accountId: testAccountId,
          categoryId: testCategoryId,
        },
      });

      const response = await fastify.inject({
        method: 'DELETE',
        url: `/api/transactions/${transaction.id}`,
      });

      expect(response.statusCode).toBe(204);

      const deleted = await prisma.transaction.findUnique({
        where: { id: transaction.id },
      });
      expect(deleted).toBeNull();
    });

    it('should return 404 for non-existent transaction', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/transactions/9999',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for invalid id', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/transactions/invalid',
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
