import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import App from './App';
import * as api from './lib/api';

vi.mock('./lib/api');

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const renderApp = () => {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <App />
    </QueryClientProvider>
  );
};

describe('App', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.apiGet).mockImplementation((path: string) => {
      if (path === '/accounts') return Promise.resolve([]);
      if (path.includes('/jobs')) return Promise.resolve([]);
      if (path.includes('/analytics')) return Promise.resolve({ totalIncome: 0, totalExpense: 0, netBalance: 0 });
      return Promise.resolve([]);
    });
  });

  it('should render header with app title', () => {
    renderApp();
    expect(screen.getByText('家計簿')).toBeInTheDocument();
  });

  it('should render dashboard on default route', () => {
    renderApp();
    // Dashboard heading (h1), plus 2 navigation links = 3 total
    expect(screen.getAllByText('ダッシュボード')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'ダッシュボード' })).toBeInTheDocument();
  });

  it('should render navigation links', () => {
    renderApp();
    expect(screen.getAllByRole('link', { name: /取引/i })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: /レポート/i })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: /口座/i })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: /費目/i })).toHaveLength(2);
  });
});
