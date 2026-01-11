import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { prisma } from './lib/prisma.js';
import { categoryRoutes } from './modules/categories/category.routes.js';
import { accountRoutes } from './modules/accounts/account.routes.js';
import { transactionRoutes } from './modules/transactions/transaction.routes.js';
import { jobRoutes } from './modules/jobs/job.routes.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';

dotenv.config();

const fastify = Fastify({
  logger: true,
});

// CORS configuration
await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});

// Health check endpoint
fastify.get('/health', async () => {
  return { status: 'ok' };
});

// Register API routes
await fastify.register(categoryRoutes, { prisma });
await fastify.register(accountRoutes, { prisma });
await fastify.register(transactionRoutes, { prisma });
await fastify.register(jobRoutes, { prisma });
await fastify.register(analyticsRoutes, { prisma });

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;
    const host = process.env.HOST || '0.0.0.0';
    await fastify.listen({ port, host });
    console.log(`Server is running on http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

export { fastify };
