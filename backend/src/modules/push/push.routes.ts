import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { PushSubscriptionService } from './push-subscription.service.js';
import { pushSubscriptionSchema, unsubscribeSchema } from './push.schema.js';

interface PluginOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
}

export async function pushRoutes(
  fastify: FastifyInstance,
  options: PluginOptions
) {
  const subscriptionService = new PushSubscriptionService(options.prisma);

  // GET /api/push/vapid-public-key - Get VAPID public key for subscription
  fastify.get('/api/push/vapid-public-key', async () => {
    const publicKey = process.env['VAPID_PUBLIC_KEY'];
    if (!publicKey) {
      throw { statusCode: 500, message: 'VAPID public key not configured' };
    }
    return { publicKey };
  });

  // POST /api/push/subscribe - Subscribe to push notifications
  fastify.post('/api/push/subscribe', async (request, reply) => {
    const parseResult = pushSubscriptionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid subscription data',
        details: parseResult.error.format(),
      });
    }

    await subscriptionService.subscribe(parseResult.data);
    return { success: true };
  });

  // DELETE /api/push/unsubscribe - Unsubscribe from push notifications
  fastify.delete('/api/push/unsubscribe', async (request, reply) => {
    const parseResult = unsubscribeSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid endpoint',
        details: parseResult.error.format(),
      });
    }

    await subscriptionService.unsubscribe(parseResult.data.endpoint);
    return { success: true };
  });

  // GET /api/push/status - Check subscription status
  fastify.get('/api/push/status', async () => {
    const subscribed = await subscriptionService.isSubscribed();
    return { subscribed };
  });
}
