import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import { categoryRoutes } from './category.routes.js';

const prisma = new PrismaClient();

describe('Category Routes', () => {
  const fastify = Fastify();

  beforeAll(async () => {
    await prisma.$connect();
    await fastify.register(categoryRoutes, { prisma });
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

  describe('GET /api/categories', () => {
    it('should return empty array when no categories exist', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/categories',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it('should return all categories', async () => {
      await prisma.category.createMany({
        data: [{ name: '食費' }, { name: '交通費' }],
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/categories',
      });

      expect(response.statusCode).toBe(200);
      const categories = response.json();
      expect(categories).toHaveLength(2);
    });
  });

  describe('POST /api/categories', () => {
    it('should create a new category', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/categories',
        payload: { name: '食費' },
      });

      expect(response.statusCode).toBe(201);
      const category = response.json();
      expect(category.name).toBe('食費');
      expect(category.id).toBeDefined();
    });

    it('should return 400 for missing name', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/categories',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for empty name', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/categories',
        payload: { name: '' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 409 for duplicate name', async () => {
      await prisma.category.create({ data: { name: '食費' } });

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/categories',
        payload: { name: '食費' },
      });

      expect(response.statusCode).toBe(409);
    });
  });

  describe('PATCH /api/categories/:id', () => {
    it('should update category name', async () => {
      const category = await prisma.category.create({ data: { name: '食費' } });

      const response = await fastify.inject({
        method: 'PATCH',
        url: `/api/categories/${category.id}`,
        payload: { name: '食料品' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().name).toBe('食料品');
    });

    it('should return 404 for non-existent category', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/categories/9999',
        payload: { name: '新しい名前' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 409 for duplicate name', async () => {
      await prisma.category.create({ data: { name: '食費' } });
      const category = await prisma.category.create({ data: { name: '交通費' } });

      const response = await fastify.inject({
        method: 'PATCH',
        url: `/api/categories/${category.id}`,
        payload: { name: '食費' },
      });

      expect(response.statusCode).toBe(409);
    });

    it('should return 400 for invalid id', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/categories/invalid',
        payload: { name: '新しい名前' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/categories/:id', () => {
    it('should delete category', async () => {
      const category = await prisma.category.create({ data: { name: '食費' } });

      const response = await fastify.inject({
        method: 'DELETE',
        url: `/api/categories/${category.id}`,
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 404 for non-existent category', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/categories/9999',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 409 when category has transactions', async () => {
      const category = await prisma.category.create({ data: { name: '食費' } });
      const account = await prisma.account.create({ data: { name: 'Test', type: 'BANK' } });
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
        url: `/api/categories/${category.id}`,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().transactionCount).toBe(1);
    });
  });
});
