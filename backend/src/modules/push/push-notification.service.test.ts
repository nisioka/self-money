import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PushNotificationService } from './push-notification.service.js';
import type { PushSubscriptionService } from './push-subscription.service.js';

// Mock web-push module
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

import webpush from 'web-push';

describe('PushNotificationService', () => {
  let service: PushNotificationService;
  let mockSubscriptionService: {
    getSubscription: ReturnType<typeof vi.fn>;
  };

  const validSubscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: {
      p256dh: 'test-p256dh-key',
      auth: 'test-auth-key',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscriptionService = {
      getSubscription: vi.fn(),
    };

    // Set environment variables
    process.env['VAPID_PUBLIC_KEY'] = 'test-public-key';
    process.env['VAPID_PRIVATE_KEY'] = 'test-private-key';
    process.env['VAPID_SUBJECT'] = 'mailto:test@example.com';

    service = new PushNotificationService(
      mockSubscriptionService as unknown as PushSubscriptionService
    );
  });

  afterEach(() => {
    delete process.env['VAPID_PUBLIC_KEY'];
    delete process.env['VAPID_PRIVATE_KEY'];
    delete process.env['VAPID_SUBJECT'];
  });

  describe('sendOtpRequiredNotification', () => {
    it('should send notification with correct payload', async () => {
      mockSubscriptionService.getSubscription.mockResolvedValue(validSubscription);
      vi.mocked(webpush.sendNotification).mockResolvedValue({
        statusCode: 201,
        body: '',
        headers: {},
      });

      const result = await service.sendOtpRequiredNotification(
        'job-123',
        1,
        '三菱UFJ銀行',
        'TOTP'
      );

      expect(result.success).toBe(true);
      expect(webpush.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: validSubscription.endpoint,
        }),
        expect.stringContaining('OTP_REQUIRED')
      );

      // Verify payload structure
      const callArgs = vi.mocked(webpush.sendNotification).mock.calls[0];
      expect(callArgs).toBeDefined();
      const payload = JSON.parse(callArgs![1] as string);
      expect(payload.type).toBe('OTP_REQUIRED');
      expect(payload.jobId).toBe('job-123');
      expect(payload.accountId).toBe(1);
      expect(payload.accountName).toBe('三菱UFJ銀行');
      expect(payload.authMethod).toBe('TOTP');
      expect(payload.title).toBe('OTP入力が必要です');
      expect(payload.message).toContain('三菱UFJ銀行');
    });

    it('should not log OTP values', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log');
      mockSubscriptionService.getSubscription.mockResolvedValue(validSubscription);
      vi.mocked(webpush.sendNotification).mockResolvedValue({
        statusCode: 201,
        body: '',
        headers: {},
      });

      await service.sendOtpRequiredNotification('job-123', 1, 'Test Bank', 'TOTP');

      // Check that no log contains OTP-related sensitive data
      const logCalls = consoleLogSpy.mock.calls.flat().join(' ');
      expect(logCalls).not.toContain('123456'); // Should never log actual OTP
      consoleLogSpy.mockRestore();
    });

    it('should return success false when no subscription exists', async () => {
      mockSubscriptionService.getSubscription.mockResolvedValue(null);

      const result = await service.sendOtpRequiredNotification(
        'job-123',
        1,
        'Test Bank',
        'TOTP'
      );

      expect(result.success).toBe(false);
      expect(webpush.sendNotification).not.toHaveBeenCalled();
    });

    it('should retry once on failure', async () => {
      mockSubscriptionService.getSubscription.mockResolvedValue(validSubscription);
      vi.mocked(webpush.sendNotification)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ statusCode: 201, body: '', headers: {} });

      const result = await service.sendOtpRequiredNotification(
        'job-123',
        1,
        'Test Bank',
        'TOTP'
      );

      expect(result.success).toBe(true);
      expect(result.retried).toBe(true);
      expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    });

    it('should return failure after retry exhausted', async () => {
      mockSubscriptionService.getSubscription.mockResolvedValue(validSubscription);
      vi.mocked(webpush.sendNotification).mockRejectedValue(new Error('Permanent failure'));

      const result = await service.sendOtpRequiredNotification(
        'job-123',
        1,
        'Test Bank',
        'TOTP'
      );

      expect(result.success).toBe(false);
      expect(result.retried).toBe(true);
      expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    });
  });

  describe('sendTimeoutNotification', () => {
    it('should send timeout notification with correct payload', async () => {
      mockSubscriptionService.getSubscription.mockResolvedValue(validSubscription);
      vi.mocked(webpush.sendNotification).mockResolvedValue({
        statusCode: 201,
        body: '',
        headers: {},
      });

      const result = await service.sendTimeoutNotification('job-123', 'Test Bank');

      expect(result.success).toBe(true);
      const callArgs = vi.mocked(webpush.sendNotification).mock.calls[0];
      expect(callArgs).toBeDefined();
      const payload = JSON.parse(callArgs![1] as string);
      expect(payload.type).toBe('OTP_TIMEOUT');
      expect(payload.jobId).toBe('job-123');
      expect(payload.message).toContain('タイムアウト');
    });
  });
});
