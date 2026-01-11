import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { EncryptionService } from '../security/encryption.service.js';
import { z } from 'zod';
import { AccountService, type AccountType } from './account.service.js';

const VALID_ACCOUNT_TYPES = ['BANK', 'CARD', 'SECURITIES', 'CASH'] as const;

const credentialsSchema = z.object({
  loginId: z.string().min(1),
  password: z.string().min(1),
  additionalFields: z.record(z.string()).optional(),
});

const createAccountSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(VALID_ACCOUNT_TYPES),
  credentials: credentialsSchema.optional(),
  initialBalance: z.number().optional(),
});

const updateAccountSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  credentials: credentialsSchema.optional(),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

interface AccountRoutesOptions {
  prisma: PrismaClient;
  encryptionService: EncryptionService;
}

export const accountRoutes: FastifyPluginAsync<AccountRoutesOptions> = async (
  fastify,
  options
) => {
  const service = new AccountService(options.prisma, options.encryptionService);

  // GET /api/accounts
  fastify.get('/api/accounts', async () => {
    return service.getAll();
  });

  // GET /api/accounts/:id
  fastify.get<{ Params: { id: string } }>(
    '/api/accounts/:id',
    async (request, reply) => {
      const idResult = idParamSchema.safeParse(request.params);
      if (!idResult.success) {
        return reply.status(400).send({
          error: 'Invalid id parameter',
          details: idResult.error.issues,
        });
      }

      const result = await service.getById(idResult.data.id);

      if (!result.success) {
        if (result.error.type === 'NOT_FOUND') {
          return reply.status(404).send({ error: 'Account not found' });
        }
        return reply.status(400).send({ error: result.error.type });
      }

      return result.data;
    }
  );

  // POST /api/accounts
  fastify.post('/api/accounts', async (request, reply) => {
    const parseResult = createAccountSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.issues,
      });
    }

    const result = await service.create({
      name: parseResult.data.name,
      type: parseResult.data.type as AccountType,
      credentials: parseResult.data.credentials,
      initialBalance: parseResult.data.initialBalance,
    });

    if (!result.success) {
      if (result.error.type === 'VALIDATION_ERROR') {
        return reply.status(400).send({
          error: 'Validation error',
          message: result.error.message,
        });
      }
      return reply.status(400).send({ error: result.error.type });
    }

    // Don't expose encrypted credentials in response
    const { encryptedCredentials, credentialsIv, credentialsAuthTag, ...safeAccount } = result.data;
    return reply.status(201).send(safeAccount);
  });

  // PATCH /api/accounts/:id
  fastify.patch<{ Params: { id: string } }>(
    '/api/accounts/:id',
    async (request, reply) => {
      const idResult = idParamSchema.safeParse(request.params);
      if (!idResult.success) {
        return reply.status(400).send({
          error: 'Invalid id parameter',
          details: idResult.error.issues,
        });
      }

      const bodyResult = updateAccountSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(400).send({
          error: 'Validation error',
          details: bodyResult.error.issues,
        });
      }

      const result = await service.update(idResult.data.id, {
        name: bodyResult.data.name,
        credentials: bodyResult.data.credentials,
      });

      if (!result.success) {
        if (result.error.type === 'NOT_FOUND') {
          return reply.status(404).send({ error: 'Account not found' });
        }
        if (result.error.type === 'VALIDATION_ERROR') {
          return reply.status(400).send({
            error: 'Validation error',
            message: result.error.message,
          });
        }
        return reply.status(400).send({ error: result.error.type });
      }

      // Don't expose encrypted credentials in response
      const { encryptedCredentials, credentialsIv, credentialsAuthTag, ...safeAccount } = result.data;
      return safeAccount;
    }
  );

  // DELETE /api/accounts/:id
  fastify.delete<{ Params: { id: string } }>(
    '/api/accounts/:id',
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
          return reply.status(404).send({ error: 'Account not found' });
        }
        if (result.error.type === 'HAS_TRANSACTIONS') {
          return reply.status(409).send({
            error: 'Account has transactions',
            transactionCount: result.error.transactionCount,
          });
        }
        return reply.status(400).send({ error: result.error.type });
      }

      return reply.status(204).send();
    }
  );
};
