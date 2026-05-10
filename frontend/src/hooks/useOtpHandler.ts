import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost } from '../lib/api';

interface OtpState {
  isOpen: boolean;
  jobId: string | null;
  accountId: number | null;
  accountName: string;
  authMethod?: string;
  remainingSeconds?: number;
  retryCount?: number;
  error: string | null;
}

interface OtpStatusResponse {
  status: string;
  authMethod: string | null;
  remainingSeconds: number | null;
  retryCount: number;
}

interface WaitingOtpJob {
  jobId: string;
  accountId: number | null;
  authMethod: string | null;
  remainingSeconds: number | null;
  retryCount: number;
}

interface AccountInfo {
  id: number;
  name: string;
}

interface SubmitOtpResponse {
  success: boolean;
  message?: string;
}

const initialState: OtpState = {
  isOpen: false,
  jobId: null,
  accountId: null,
  accountName: '',
  authMethod: undefined,
  remainingSeconds: undefined,
  retryCount: undefined,
  error: null,
};

export function useOtpHandler() {
  const [state, setState] = useState<OtpState>(initialState);

  // Listen for Service Worker messages and restore state after reload
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OPEN_OTP_DIALOG') {
        const { jobId, accountId, accountName } = event.data;
        openDialog(jobId, accountId, accountName);
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleMessage);

    // Check URL params for OTP job (when opened from notification)
    const urlParams = new URLSearchParams(window.location.search);
    const otpJobId = urlParams.get('otpJob');
    if (otpJobId) {
      // Remove the param from URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
      // Fetch job info and open dialog
      fetchJobAndOpenDialog(otpJobId);
    } else {
      // Restore OTP dialog after browser reload by polling the backend
      // for any job currently in waiting_for_otp state.
      restoreWaitingOtpJob();
    }

    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, []);

  // Resolve account display name. Falls back to a generic label if the
  // account API is unavailable so the dialog can still be shown.
  const resolveAccountName = async (accountId: number | null): Promise<string> => {
    if (accountId == null) return '金融機関';
    try {
      const account = await apiGet<AccountInfo>(`/accounts/${accountId}`);
      return account?.name ?? '金融機関';
    } catch {
      return '金融機関';
    }
  };

  // On mount, check if any job is currently waiting for OTP and reopen
  // the dialog. Survives full page reloads while OTP is pending.
  const restoreWaitingOtpJob = async () => {
    try {
      const jobs = await apiGet<WaitingOtpJob[]>('/scraping/waiting-for-otp');
      if (!jobs || jobs.length === 0) return;
      // Take the most-recently-requested job (the API orders by requestedAt asc,
      // so reverse to surface the newest if multiple — typically only one).
      const job = jobs[jobs.length - 1];
      const accountName = await resolveAccountName(job.accountId);
      setState({
        isOpen: true,
        jobId: job.jobId,
        accountId: job.accountId,
        accountName,
        authMethod: job.authMethod ?? undefined,
        remainingSeconds: job.remainingSeconds ?? undefined,
        retryCount: job.retryCount,
        error: null,
      });
    } catch (err) {
      console.error('Failed to restore waiting-for-otp job:', err);
    }
  };

  // Fetch job status and open dialog
  const fetchJobAndOpenDialog = async (jobId: string) => {
    try {
      const status = await apiGet<OtpStatusResponse>(`/scraping/${jobId}/otp-status`);
      if (status.status === 'waiting_for_otp') {
        setState({
          isOpen: true,
          jobId,
          accountId: null,
          accountName: '金融機関',
          authMethod: status.authMethod ?? undefined,
          remainingSeconds: status.remainingSeconds ?? undefined,
          retryCount: status.retryCount,
          error: null,
        });
      }
    } catch (err) {
      console.error('Failed to fetch OTP status:', err);
    }
  };

  // Open OTP dialog
  const openDialog = useCallback(
    async (jobId: string, accountId: number | null, accountName: string) => {
      // Fetch current OTP status
      try {
        const status = await apiGet<OtpStatusResponse>(`/scraping/${jobId}/otp-status`);
        setState({
          isOpen: true,
          jobId,
          accountId,
          accountName,
          authMethod: status.authMethod ?? undefined,
          remainingSeconds: status.remainingSeconds ?? undefined,
          retryCount: status.retryCount,
          error: null,
        });
      } catch {
        setState({
          isOpen: true,
          jobId,
          accountId,
          accountName,
          authMethod: undefined,
          remainingSeconds: 300,
          retryCount: 0,
          error: null,
        });
      }
    },
    []
  );

  // Submit OTP
  const submitOtp = useCallback(async (otp: string) => {
    if (!state.jobId) return;

    setState((prev) => ({ ...prev, error: null }));

    try {
      const result = await apiPost<SubmitOtpResponse>(
        `/scraping/${state.jobId}/submit-otp`,
        { otp }
      );

      if (result.success) {
        // Close dialog on success
        setState(initialState);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'OTPの送信に失敗しました';

      // Check if it's a specific error
      if (message.includes('timeout') || message.includes('timed out')) {
        setState((prev) => ({ ...prev, error: 'OTPがタイムアウトしました' }));
      } else if (message.includes('retry') || message.includes('exceeded')) {
        setState((prev) => ({
          ...prev,
          error: '最大試行回数を超えました。スクレイピングを再実行してください。',
        }));
      } else if (message.includes('Invalid OTP') || message.includes('not waiting')) {
        setState((prev) => ({ ...prev, error: message }));
      } else {
        setState((prev) => ({ ...prev, error: message }));
      }

      // Refresh OTP status after error
      if (state.jobId) {
        try {
          const status = await apiGet<OtpStatusResponse>(
            `/scraping/${state.jobId}/otp-status`
          );
          setState((prev) => ({
            ...prev,
            remainingSeconds: status.remainingSeconds ?? prev.remainingSeconds,
            retryCount: status.retryCount,
          }));
        } catch {
          // Ignore status fetch errors
        }
      }
    }
  }, [state.jobId]);

  // Cancel OTP
  const cancelOtp = useCallback(async () => {
    if (!state.jobId) {
      setState(initialState);
      return;
    }

    try {
      await apiPost(`/scraping/${state.jobId}/cancel-otp`, {});
    } catch {
      // Ignore errors on cancel
    }

    setState(initialState);
  }, [state.jobId]);

  // Close dialog without API call
  const closeDialog = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    ...state,
    openDialog,
    submitOtp,
    cancelOtp,
    closeDialog,
  };
}
