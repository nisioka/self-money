import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiDelete } from '../lib/api';

interface PushNotificationState {
  isSupported: boolean;
  permission: NotificationPermission | 'unsupported';
  isSubscribed: boolean;
  isLoading: boolean;
  error: string | null;
}

interface VapidKeyResponse {
  publicKey: string;
}

interface PushStatusResponse {
  subscribed: boolean;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotification() {
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    permission: 'unsupported',
    isSubscribed: false,
    isLoading: true,
    error: null,
  });

  // Check browser support and initial state
  useEffect(() => {
    const checkSupport = async () => {
      // Check if Push API and Service Worker are supported
      const isSupported =
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window;

      if (!isSupported) {
        setState({
          isSupported: false,
          permission: 'unsupported',
          isSubscribed: false,
          isLoading: false,
          error: null,
        });
        return;
      }

      const permission = Notification.permission;

      // Check server subscription status
      let isSubscribed = false;
      try {
        const status = await apiGet<PushStatusResponse>('/push/status');
        isSubscribed = status.subscribed;
      } catch {
        // Ignore errors - might be first time
      }

      setState({
        isSupported: true,
        permission,
        isSubscribed,
        isLoading: false,
        error: null,
      });
    };

    checkSupport();
  }, []);

  // Request notification permission
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported) {
      setState((prev) => ({ ...prev, error: 'ブラウザがPush通知に対応していません' }));
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      setState((prev) => ({ ...prev, permission, error: null }));
      return permission === 'granted';
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Permission request failed';
      setState((prev) => ({ ...prev, error: message }));
      return false;
    }
  }, [state.isSupported]);

  // Subscribe to push notifications
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported) {
      setState((prev) => ({ ...prev, error: 'ブラウザがPush通知に対応していません' }));
      return false;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Request permission if not granted
      if (Notification.permission !== 'granted') {
        const granted = await requestPermission();
        if (!granted) {
          setState((prev) => ({ ...prev, isLoading: false, error: '通知の許可が必要です' }));
          return false;
        }
      }

      // Get VAPID public key from server
      const { publicKey } = await apiGet<VapidKeyResponse>('/push/vapid-public-key');

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push manager
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Send subscription to server
      const p256dh = subscription.getKey('p256dh');
      const auth = subscription.getKey('auth');

      if (!p256dh || !auth) {
        throw new Error('Failed to get subscription keys');
      }

      await apiPost('/push/subscribe', {
        endpoint: subscription.endpoint,
        p256dhKey: btoa(String.fromCharCode(...new Uint8Array(p256dh))),
        authKey: btoa(String.fromCharCode(...new Uint8Array(auth))),
      });

      setState((prev) => ({
        ...prev,
        isSubscribed: true,
        isLoading: false,
        error: null,
      }));

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Subscription failed';
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
      return false;
    }
  }, [state.isSupported, requestPermission]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported) {
      return false;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Get current subscription
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Unsubscribe from push manager
        await subscription.unsubscribe();

        // Remove subscription from server
        await apiDelete('/push/unsubscribe');
      }

      setState((prev) => ({
        ...prev,
        isSubscribed: false,
        isLoading: false,
        error: null,
      }));

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unsubscribe failed';
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
      return false;
    }
  }, [state.isSupported]);

  return {
    ...state,
    requestPermission,
    subscribe,
    unsubscribe,
  };
}
