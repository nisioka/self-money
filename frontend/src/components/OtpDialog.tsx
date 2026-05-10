import { useState, useEffect, useRef } from 'react';

interface OtpDialogProps {
  isOpen: boolean;
  jobId: string;
  accountName: string;
  authMethod?: string;
  remainingSeconds?: number;
  retryCount?: number;
  onSubmit: (otp: string) => Promise<void>;
  onCancel: () => void;
  error?: string | null;
}

export function OtpDialog({
  isOpen,
  jobId,
  accountName,
  authMethod,
  remainingSeconds: initialRemaining,
  retryCount = 0,
  onSubmit,
  onCancel,
  error,
}: OtpDialogProps) {
  const [otp, setOtp] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [remaining, setRemaining] = useState(initialRemaining ?? 300);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Reset OTP when dialog opens
  useEffect(() => {
    if (isOpen) {
      setOtp('');
      setIsSubmitting(false);
    }
  }, [isOpen, jobId]);

  // Update remaining time from props
  useEffect(() => {
    if (initialRemaining !== undefined) {
      setRemaining(initialRemaining);
    }
  }, [initialRemaining]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || remaining <= 0) return;

    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, remaining]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow digits, max 8 characters
    const value = e.target.value.replace(/\D/g, '').slice(0, 8);
    setOtp(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit(otp);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getAuthMethodLabel = (method?: string): string => {
    switch (method) {
      case 'TOTP':
        return '認証アプリ';
      case 'SMS':
        return 'SMS';
      case 'EMAIL':
        return 'メール';
      case 'PUSH_APPROVAL':
        return 'プッシュ承認';
      default:
        return 'ワンタイムパスワード';
    }
  };

  if (!isOpen) return null;

  const isExpired = remaining <= 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">
            {getAuthMethodLabel(authMethod)}の入力
          </h2>
          <p className="text-sm text-gray-500 mt-1">{accountName}</p>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {/* Timer */}
          <div className="flex items-center justify-center">
            <div
              className={`text-2xl font-mono font-bold ${
                isExpired
                  ? 'text-red-600'
                  : remaining <= 60
                    ? 'text-yellow-600'
                    : 'text-gray-700'
              }`}
            >
              {isExpired ? 'タイムアウト' : formatTime(remaining)}
            </div>
          </div>

          {/* OTP Input */}
          <div>
            <label htmlFor="otp-input" className="block text-sm font-medium text-gray-700 mb-1">
              認証コード（6〜8桁）
            </label>
            <input
              ref={inputRef}
              id="otp-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              value={otp}
              onChange={handleOtpChange}
              disabled={isExpired || isSubmitting}
              placeholder="000000"
              className="w-full px-4 py-3 text-2xl text-center font-mono tracking-widest border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
            />
          </div>

          {/* Retry count warning */}
          {retryCount > 0 && (
            <div className="text-sm text-yellow-600">
              入力回数: {retryCount}/3
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {/* Expired message */}
          {isExpired && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-red-800 text-sm">
                認証コードの有効期限が切れました。キャンセルして再度スクレイピングを実行してください。
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={otp.length < 6 || isExpired || isSubmitting}
              className="flex-1 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? '送信中...' : '送信'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
