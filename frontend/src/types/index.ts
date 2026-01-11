// Account types
export type AccountType = 'BANK' | 'CARD' | 'SECURITIES' | 'CASH';

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  balance: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  credentials?: {
    loginId: string;
    password: string;
  };
  initialBalance?: number;
}

export interface UpdateAccountInput {
  name?: string;
  credentials?: {
    loginId: string;
    password: string;
  };
}

// Category types
export interface Category {
  id: number;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

// Transaction types
export interface Transaction {
  id: number;
  date: string;
  amount: number;
  description: string;
  memo: string | null;
  isManual: boolean;
  externalId: string | null;
  accountId: number;
  categoryId: number;
  account: Account;
  category: Category;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransactionInput {
  date: string;
  amount: number;
  description: string;
  categoryId: number;
  accountId: number;
  memo?: string;
}

export interface UpdateTransactionInput {
  amount?: number;
  categoryId?: number;
  memo?: string;
}

// Job types
export type JobType = 'SCRAPE_ALL' | 'SCRAPE_SPECIFIC';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  targetAccountId: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

// Analytics types
export interface MonthlySummary {
  year: number;
  month: number;
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
}

export interface CategoryBreakdown {
  categoryId: number;
  categoryName: string;
  amount: number;
  percentage: number;
}

export interface MonthlyTrend {
  year: number;
  month: number;
  income: number;
  expense: number;
}
