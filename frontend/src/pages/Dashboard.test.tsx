import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Dashboard } from './Dashboard';
import * as api from '../lib/api';

vi.mock('../lib/api');

const mockAccounts = [
  { id: 1, name: '楽天銀行', type: 'BANK', balance: 500000 },
  { id: 2, name: 'ポケットカード', type: 'CARD', balance: -30000 },
];

const mockJobs = [
  { id: 'job-1', type: 'SCRAPE_ALL', status: 'completed', createdAt: '2026-01-12T03:00:00Z' },
];

const mockSummary = {
  year: 2026,
  month: 1,
  totalIncome: 300000,
  totalExpense: 150000,
  netBalance: 150000,
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('Dashboard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.apiGet).mockImplementation((path: string) => {
      if (path === '/accounts') return Promise.resolve(mockAccounts);
      if (path === '/jobs?limit=5') return Promise.resolve(mockJobs);
      if (path.includes('/analytics/monthly')) return Promise.resolve(mockSummary);
      return Promise.reject(new Error('Unknown path'));
    });
  });

  it('should render dashboard title', async () => {
    render(<Dashboard />, { wrapper: createWrapper() });

    expect(screen.getByText('ダッシュボード')).toBeInTheDocument();
  });

  it('should display account balances', async () => {
    render(<Dashboard />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('楽天銀行')).toBeInTheDocument();
    });
    expect(screen.getByText('￥500,000')).toBeInTheDocument();
  });

  it('should display monthly summary', async () => {
    render(<Dashboard />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('今月の収支')).toBeInTheDocument();
    });
    expect(screen.getByText('￥300,000')).toBeInTheDocument();
    // ￥150,000 appears multiple times, use getAllByText
    expect(screen.getAllByText('￥150,000').length).toBeGreaterThan(0);
  });

  it('should show sync button', async () => {
    render(<Dashboard />, { wrapper: createWrapper() });

    expect(screen.getByRole('button', { name: /今すぐ更新/i })).toBeInTheDocument();
  });

  it('should trigger job when sync button is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(api.apiPost).mockResolvedValue({ id: 'new-job', type: 'SCRAPE_ALL', status: 'pending' });

    render(<Dashboard />, { wrapper: createWrapper() });

    const syncButton = screen.getByRole('button', { name: /今すぐ更新/i });
    await user.click(syncButton);

    expect(api.apiPost).toHaveBeenCalledWith('/jobs', { type: 'SCRAPE_ALL' });
  });
});
