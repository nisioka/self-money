import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import { jobRoutes } from './job.routes.js';

const prisma = new PrismaClient();

describe('Job Routes', () => {
  const fastify = Fastify();

  beforeAll(async () => {
    await prisma.$connect();
    await fastify.register(jobRoutes, { prisma });
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

  describe('POST /api/jobs', () => {
    it('should create a SCRAPE_ALL job', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/jobs',
        payload: { type: 'SCRAPE_ALL' },
      });

      expect(response.statusCode).toBe(202);
      const job = response.json();
      expect(job.type).toBe('SCRAPE_ALL');
      expect(job.status).toBe('pending');
      expect(job.id).toBeDefined();
    });

    it('should create a SCRAPE_SPECIFIC job with target account', async () => {
      const account = await prisma.account.create({
        data: { name: '楽天銀行', type: 'BANK' },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/jobs',
        payload: {
          type: 'SCRAPE_SPECIFIC',
          targetAccountId: account.id,
        },
      });

      expect(response.statusCode).toBe(202);
      const job = response.json();
      expect(job.type).toBe('SCRAPE_SPECIFIC');
      expect(job.targetAccountId).toBe(account.id);
    });

    it('should return 400 for missing type', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/jobs',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid type', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/jobs',
        payload: { type: 'INVALID_TYPE' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/jobs', () => {
    it('should return recent jobs', async () => {
      await prisma.job.createMany({
        data: [
          { type: 'SCRAPE_ALL', status: 'completed' },
          { type: 'SCRAPE_ALL', status: 'pending' },
        ],
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/jobs',
      });

      expect(response.statusCode).toBe(200);
      const jobs = response.json();
      expect(jobs).toHaveLength(2);
    });

    it('should respect limit parameter', async () => {
      await prisma.job.createMany({
        data: [
          { type: 'SCRAPE_ALL', status: 'completed' },
          { type: 'SCRAPE_ALL', status: 'completed' },
          { type: 'SCRAPE_ALL', status: 'pending' },
        ],
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/jobs?limit=2',
      });

      expect(response.statusCode).toBe(200);
      const jobs = response.json();
      expect(jobs).toHaveLength(2);
    });

    it('should return empty array when no jobs', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/jobs',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });
  });

  describe('GET /api/jobs/:id', () => {
    it('should return job by id', async () => {
      const job = await prisma.job.create({
        data: { type: 'SCRAPE_ALL', status: 'pending' },
      });

      const response = await fastify.inject({
        method: 'GET',
        url: `/api/jobs/${job.id}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().id).toBe(job.id);
    });

    it('should return 404 for non-existent job', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/jobs/non-existent-id',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
