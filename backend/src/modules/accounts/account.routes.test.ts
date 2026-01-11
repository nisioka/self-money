import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import { accountRoutes } from './account.routes.js';
import { EncryptionService } from '../security/encryption.service.js';

const prisma = new PrismaClient();

describe('Account Routes', () => {
  const fastify = Fastify();
  let encryptionService: EncryptionService;

  beforeAll(async () => {
    await prisma.$connect();
    process.env['MASTER_KEY'] = 'a'.repeat(64);
    encryptionService = new EncryptionService();
    await fastify.register(accountRoutes, { prisma, encryptionService });
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
  });

  describe('GET /api/accounts', () => {
    it('should return empty array when no accounts exist', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/accounts',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it('should return all accounts with balance', async () => {
      await prisma.account.createMany({
        data: [
          { name: '楽天銀行', type: 'BANK', balance: 100000 },
          { name: '楽天カード', type: 'CARD', balance: -50000 },
        ],
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/accounts',
      });

      expect(response.statusCode).toBe(200);
      const accounts = response.json();
      expect(accounts).toHaveLength(2);
      expect(accounts[0]).toHaveProperty('balance');
    });
  });

  describe('GET /api/accounts/:id', () => {
    it('should return account by id', async () => {
      const account = await prisma.account.create({
        data: { name: '楽天銀行', type: 'BANK', balance: 100000 },
      });

      const response = await fastify.inject({
        method: 'GET',
        url: `/api/accounts/${account.id}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().name).toBe('楽天銀行');
    });

    it('should return 404 for non-existent account', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/accounts/9999',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for invalid id', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/accounts/invalid',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/accounts', () => {
    it('should create account without credentials', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/accounts',
        payload: {
          name: '現金',
          type: 'CASH',
          initialBalance: 10000,
        },
      });

      expect(response.statusCode).toBe(201);
      const account = response.json();
      expect(account.name).toBe('現金');
      expect(account.type).toBe('CASH');
      expect(account.balance).toBe(10000);
    });

    it('should create account with credentials', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/accounts',
        payload: {
          name: '楽天銀行',
          type: 'BANK',
          credentials: {
            loginId: 'user123',
            password: 'pass123',
          },
        },
      });

      expect(response.statusCode).toBe(201);
      const account = response.json();
      expect(account.name).toBe('楽天銀行');
      // credentials should not be returned in response
      expect(account.encryptedCredentials).toBeUndefined();
    });

    it('should return 400 for missing name', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/accounts',
        payload: { type: 'BANK' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for missing type', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/accounts',
        payload: { name: 'Test' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid account type', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/accounts',
        payload: { name: 'Test', type: 'INVALID' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for empty name', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/accounts',
        payload: { name: '', type: 'BANK' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('PATCH /api/accounts/:id', () => {
    it('should update account name', async () => {
      const account = await prisma.account.create({
        data: { name: '楽天銀行', type: 'BANK' },
      });

      const response = await fastify.inject({
        method: 'PATCH',
        url: `/api/accounts/${account.id}`,
        payload: { name: '楽天銀行（メイン）' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().name).toBe('楽天銀行（メイン）');
    });

    it('should update credentials', async () => {
      const account = await prisma.account.create({
        data: { name: '楽天銀行', type: 'BANK' },
      });

      const response = await fastify.inject({
        method: 'PATCH',
        url: `/api/accounts/${account.id}`,
        payload: {
          credentials: { loginId: 'newuser', password: 'newpass' },
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify credentials were stored
      const updated = await prisma.account.findUnique({
        where: { id: account.id },
      });
      expect(updated?.encryptedCredentials).toBeDefined();
    });

    it('should return 404 for non-existent account', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/accounts/9999',
        payload: { name: 'Test' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for invalid id', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/accounts/invalid',
        payload: { name: 'Test' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for empty name', async () => {
      const account = await prisma.account.create({
        data: { name: '楽天銀行', type: 'BANK' },
      });

      const response = await fastify.inject({
        method: 'PATCH',
        url: `/api/accounts/${account.id}`,
        payload: { name: '' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/accounts/:id', () => {
    it('should delete account without transactions', async () => {
      const account = await prisma.account.create({
        data: { name: '楽天銀行', type: 'BANK' },
      });

      const response = await fastify.inject({
        method: 'DELETE',
        url: `/api/accounts/${account.id}`,
      });

      expect(response.statusCode).toBe(204);

      const deleted = await prisma.account.findUnique({
        where: { id: account.id },
      });
      expect(deleted).toBeNull();
    });

    it('should return 404 for non-existent account', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/accounts/9999',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 409 when account has transactions', async () => {
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

      const response = await fastify.inject({
        method: 'DELETE',
        url: `/api/accounts/${account.id}`,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().transactionCount).toBe(1);
    });

    it('should return 400 for invalid id', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/accounts/invalid',
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
