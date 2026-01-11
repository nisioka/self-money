import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { CategoryService } from './category.service.js';

const createCategorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
});

const updateCategorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

interface CategoryRoutesOptions {
  prisma: PrismaClient;
}

export const categoryRoutes: FastifyPluginAsync<CategoryRoutesOptions> = async (
  fastify,
  options
) => {
  const service = new CategoryService(options.prisma);

  // GET /api/categories
  fastify.get('/api/categories', async () => {
    return service.getAll();
  });

  // POST /api/categories
  fastify.post('/api/categories', async (request, reply) => {
    const parseResult = createCategorySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.issues,
      });
    }

    const result = await service.create(parseResult.data.name);

    if (!result.success) {
      if (result.error.type === 'DUPLICATE_NAME') {
        return reply.status(409).send({ error: 'Category name already exists' });
      }
      return reply.status(400).send({ error: result.error.type });
    }

    return reply.status(201).send(result.data);
  });

  // PATCH /api/categories/:id
  fastify.patch<{ Params: { id: string } }>(
    '/api/categories/:id',
    async (request, reply) => {
      const idResult = idParamSchema.safeParse(request.params);
      if (!idResult.success) {
        return reply.status(400).send({
          error: 'Invalid id parameter',
          details: idResult.error.issues,
        });
      }

      const bodyResult = updateCategorySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(400).send({
          error: 'Validation error',
          details: bodyResult.error.issues,
        });
      }

      const result = await service.update(idResult.data.id, bodyResult.data.name);

      if (!result.success) {
        if (result.error.type === 'NOT_FOUND') {
          return reply.status(404).send({ error: 'Category not found' });
        }
        if (result.error.type === 'DUPLICATE_NAME') {
          return reply.status(409).send({ error: 'Category name already exists' });
        }
        return reply.status(400).send({ error: result.error.type });
      }

      return result.data;
    }
  );

  // DELETE /api/categories/:id
  fastify.delete<{ Params: { id: string } }>(
    '/api/categories/:id',
    async (request, reply) => {
      const idResult = idParamSchema.safeParse(request.params);
      if (!idResult.success) {
        return reply.status(400).send({
          error: 'Invalid id parameter',
          details: idResult.error.issues,
        });
      }

      const result = await service.delete(idResult.data.id);

      if (!result.success) {
        if (result.error.type === 'NOT_FOUND') {
          return reply.status(404).send({ error: 'Category not found' });
        }
        if (result.error.type === 'IN_USE') {
          return reply.status(409).send({
            error: 'Category is in use',
            transactionCount: result.error.transactionCount,
          });
        }
        return reply.status(400).send({ error: result.error.type });
      }

      return reply.status(204).send();
    }
  );
};
