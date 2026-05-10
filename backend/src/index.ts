import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
dotenv.config();

import { prisma } from './lib/prisma.js';
import { EncryptionService } from './modules/security/encryption.service.js';
import { categoryRoutes } from './modules/categories/category.routes.js';
import { accountRoutes } from './modules/accounts/account.routes.js';
import { transactionRoutes } from './modules/transactions/transaction.routes.js';
import { jobRoutes } from './modules/jobs/job.routes.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import { pushRoutes } from './modules/push/push.routes.js';
import { totpRoutes } from './modules/totp/totp.routes.js';
import { otpRoutes } from './modules/scraper/otp.routes.js';
import { JobService } from './modules/jobs/job.service.js';

const encryptionService = new EncryptionService();

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
await fastify.register(accountRoutes, { prisma, encryptionService });
await fastify.register(transactionRoutes, { prisma });
await fastify.register(jobRoutes, { prisma });
await fastify.register(analyticsRoutes, { prisma });
await fastify.register(pushRoutes, { prisma });
await fastify.register(totpRoutes, { prisma });
await fastify.register(otpRoutes, { prisma });

async function recoverStaleOtpJobsOnStartup(): Promise<void> {
  try {
    const jobService = new JobService(prisma);
    await jobService.recoverStaleOtpJobs();
    console.log('[STARTUP] Stale OTP job recovery completed');
  } catch (err) {
    console.error('[STARTUP] Failed to recover stale OTP jobs:', err);
  }
}

const start = async () => {
  try {
    await recoverStaleOtpJobsOnStartup();
    const port = Number(process.env.PORT) || 3000;
    const host = process.env.HOST || '0.0.0.0';
    await fastify.listen({ port, host });
    console.log(`Server is running on http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== 'test') {
  start();
}

export { fastify };
