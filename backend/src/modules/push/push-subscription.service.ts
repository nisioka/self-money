import type { PrismaClient } from '@prisma/client';

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export class PushSubscriptionService {
  constructor(private readonly prisma: PrismaClient) {}

  async subscribe(subscription: PushSubscriptionData): Promise<void> {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        p256dhKey: subscription.keys.p256dh,
        authKey: subscription.keys.auth,
      },
      create: {
        endpoint: subscription.endpoint,
        p256dhKey: subscription.keys.p256dh,
        authKey: subscription.keys.auth,
      },
    });
  }

  async unsubscribe(endpoint: string): Promise<void> {
    try {
      await this.prisma.pushSubscription.delete({
        where: { endpoint },
      });
    } catch (error: unknown) {
      // Ignore if subscription doesn't exist (P2025 = Record not found)
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2025'
      ) {
        return;
      }
      throw error;
    }
  }

  async getSubscription(): Promise<PushSubscriptionData | null> {
    const record = await this.prisma.pushSubscription.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      return null;
    }

    return {
      endpoint: record.endpoint,
      keys: {
        p256dh: record.p256dhKey,
        auth: record.authKey,
      },
    };
  }

  async isSubscribed(): Promise<boolean> {
    const record = await this.prisma.pushSubscription.findFirst();
    return record !== null;
  }
}
