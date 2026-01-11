import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import App from './App';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
};

describe('App', () => {
  it('should render header with app title', () => {
    renderWithProviders(<App />);
    expect(screen.getByText('家計簿アプリ')).toBeInTheDocument();
  });

  it('should render dashboard section', () => {
    renderWithProviders(<App />);
    expect(screen.getByText('ダッシュボード')).toBeInTheDocument();
  });

  it('should render welcome message', () => {
    renderWithProviders(<App />);
    expect(
      screen.getByText('家計簿アプリへようこそ。セットアップが完了しました。')
    ).toBeInTheDocument();
  });
});
