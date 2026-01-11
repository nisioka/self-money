import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { TransactionService } from './transaction.service.js';

const createTransactionSchema = z.object({
  date: z.string().transform((str) => new Date(str)),
  amount: z.number().int(),
  description: z.string().min(1, 'Description is required'),
  accountId: z.number().int().positive(),
  categoryId: z.number().int().positive(),
  memo: z.string().optional(),
  isManual: z.boolean().default(true),
  externalId: z.string().optional(),
});

const updateTransactionSchema = z.object({
  amount: z.number().int().optional(),
  categoryId: z.number().int().positive().optional(),
  memo: z.string().optional(),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const querySchema = z.object({
  year: z.coerce.number().int().positive(),
  month: z.coerce.number().int().min(1).max(12),
  accountId: z.coerce.number().int().positive().optional(),
});

interface TransactionRoutesOptions {
  prisma: PrismaClient;
}

export const transactionRoutes: FastifyPluginAsync<TransactionRoutesOptions> = async (
  fastify,
  options
) => {
  const service = new TransactionService(options.prisma);

  // GET /api/transactions
  fastify.get('/api/transactions', async (request, reply) => {
    const queryResult = querySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: queryResult.error.issues,
      });
    }

    const { year, month, accountId } = queryResult.data;
    const transactions = await service.findByMonthWithRelations(year, month, accountId);
    return transactions;
  });

  // GET /api/transactions/:id
  fastify.get<{ Params: { id: string } }>(
    '/api/transactions/:id',
    async (request, reply) => {
      const idResult = idParamSchema.safeParse(request.params);
      if (!idResult.success) {
        return reply.status(400).send({
          error: 'Invalid id parameter',
          details: idResult.error.issues,
        });
      }

      const result = await service.findById(idResult.data.id);

      if (!result.success) {
        if (result.error.type === 'NOT_FOUND') {
          return reply.status(404).send({ error: 'Transaction not found' });
        }
        return reply.status(400).send({ error: result.error.type });
      }

      return result.data;
    }
  );

  // POST /api/transactions
  fastify.post('/api/transactions', async (request, reply) => {
    const parseResult = createTransactionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.issues,
      });
    }

    const result = await service.create({
      date: parseResult.data.date,
      amount: parseResult.data.amount,
      description: parseResult.data.description,
      accountId: parseResult.data.accountId,
      categoryId: parseResult.data.categoryId,
      memo: parseResult.data.memo,
      isManual: parseResult.data.isManual,
      externalId: parseResult.data.externalId,
    });

    if (!result.success) {
      switch (result.error.type) {
        case 'VALIDATION_ERROR':
          return reply.status(400).send({
            error: 'Validation error',
            message: result.error.message,
          });
        case 'INVALID_CATEGORY':
          return reply.status(422).send({ error: 'Invalid category' });
        case 'INVALID_ACCOUNT':
          return reply.status(422).send({ error: 'Invalid account' });
        case 'DUPLICATE_EXTERNAL_ID':
          return reply.status(409).send({ error: 'Duplicate external ID' });
        default:
          return reply.status(400).send({ error: result.error.type });
      }
    }

    return reply.status(201).send(result.data);
  });

  // PATCH /api/transactions/:id
  fastify.patch<{ Params: { id: string } }>(
    '/api/transactions/:id',
    async (request, reply) => {
      const idResult = idParamSchema.safeParse(request.params);
      if (!idResult.success) {
        return reply.status(400).send({
          error: 'Invalid id parameter',
          details: idResult.error.issues,
        });
      }

      const bodyResult = updateTransactionSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(400).send({
          error: 'Validation error',
          details: bodyResult.error.issues,
        });
      }

      const result = await service.update(idResult.data.id, {
        amount: bodyResult.data.amount,
        categoryId: bodyResult.data.categoryId,
        memo: bodyResult.data.memo,
      });

      if (!result.success) {
        switch (result.error.type) {
          case 'NOT_FOUND':
            return reply.status(404).send({ error: 'Transaction not found' });
          case 'INVALID_CATEGORY':
            return reply.status(422).send({ error: 'Invalid category' });
          default:
            return reply.status(400).send({ error: result.error.type });
        }
      }

      return result.data;
    }
  );

  // DELETE /api/transactions/:id
  fastify.delete<{ Params: { id: string } }>(
    '/api/transactions/:id',
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
          return reply.status(404).send({ error: 'Transaction not found' });
        }
        return reply.status(400).send({ error: result.error.type });
      }

      return reply.status(204).send();
    }
  );
};
