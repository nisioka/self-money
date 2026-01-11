import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import type { Account, AccountType, CreateAccountInput, UpdateAccountInput } from '../types';

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
  }).format(amount);
};

const accountTypes: { value: AccountType; label: string }[] = [
  { value: 'BANK', label: '銀行' },
  { value: 'CARD', label: 'カード' },
  { value: 'SECURITIES', label: '証券' },
  { value: 'CASH', label: '現金' },
];


interface AccountFormProps {
  account?: Account;
  onSubmit: (data: CreateAccountInput | UpdateAccountInput) => void;
  onCancel: () => void;
}

function AccountForm({ account, onSubmit, onCancel }: AccountFormProps) {
  const [formData, setFormData] = useState({
    name: account?.name || '',
    type: account?.type || 'BANK' as AccountType,
    loginId: '',
    password: '',
    initialBalance: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (account) {
      const data: UpdateAccountInput = {
        name: formData.name,
      };
      if (formData.loginId && formData.password) {
        data.credentials = {
          loginId: formData.loginId,
          password: formData.password,
        };
      }
      onSubmit(data);
    } else {
      const data: CreateAccountInput = {
        name: formData.name,
        type: formData.type,
      };
      if (formData.loginId && formData.password) {
        data.credentials = {
          loginId: formData.loginId,
          password: formData.password,
        };
      }
      if (formData.initialBalance) {
        data.initialBalance = parseInt(formData.initialBalance);
      }
      onSubmit(data);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">口座名</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          required
        />
      </div>
      {!account && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700">種別</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as AccountType })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              {accountTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">初期残高</label>
            <input
              type="number"
              value={formData.initialBalance}
              onChange={(e) => setFormData({ ...formData, initialBalance: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="0"
            />
          </div>
        </>
      )}
      <div className="border-t pt-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">認証情報（任意）</h3>
        <p className="text-xs text-gray-500 mb-3">
          スクレイピングで自動取得する場合は入力してください
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">ログインID</label>
            <input
              type="text"
              value={formData.loginId}
              onChange={(e) => setFormData({ ...formData, loginId: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">パスワード</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
        >
          キャンセル
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          {account ? '更新' : '追加'}
        </button>
      </div>
    </form>
  );
}

export function Accounts() {
  const queryClient = useQueryClient();
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts(),
    queryFn: () => apiGet<Account[]>('/accounts'),
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateAccountInput) => apiPost<Account>('/accounts', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts() });
      setIsAdding(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateAccountInput }) =>
      apiPatch<Account>(`/accounts/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts() });
      setEditingAccount(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts() });
    },
  });

  // Group accounts by type
  const groupedAccounts = accountTypes.map((type) => ({
    type: type.value,
    label: type.label,
    accounts: accounts.filter((a) => a.type === type.value),
    total: accounts.filter((a) => a.type === type.value).reduce((sum, a) => sum + a.balance, 0),
  })).filter((group) => group.accounts.length > 0);

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">口座管理</h1>
        <button
          onClick={() => setIsAdding(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          口座を追加
        </button>
      </div>

      {/* Add Form Modal */}
      {isAdding && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">口座を追加</h2>
            <AccountForm
              onSubmit={(data) => createMutation.mutate(data as CreateAccountInput)}
              onCancel={() => setIsAdding(false)}
            />
          </div>
        </div>
      )}

      {/* Edit Form Modal */}
      {editingAccount && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">口座を編集</h2>
            <AccountForm
              account={editingAccount}
              onSubmit={(data) => updateMutation.mutate({ id: editingAccount.id, data })}
              onCancel={() => setEditingAccount(null)}
            />
          </div>
        </div>
      )}

      {/* Total Balance */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-sm font-medium text-gray-500">総資産</h2>
        <p className={`text-3xl font-bold ${totalBalance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
          {formatCurrency(totalBalance)}
        </p>
      </div>

      {/* Account Groups */}
      {accounts.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-6 text-center text-gray-500">
          口座が登録されていません
        </div>
      ) : (
        <div className="space-y-4">
          {groupedAccounts.map((group) => (
            <div key={group.type} className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">{group.label}</h2>
                <span className={`font-semibold ${group.total >= 0 ? 'text-gray-700' : 'text-red-600'}`}>
                  {formatCurrency(group.total)}
                </span>
              </div>
              <div className="space-y-3">
                {group.accounts.map((account) => (
                  <div key={account.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="font-medium text-gray-800">{account.name}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`font-semibold ${account.balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                        {formatCurrency(account.balance)}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingAccount(account)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('この口座を削除しますか？関連する取引も削除されます。')) {
                              deleteMutation.mutate(account.id);
                            }
                          }}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
