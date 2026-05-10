/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

// Precache static assets
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Push notification payload type
interface PushPayload {
  type: 'OTP_REQUIRED' | 'OTP_TIMEOUT' | 'SCRAPING_FAILED';
  jobId: string;
  accountId?: number;
  accountName: string;
  authMethod?: string;
  title: string;
  message: string;
  actions?: Array<{ action: string; title: string }>;
}

// Handle push events
self.addEventListener('push', (event) => {
  if (!event.data) {
    console.log('[SW] Push event received but no data');
    return;
  }

  try {
    const payload: PushPayload = event.data.json();
    console.log('[SW] Push received:', payload.type);

    const options: NotificationOptions = {
      body: payload.message,
      icon: '/pwa-192x192.svg',
      badge: '/pwa-192x192.svg',
      tag: payload.jobId,
      data: {
        type: payload.type,
        jobId: payload.jobId,
        accountId: payload.accountId,
        accountName: payload.accountName,
      },
      requireInteraction: payload.type === 'OTP_REQUIRED',
    };

    // Add actions for OTP_REQUIRED
    if (payload.type === 'OTP_REQUIRED' && payload.actions) {
      options.actions = payload.actions.map((a) => ({
        action: a.action,
        title: a.title,
      }));
    }

    event.waitUntil(self.registration.showNotification(payload.title, options));
  } catch (error) {
    console.error('[SW] Error parsing push payload:', error);
  }
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.tag);
  event.notification.close();

  const data = event.notification.data;

  // Open the app and send message to client
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Try to find an existing window
        for (const client of clientList) {
          if ('focus' in client) {
            client.focus();
            // Send message to open OTP dialog
            if (data.type === 'OTP_REQUIRED') {
              client.postMessage({
                type: 'OPEN_OTP_DIALOG',
                jobId: data.jobId,
                accountId: data.accountId,
                accountName: data.accountName,
              });
            }
            return;
          }
        }

        // No window found, open a new one
        if (self.clients.openWindow) {
          const url =
            data.type === 'OTP_REQUIRED' ? `/?otpJob=${data.jobId}` : '/';
          return self.clients.openWindow(url);
        }
      })
  );
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
