import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

export const queryKeys = {
  transactions: (year: number, month: number) => ['transactions', year, month] as const,
  transaction: (id: number) => ['transaction', id] as const,
  categories: () => ['categories'] as const,
  accounts: () => ['accounts'] as const,
  account: (id: number) => ['account', id] as const,
  jobs: () => ['jobs'] as const,
  job: (id: string) => ['job', id] as const,
  analytics: {
    monthly: (year: number, month: number) => ['analytics', 'monthly', year, month] as const,
    categories: (year: number, month: number) => ['analytics', 'categories', year, month] as const,
    trend: (months: number) => ['analytics', 'trend', months] as const,
  },
};
