import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import type { TotpStatusResponse } from '../types';

interface TotpSettingsProps {
  accountId: number;
}

export function TotpSettings({ accountId }: TotpSettingsProps) {
  const queryClient = useQueryClient();
  const [totpSecret, setTotpSecret] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: totpStatus, isLoading } = useQuery({
    queryKey: queryKeys.totpStatus(accountId),
    queryFn: () => apiGet<TotpStatusResponse>(`/accounts/${accountId}/totp-status`),
  });

  const registerMutation = useMutation({
    mutationFn: (secret: string) =>
      apiPost(`/accounts/${accountId}/totp-secret`, { secret }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.totpStatus(accountId) });
      setTotpSecret('');
      setShowInput(false);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : '登録に失敗しました');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiDelete(`/accounts/${accountId}/totp-secret`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.totpStatus(accountId) });
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : '削除に失敗しました');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic Base32 validation
    const base32Regex = /^[A-Z2-7]+=*$/i;
    const cleaned = totpSecret.replace(/\s/g, '').toUpperCase();

    if (!base32Regex.test(cleaned)) {
      setError('TOTPシークレットはBase32形式で入力してください');
      return;
    }

    if (cleaned.length < 16) {
      setError('TOTPシークレットは16文字以上必要です');
      return;
    }

    registerMutation.mutate(cleaned);
  };

  if (isLoading) {
    return (
      <div className="border-t pt-4 mt-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">TOTP設定</h3>
        <p className="text-sm text-gray-500">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="border-t pt-4 mt-4">
      <h3 className="text-sm font-medium text-gray-700 mb-2">TOTP設定</h3>
      <p className="text-xs text-gray-500 mb-3">
        二要素認証（TOTP）のシークレットを登録すると、スクレイピング時に自動でOTPを生成します
      </p>

      {totpStatus?.hasSecret ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-md p-3">
            <span className="text-green-800 text-sm">TOTPシークレット登録済み</span>
            <button
              type="button"
              onClick={() => {
                if (confirm('TOTPシークレットを削除しますか？')) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
              className="text-red-600 hover:text-red-800 text-sm"
            >
              {deleteMutation.isPending ? '削除中...' : '削除'}
            </button>
          </div>
        </div>
      ) : showInput ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              TOTPシークレット（Base32形式）
            </label>
            <input
              type="text"
              value={totpSecret}
              onChange={(e) => setTotpSecret(e.target.value)}
              placeholder="GEZDGNBVGY3TQOJQ..."
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              認証アプリの設定画面で表示されるシークレットキーを入力してください
            </p>
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-2">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowInput(false);
                setTotpSecret('');
                setError(null);
              }}
              className="px-3 py-1.5 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 text-sm"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!totpSecret.trim() || registerMutation.isPending}
              className="px-3 py-1.5 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
            >
              {registerMutation.isPending ? '登録中...' : '登録'}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowInput(true)}
          className="px-3 py-1.5 text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 text-sm"
        >
          TOTPシークレットを登録
        </button>
      )}
    </div>
  );
}
