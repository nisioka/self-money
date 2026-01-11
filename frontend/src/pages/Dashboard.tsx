import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import type { Account, Job, MonthlySummary } from '../types';

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
  }).format(amount);
};

const getAccountTypeLabel = (type: string): string => {
  switch (type) {
    case 'BANK':
      return '銀行';
    case 'CARD':
      return 'カード';
    case 'SECURITIES':
      return '証券';
    case 'CASH':
      return '現金';
    default:
      return type;
  }
};

const getJobStatusLabel = (status: string): string => {
  switch (status) {
    case 'pending':
      return '待機中';
    case 'running':
      return '実行中';
    case 'completed':
      return '完了';
    case 'failed':
      return '失敗';
    default:
      return status;
  }
};

const getJobStatusColor = (status: string): string => {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'running':
      return 'bg-blue-100 text-blue-800';
    case 'completed':
      return 'bg-green-100 text-green-800';
    case 'failed':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export function Dashboard() {
  const queryClient = useQueryClient();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts(),
    queryFn: () => apiGet<Account[]>('/accounts'),
  });

  const { data: summary } = useQuery({
    queryKey: queryKeys.analytics.monthly(year, month),
    queryFn: () => apiGet<MonthlySummary>(`/analytics/monthly?year=${year}&month=${month}`),
  });

  const { data: jobs = [] } = useQuery({
    queryKey: queryKeys.jobs(),
    queryFn: () => apiGet<Job[]>('/jobs?limit=5'),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.some((job) => job.status === 'pending' || job.status === 'running')) {
        return 3000;
      }
      return false;
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => apiPost<Job>('/jobs', { type: 'SCRAPE_ALL' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs() });
    },
  });

  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
  const isJobRunning = jobs.some((job) => job.status === 'pending' || job.status === 'running');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">ダッシュボード</h1>
        <button
          onClick={() => syncMutation.mutate()}
          disabled={isJobRunning || syncMutation.isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isJobRunning ? '更新中...' : '今すぐ更新'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-sm font-medium text-gray-500">総資産</h3>
          <p className={`text-2xl font-bold ${totalBalance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
            {formatCurrency(totalBalance)}
          </p>
        </div>
        {summary && (
          <>
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-sm font-medium text-gray-500">今月の収支</h3>
              <p className={`text-2xl font-bold ${summary.netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(summary.netBalance)}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-sm font-medium text-gray-500">今月の支出</h3>
              <p className="text-2xl font-bold text-red-600">
                {formatCurrency(summary.totalExpense)}
              </p>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Accounts */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">口座残高</h2>
          {accounts.length === 0 ? (
            <p className="text-gray-500">口座が登録されていません</p>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => (
                <div key={account.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="font-medium text-gray-800">{account.name}</p>
                    <p className="text-xs text-gray-500">{getAccountTypeLabel(account.type)}</p>
                  </div>
                  <p className={`font-semibold ${account.balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                    {formatCurrency(account.balance)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Jobs */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">同期状況</h2>
          {jobs.length === 0 ? (
            <p className="text-gray-500">同期履歴がありません</p>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-sm text-gray-600">
                      {new Date(job.createdAt).toLocaleString('ja-JP')}
                    </p>
                    {job.errorMessage && (
                      <p className="text-xs text-red-600 mt-1">{job.errorMessage}</p>
                    )}
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getJobStatusColor(job.status)}`}>
                    {getJobStatusLabel(job.status)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Monthly Summary */}
      {summary && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            {summary.year}年{summary.month}月の収支
          </h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-sm text-gray-500">収入</p>
              <p className="text-xl font-bold text-green-600">{formatCurrency(summary.totalIncome)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">支出</p>
              <p className="text-xl font-bold text-red-600">{formatCurrency(summary.totalExpense)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">収支</p>
              <p className={`text-xl font-bold ${summary.netBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {formatCurrency(summary.netBalance)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
