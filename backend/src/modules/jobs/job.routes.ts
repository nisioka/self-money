import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { JobService, type JobType } from './job.service.js';

const JOB_TYPES = ['SCRAPE_ALL', 'SCRAPE_SPECIFIC'] as const;

const createJobSchema = z.object({
  type: z.enum(JOB_TYPES),
  targetAccountId: z.number().int().positive().optional(),
});

const querySchema = z.object({
  limit: z.coerce.number().int().positive().default(20),
});

interface JobRoutesOptions {
  prisma: PrismaClient;
}

export const jobRoutes: FastifyPluginAsync<JobRoutesOptions> = async (
  fastify,
  options
) => {
  const service = new JobService(options.prisma);

  // POST /api/jobs - Create a new job
  fastify.post('/api/jobs', async (request, reply) => {
    const parseResult = createJobSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.issues,
      });
    }

    const job = await service.create(
      parseResult.data.type as JobType,
      parseResult.data.targetAccountId
    );

    // Return 202 Accepted since job will be processed asynchronously
    return reply.status(202).send(job);
  });

  // GET /api/jobs - Get recent jobs
  fastify.get('/api/jobs', async (request) => {
    const queryResult = querySchema.safeParse(request.query);
    const limit = queryResult.success ? queryResult.data.limit : 20;

    return service.getRecent(limit);
  });

  // GET /api/jobs/:id - Get job by ID
  fastify.get<{ Params: { id: string } }>(
    '/api/jobs/:id',
    async (request, reply) => {
      const result = await service.getById(request.params.id);

      if (!result.success) {
        if (result.error.type === 'NOT_FOUND') {
          return reply.status(404).send({ error: 'Job not found' });
        }
        return reply.status(400).send({ error: result.error.type });
      }

      return result.data;
    }
  );
};
