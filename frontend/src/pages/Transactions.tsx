import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import type { Transaction, Category, Account, CreateTransactionInput, UpdateTransactionInput } from '../types';

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
  }).format(Math.abs(amount));
};

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('ja-JP');
};

interface TransactionFormProps {
  transaction?: Transaction;
  categories: Category[];
  accounts: Account[];
  onSubmit: (data: CreateTransactionInput | UpdateTransactionInput) => void;
  onCancel: () => void;
}

function TransactionForm({ transaction, categories, accounts, onSubmit, onCancel }: TransactionFormProps) {
  const [formData, setFormData] = useState({
    date: transaction?.date.split('T')[0] || new Date().toISOString().split('T')[0],
    amount: transaction ? Math.abs(transaction.amount).toString() : '',
    isExpense: transaction ? transaction.amount < 0 : true,
    description: transaction?.description || '',
    categoryId: transaction?.categoryId.toString() || '',
    accountId: transaction?.accountId.toString() || '',
    memo: transaction?.memo || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseInt(formData.amount) * (formData.isExpense ? -1 : 1);

    if (transaction) {
      onSubmit({
        amount,
        categoryId: parseInt(formData.categoryId),
        memo: formData.memo || undefined,
      });
    } else {
      onSubmit({
        date: formData.date,
        amount,
        description: formData.description,
        categoryId: parseInt(formData.categoryId),
        accountId: parseInt(formData.accountId),
        memo: formData.memo || undefined,
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!transaction && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700">日付</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">口座</label>
            <select
              value={formData.accountId}
              onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            >
              <option value="">選択してください</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">摘要</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>
        </>
      )}
      <div className="flex gap-4">
        <label className="flex items-center">
          <input
            type="radio"
            checked={formData.isExpense}
            onChange={() => setFormData({ ...formData, isExpense: true })}
            className="mr-2"
          />
          支出
        </label>
        <label className="flex items-center">
          <input
            type="radio"
            checked={!formData.isExpense}
            onChange={() => setFormData({ ...formData, isExpense: false })}
            className="mr-2"
          />
          収入
        </label>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">金額</label>
        <input
          type="number"
          value={formData.amount}
          onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          min="1"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">費目</label>
        <select
          value={formData.categoryId}
          onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          required
        >
          <option value="">選択してください</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">メモ</label>
        <textarea
          value={formData.memo}
          onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          rows={2}
        />
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
          {transaction ? '更新' : '追加'}
        </button>
      </div>
    </form>
  );
}

export function Transactions() {
  const queryClient = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const { data: transactions = [] } = useQuery({
    queryKey: queryKeys.transactions(year, month),
    queryFn: () => apiGet<Transaction[]>(`/transactions?year=${year}&month=${month}`),
  });

  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.categories(),
    queryFn: () => apiGet<Category[]>('/categories'),
  });

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts(),
    queryFn: () => apiGet<Account[]>('/accounts'),
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateTransactionInput) => apiPost<Transaction>('/transactions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions(year, month) });
      setIsAdding(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateTransactionInput }) =>
      apiPatch<Transaction>(`/transactions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions(year, month) });
      setEditingTransaction(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/transactions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions(year, month) });
    },
  });

  const handlePrevMonth = () => {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">取引一覧</h1>
        <button
          onClick={() => setIsAdding(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          取引を追加
        </button>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={handlePrevMonth}
          className="p-2 rounded-full hover:bg-gray-100"
        >
          ←
        </button>
        <span className="text-lg font-semibold">
          {year}年{month}月
        </span>
        <button
          onClick={handleNextMonth}
          className="p-2 rounded-full hover:bg-gray-100"
        >
          →
        </button>
      </div>

      {/* Add Form Modal */}
      {isAdding && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">取引を追加</h2>
            <TransactionForm
              categories={categories}
              accounts={accounts}
              onSubmit={(data) => createMutation.mutate(data as CreateTransactionInput)}
              onCancel={() => setIsAdding(false)}
            />
          </div>
        </div>
      )}

      {/* Edit Form Modal */}
      {editingTransaction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">取引を編集</h2>
            <TransactionForm
              transaction={editingTransaction}
              categories={categories}
              accounts={accounts}
              onSubmit={(data) => updateMutation.mutate({ id: editingTransaction.id, data })}
              onCancel={() => setEditingTransaction(null)}
            />
          </div>
        </div>
      )}

      {/* Transaction List */}
      <div className="bg-white rounded-lg shadow-md">
        {transactions.length === 0 ? (
          <p className="p-6 text-center text-gray-500">取引がありません</p>
        ) : (
          <div className="divide-y divide-gray-200">
            {transactions.map((transaction) => (
              <div key={transaction.id} className="p-4 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">{formatDate(transaction.date)}</span>
                    <span className="text-xs px-2 py-0.5 bg-gray-100 rounded">
                      {transaction.category.name}
                    </span>
                  </div>
                  <p className="font-medium text-gray-800">{transaction.description}</p>
                  {transaction.memo && (
                    <p className="text-sm text-gray-500">{transaction.memo}</p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className={`font-semibold ${transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {transaction.amount >= 0 ? '+' : '-'}{formatCurrency(transaction.amount)}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingTransaction(transaction)}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('この取引を削除しますか？')) {
                          deleteMutation.mutate(transaction.id);
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
        )}
      </div>
    </div>
  );
}
