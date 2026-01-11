import type { PrismaClient, Transaction } from '@prisma/client';

export interface CreateTransactionInput {
  date: Date;
  amount: number;
  description: string;
  categoryId: number;
  accountId: number;
  memo?: string;
  isManual: boolean;
  externalId?: string;
}

export interface UpdateTransactionInput {
  amount?: number;
  categoryId?: number;
  memo?: string;
}

export interface TransactionWithRelations extends Transaction {
  account: { id: number; name: string; type: string };
  category: { id: number; name: string };
}

export type TransactionError =
  | { type: 'NOT_FOUND' }
  | { type: 'INVALID_CATEGORY' }
  | { type: 'INVALID_ACCOUNT' }
  | { type: 'DUPLICATE_EXTERNAL_ID' }
  | { type: 'VALIDATION_ERROR'; message: string };

export type Result<T, E> =
  | { success: true; data: T }
  | { success: false; error: E };

export class TransactionService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    data: CreateTransactionInput
  ): Promise<Result<Transaction, TransactionError>> {
    // Validate description
    const trimmedDescription = data.description.trim();
    if (!trimmedDescription) {
      return {
        success: false,
        error: { type: 'VALIDATION_ERROR', message: 'Description is required' },
      };
    }

    // Check for duplicate externalId
    if (data.externalId) {
      const existing = await this.prisma.transaction.findUnique({
        where: { externalId: data.externalId },
      });
      if (existing) {
        return {
          success: false,
          error: { type: 'DUPLICATE_EXTERNAL_ID' },
        };
      }
    }

    // Validate account exists
    const account = await this.prisma.account.findUnique({
      where: { id: data.accountId },
    });
    if (!account) {
      return {
        success: false,
        error: { type: 'INVALID_ACCOUNT' },
      };
    }

    // Validate category exists
    const category = await this.prisma.category.findUnique({
      where: { id: data.categoryId },
    });
    if (!category) {
      return {
        success: false,
        error: { type: 'INVALID_CATEGORY' },
      };
    }

    const transaction = await this.prisma.transaction.create({
      data: {
        date: data.date,
        amount: data.amount,
        description: trimmedDescription,
        memo: data.memo,
        isManual: data.isManual,
        externalId: data.externalId,
        accountId: data.accountId,
        categoryId: data.categoryId,
      },
    });

    return { success: true, data: transaction };
  }

  async findById(id: number): Promise<Result<Transaction, TransactionError>> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
    });

    if (!transaction) {
      return { success: false, error: { type: 'NOT_FOUND' } };
    }

    return { success: true, data: transaction };
  }

  async update(
    id: number,
    data: UpdateTransactionInput
  ): Promise<Result<Transaction, TransactionError>> {
    const existing = await this.prisma.transaction.findUnique({
      where: { id },
    });

    if (!existing) {
      return { success: false, error: { type: 'NOT_FOUND' } };
    }

    // Validate category if provided
    if (data.categoryId !== undefined) {
      const category = await this.prisma.category.findUnique({
        where: { id: data.categoryId },
      });
      if (!category) {
        return { success: false, error: { type: 'INVALID_CATEGORY' } };
      }
    }

    const transaction = await this.prisma.transaction.update({
      where: { id },
      data: {
        amount: data.amount,
        categoryId: data.categoryId,
        memo: data.memo,
      },
    });

    return { success: true, data: transaction };
  }

  async delete(id: number): Promise<Result<void, TransactionError>> {
    const existing = await this.prisma.transaction.findUnique({
      where: { id },
    });

    if (!existing) {
      return { success: false, error: { type: 'NOT_FOUND' } };
    }

    await this.prisma.transaction.delete({
      where: { id },
    });

    return { success: true, data: undefined };
  }

  async findByMonth(year: number, month: number): Promise<Transaction[]> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    return this.prisma.transaction.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { date: 'desc' },
    });
  }

  async findByAccount(accountId: number): Promise<Transaction[]> {
    return this.prisma.transaction.findMany({
      where: { accountId },
      orderBy: { date: 'desc' },
    });
  }

  async findByMonthAndAccount(
    year: number,
    month: number,
    accountId: number
  ): Promise<Transaction[]> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    return this.prisma.transaction.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
        accountId,
      },
      orderBy: { date: 'desc' },
    });
  }

  async checkDuplicateExternalId(externalId: string): Promise<boolean> {
    const existing = await this.prisma.transaction.findUnique({
      where: { externalId },
    });
    return existing !== null;
  }

  async findByExternalId(externalId: string): Promise<Transaction | null> {
    return this.prisma.transaction.findUnique({
      where: { externalId },
    });
  }

  async findByMonthWithRelations(
    year: number,
    month: number,
    accountId?: number
  ): Promise<TransactionWithRelations[]> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    return this.prisma.transaction.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
        ...(accountId ? { accountId } : {}),
      },
      include: {
        account: {
          select: { id: true, name: true, type: true },
        },
        category: {
          select: { id: true, name: true },
        },
      },
      orderBy: { date: 'desc' },
    });
  }
}
