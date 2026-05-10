import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { TotpService } from './totp.service.js';
import { EncryptionService } from '../security/encryption.service.js';
import { saveTotpSecretSchema } from './totp.schema.js';

interface PluginOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
}

export async function totpRoutes(
  fastify: FastifyInstance,
  options: PluginOptions
) {
  const encryption = new EncryptionService();
  const totpService = new TotpService(options.prisma, encryption);

  // POST /api/accounts/:id/totp-secret - Save TOTP secret
  fastify.post<{ Params: { id: string } }>(
    '/api/accounts/:id/totp-secret',
    async (request, reply) => {
      const accountId = parseInt(request.params.id, 10);
      if (isNaN(accountId)) {
        return reply.status(400).send({ error: 'Invalid account ID' });
      }

      const parseResult = saveTotpSecretSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Invalid TOTP secret',
          details: parseResult.error.format(),
        });
      }

      try {
        await totpService.saveSecret(accountId, parseResult.data.secret);
        return { success: true };
      } catch (error) {
        if (error instanceof Error && error.message === 'Account not found') {
          return reply.status(404).send({ error: 'Account not found' });
        }
        throw error;
      }
    }
  );

  // DELETE /api/accounts/:id/totp-secret - Delete TOTP secret
  fastify.delete<{ Params: { id: string } }>(
    '/api/accounts/:id/totp-secret',
    async (request, reply) => {
      const accountId = parseInt(request.params.id, 10);
      if (isNaN(accountId)) {
        return reply.status(400).send({ error: 'Invalid account ID' });
      }

      await totpService.deleteSecret(accountId);
      return { success: true };
    }
  );

  // GET /api/accounts/:id/totp-status - Check if TOTP secret exists
  fastify.get<{ Params: { id: string } }>(
    '/api/accounts/:id/totp-status',
    async (request, reply) => {
      const accountId = parseInt(request.params.id, 10);
      if (isNaN(accountId)) {
        return reply.status(400).send({ error: 'Invalid account ID' });
      }

      const hasSecret = await totpService.hasSecret(accountId);
      return { hasSecret };
    }
  );
}
