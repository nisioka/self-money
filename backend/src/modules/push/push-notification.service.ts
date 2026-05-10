import webpush from 'web-push';
import type { PushSubscriptionService } from './push-subscription.service.js';

export type OtpAuthMethod = 'TOTP' | 'SMS' | 'EMAIL' | 'PUSH_APPROVAL';

export interface PushNotificationPayload {
  type: 'OTP_REQUIRED' | 'OTP_TIMEOUT' | 'SCRAPING_FAILED';
  jobId: string;
  accountId?: number;
  accountName: string;
  authMethod?: OtpAuthMethod;
  title: string;
  message: string;
  actions?: Array<{ action: string; title: string }>;
}

export interface SendNotificationResult {
  success: boolean;
  statusCode?: number;
  retried: boolean;
}

export class PushNotificationService {
  constructor(private readonly subscriptionService: PushSubscriptionService) {
    const publicKey = process.env['VAPID_PUBLIC_KEY'];
    const privateKey = process.env['VAPID_PRIVATE_KEY'];
    const subject = process.env['VAPID_SUBJECT'];

    if (publicKey && privateKey && subject) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
    }
  }

  async sendOtpRequiredNotification(
    jobId: string,
    accountId: number,
    accountName: string,
    authMethod: OtpAuthMethod
  ): Promise<SendNotificationResult> {
    const payload: PushNotificationPayload = {
      type: 'OTP_REQUIRED',
      jobId,
      accountId,
      accountName,
      authMethod,
      title: 'OTP入力が必要です',
      message: `${accountName}のスクレイピングでワンタイムパスワードが求められています`,
      actions: [{ action: 'open_otp_dialog', title: 'OTP入力' }],
    };

    // Log without sensitive data (no OTP values logged)
    console.log(`[PUSH] Sending OTP_REQUIRED notification for job ${jobId}`);

    return this.sendNotification(payload);
  }

  async sendTimeoutNotification(
    jobId: string,
    accountName: string
  ): Promise<SendNotificationResult> {
    const payload: PushNotificationPayload = {
      type: 'OTP_TIMEOUT',
      jobId,
      accountName,
      title: 'OTP入力がタイムアウトしました',
      message: `${accountName}のスクレイピングがタイムアウトしました。再試行してください。`,
    };

    console.log(`[PUSH] Sending OTP_TIMEOUT notification for job ${jobId}`);

    return this.sendNotification(payload);
  }

  private async sendNotification(
    payload: PushNotificationPayload
  ): Promise<SendNotificationResult> {
    const subscription = await this.subscriptionService.getSubscription();

    if (!subscription) {
      console.warn('[PUSH] No subscription found, skipping notification');
      return { success: false, retried: false };
    }

    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    };

    let retried = false;

    // First attempt
    try {
      const response = await webpush.sendNotification(
        pushSubscription,
        JSON.stringify(payload)
      );
      return { success: true, statusCode: response.statusCode, retried: false };
    } catch {
      console.warn('[PUSH] First notification attempt failed, retrying...');
      retried = true;
    }

    // Retry once
    try {
      const response = await webpush.sendNotification(
        pushSubscription,
        JSON.stringify(payload)
      );
      return { success: true, statusCode: response.statusCode, retried: true };
    } catch (error) {
      console.error('[PUSH] Notification retry failed:', error);
      return { success: false, retried: true };
    }
  }
}
