import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { JobService } from '../jobs/job.service.js';

interface PluginOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
}

const otpSchema = z.object({
  otp: z
    .string()
    .min(6, 'OTP must be at least 6 digits')
    .max(8, 'OTP must be at most 8 digits')
    .regex(/^\d+$/, 'OTP must contain only digits'),
});

// OTP callback registry (populated by ScraperService)
export const otpCallbacks = new Map<
  string,
  { submit: (otp: string) => void; cancel: () => void }
>();

export async function otpRoutes(
  fastify: FastifyInstance,
  options: PluginOptions
) {
  const jobService = new JobService(options.prisma);

  // POST /api/scraping/:jobId/submit-otp - Submit OTP for a job
  fastify.post<{ Params: { jobId: string } }>(
    '/api/scraping/:jobId/submit-otp',
    async (request, reply) => {
      const { jobId } = request.params;

      // Validate OTP format
      const parseResult = otpSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Invalid OTP format',
          details: parseResult.error.format(),
        });
      }

      // Get job
      const jobResult = await jobService.getById(jobId);
      if (!jobResult.success) {
        return reply.status(404).send({ error: 'Job not found' });
      }

      const job = jobResult.data;

      // Check job status
      if (job.status !== 'waiting_for_otp') {
        return reply.status(409).send({
          error: 'Job is not waiting for OTP',
          currentStatus: job.status,
        });
      }

      // Check for timeout
      if (jobService.isOtpTimedOut(job)) {
        await jobService.updateStatus(jobId, 'failed', 'OTP timeout');
        return reply.status(409).send({ error: 'OTP has timed out' });
      }

      // Check retry count
      if (job.otpRetryCount >= 3) {
        await jobService.updateStatus(jobId, 'failed', 'OTP max retries exceeded');
        return reply.status(409).send({
          error: 'Maximum OTP retry attempts exceeded',
        });
      }

      // Get OTP callback
      const callback = otpCallbacks.get(jobId);
      if (!callback) {
        return reply.status(409).send({
          error: 'OTP handler not available',
          message: 'The scraping session may have been terminated',
        });
      }

      // Submit OTP (don't log the actual OTP value)
      console.log(`[OTP_API] OTP submitted for job ${jobId}`);
      callback.submit(parseResult.data.otp);

      return { success: true, message: 'OTP submitted' };
    }
  );

  // POST /api/scraping/:jobId/cancel-otp - Cancel OTP waiting
  fastify.post<{ Params: { jobId: string } }>(
    '/api/scraping/:jobId/cancel-otp',
    async (request, reply) => {
      const { jobId } = request.params;

      // Get job
      const jobResult = await jobService.getById(jobId);
      if (!jobResult.success) {
        return reply.status(404).send({ error: 'Job not found' });
      }

      const job = jobResult.data;

      // Check job status
      if (job.status !== 'waiting_for_otp') {
        return reply.status(409).send({
          error: 'Job is not waiting for OTP',
          currentStatus: job.status,
        });
      }

      // Get OTP callback and cancel
      const callback = otpCallbacks.get(jobId);
      if (callback) {
        callback.cancel();
        otpCallbacks.delete(jobId);
      }

      // Update job status
      await jobService.updateStatus(jobId, 'failed', 'OTP cancelled by user');

      console.log(`[OTP_API] OTP cancelled for job ${jobId}`);
      return { success: true };
    }
  );

  // GET /api/scraping/:jobId/otp-status - Get OTP status for a job
  fastify.get<{ Params: { jobId: string } }>(
    '/api/scraping/:jobId/otp-status',
    async (request, reply) => {
      const { jobId } = request.params;

      // Get job
      const jobResult = await jobService.getById(jobId);
      if (!jobResult.success) {
        return reply.status(404).send({ error: 'Job not found' });
      }

      const job = jobResult.data;

      return {
        status: job.status,
        authMethod: job.otpAuthMethod,
        remainingSeconds: jobService.getRemainingOtpSeconds(job),
        retryCount: job.otpRetryCount,
      };
    }
  );

  // GET /api/scraping/waiting-for-otp - Get all jobs currently waiting for OTP
  // Used by the frontend on mount to restore the OTP dialog after a reload.
  fastify.get('/api/scraping/waiting-for-otp', async () => {
    const jobs = await jobService.getWaitingForOtpJobs();
    return jobs
      .filter((job) => !jobService.isOtpTimedOut(job))
      .map((job) => ({
        jobId: job.id,
        accountId: job.targetAccountId,
        authMethod: job.otpAuthMethod,
        remainingSeconds: jobService.getRemainingOtpSeconds(job),
        retryCount: job.otpRetryCount,
      }));
  });
}
