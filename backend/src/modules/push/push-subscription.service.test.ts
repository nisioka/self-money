import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PushSubscriptionService } from './push-subscription.service.js';
import type { PrismaClient } from '@prisma/client';

describe('PushSubscriptionService', () => {
  let service: PushSubscriptionService;
  let mockPrisma: {
    pushSubscription: {
      upsert: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
  };

  const validSubscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: {
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
      auth: 'tBHItJI5svbpez7KI4CCXg',
    },
  };

  beforeEach(() => {
    mockPrisma = {
      pushSubscription: {
        upsert: vi.fn(),
        delete: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
    };
    service = new PushSubscriptionService(mockPrisma as unknown as PrismaClient);
  });

  describe('subscribe', () => {
    it('should save subscription with upsert (update if endpoint exists)', async () => {
      mockPrisma.pushSubscription.upsert.mockResolvedValue({
        id: 1,
        endpoint: validSubscription.endpoint,
        p256dhKey: validSubscription.keys.p256dh,
        authKey: validSubscription.keys.auth,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.subscribe(validSubscription);

      expect(mockPrisma.pushSubscription.upsert).toHaveBeenCalledWith({
        where: { endpoint: validSubscription.endpoint },
        update: {
          p256dhKey: validSubscription.keys.p256dh,
          authKey: validSubscription.keys.auth,
        },
        create: {
          endpoint: validSubscription.endpoint,
          p256dhKey: validSubscription.keys.p256dh,
          authKey: validSubscription.keys.auth,
        },
      });
    });
  });

  describe('unsubscribe', () => {
    it('should delete subscription by endpoint', async () => {
      mockPrisma.pushSubscription.delete.mockResolvedValue({
        id: 1,
        endpoint: validSubscription.endpoint,
      });

      await service.unsubscribe(validSubscription.endpoint);

      expect(mockPrisma.pushSubscription.delete).toHaveBeenCalledWith({
        where: { endpoint: validSubscription.endpoint },
      });
    });

    it('should not throw if subscription does not exist', async () => {
      mockPrisma.pushSubscription.delete.mockRejectedValue({ code: 'P2025' });

      await expect(service.unsubscribe('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('getSubscription', () => {
    it('should return subscription if exists', async () => {
      const dbRecord = {
        id: 1,
        endpoint: validSubscription.endpoint,
        p256dhKey: validSubscription.keys.p256dh,
        authKey: validSubscription.keys.auth,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.pushSubscription.findFirst.mockResolvedValue(dbRecord);

      const result = await service.getSubscription();

      expect(result).toEqual({
        endpoint: validSubscription.endpoint,
        keys: {
          p256dh: validSubscription.keys.p256dh,
          auth: validSubscription.keys.auth,
        },
      });
    });

    it('should return null if no subscription exists', async () => {
      mockPrisma.pushSubscription.findFirst.mockResolvedValue(null);

      const result = await service.getSubscription();

      expect(result).toBeNull();
    });
  });

  describe('isSubscribed', () => {
    it('should return true if subscription exists', async () => {
      mockPrisma.pushSubscription.findFirst.mockResolvedValue({
        id: 1,
        endpoint: validSubscription.endpoint,
      });

      const result = await service.isSubscribed();

      expect(result).toBe(true);
    });

    it('should return false if no subscription exists', async () => {
      mockPrisma.pushSubscription.findFirst.mockResolvedValue(null);

      const result = await service.isSubscribed();

      expect(result).toBe(false);
    });
  });
});
