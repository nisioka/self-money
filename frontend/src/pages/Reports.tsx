import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { apiGet } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import type { MonthlySummary, CategoryBreakdown, MonthlyTrend } from '../types';

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
  }).format(amount);
};

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

export function Reports() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data: summary } = useQuery({
    queryKey: queryKeys.analytics.monthly(year, month),
    queryFn: () => apiGet<MonthlySummary>(`/analytics/monthly?year=${year}&month=${month}`),
  });

  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.analytics.categories(year, month),
    queryFn: () => apiGet<CategoryBreakdown[]>(`/analytics/categories?year=${year}&month=${month}`),
  });

  const { data: trend = [] } = useQuery({
    queryKey: queryKeys.analytics.trend(6),
    queryFn: () => apiGet<MonthlyTrend[]>('/analytics/trend?months=6'),
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

  const pieData = categories.map((cat) => ({
    name: cat.categoryName,
    value: cat.amount,
  }));

  const barData = trend.map((t) => ({
    name: `${t.month}月`,
    収入: t.income,
    支出: t.expense,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">月次レポート</h1>

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

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow-md p-6 text-center">
            <h3 className="text-sm font-medium text-gray-500">収入</h3>
            <p className="text-2xl font-bold text-green-600">
              {formatCurrency(summary.totalIncome)}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 text-center">
            <h3 className="text-sm font-medium text-gray-500">支出</h3>
            <p className="text-2xl font-bold text-red-600">
              {formatCurrency(summary.totalExpense)}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 text-center">
            <h3 className="text-sm font-medium text-gray-500">収支</h3>
            <p className={`text-2xl font-bold ${summary.netBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {formatCurrency(summary.netBalance)}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown Pie Chart */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">費目別支出</h2>
          {categories.length === 0 ? (
            <p className="text-center text-gray-500 py-8">支出データがありません</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Category List */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">支出内訳</h2>
          {categories.length === 0 ? (
            <p className="text-center text-gray-500 py-8">支出データがありません</p>
          ) : (
            <div className="space-y-3">
              {categories.map((cat, index) => (
                <div key={cat.categoryId} className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <span className="font-medium">{cat.categoryName}</span>
                      <span className="text-gray-600">{formatCurrency(cat.amount)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${cat.percentage}%`,
                          backgroundColor: COLORS[index % COLORS.length],
                        }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">{cat.percentage.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Monthly Trend Bar Chart */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">月別推移</h2>
        {trend.length === 0 ? (
          <p className="text-center text-gray-500 py-8">データがありません</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(value) => `${(value / 10000).toFixed(0)}万`} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Legend />
              <Bar dataKey="収入" fill="#10B981" />
              <Bar dataKey="支出" fill="#EF4444" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
