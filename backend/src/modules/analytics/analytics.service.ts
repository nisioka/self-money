import type { PrismaClient } from '@prisma/client';

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

export class AnalyticsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * 指定月の収支サマリーを取得する
   */
  async getMonthlySummary(year: number, month: number): Promise<MonthlySummary> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    let totalIncome = 0;
    let totalExpense = 0;

    for (const tx of transactions) {
      if (tx.amount > 0) {
        totalIncome += tx.amount;
      } else {
        totalExpense += Math.abs(tx.amount);
      }
    }

    return {
      year,
      month,
      totalIncome,
      totalExpense,
      netBalance: totalIncome - totalExpense,
    };
  }

  /**
   * 指定月の費目別支出内訳を取得する
   */
  async getCategoryBreakdown(
    year: number,
    month: number
  ): Promise<CategoryBreakdown[]> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    // 支出のみを対象とする（amount < 0）
    const transactions = await this.prisma.transaction.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
        amount: {
          lt: 0,
        },
      },
      include: {
        category: true,
      },
    });

    if (transactions.length === 0) {
      return [];
    }

    // 費目ごとに集計
    const categoryMap = new Map<
      number,
      { name: string; amount: number }
    >();

    for (const tx of transactions) {
      const current = categoryMap.get(tx.categoryId) || {
        name: tx.category.name,
        amount: 0,
      };
      current.amount += Math.abs(tx.amount);
      categoryMap.set(tx.categoryId, current);
    }

    // 総支出額を計算
    const totalExpense = Array.from(categoryMap.values()).reduce(
      (sum, cat) => sum + cat.amount,
      0
    );

    // 結果を配列に変換し、金額降順でソート
    const result: CategoryBreakdown[] = Array.from(categoryMap.entries())
      .map(([categoryId, data]) => ({
        categoryId,
        categoryName: data.name,
        amount: data.amount,
        percentage: (data.amount / totalExpense) * 100,
      }))
      .sort((a, b) => b.amount - a.amount);

    return result;
  }

  /**
   * 過去N月分の月別推移を取得する
   */
  async getMonthlyTrend(months: number): Promise<MonthlyTrend[]> {
    if (months <= 0) {
      return [];
    }

    const now = new Date();
    const result: MonthlyTrend[] = [];

    // 過去N月分のデータを生成
    for (let i = months - 1; i >= 0; i--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth() + 1;

      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);

      const transactions = await this.prisma.transaction.findMany({
        where: {
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      let income = 0;
      let expense = 0;

      for (const tx of transactions) {
        if (tx.amount > 0) {
          income += tx.amount;
        } else {
          expense += Math.abs(tx.amount);
        }
      }

      result.push({
        year,
        month,
        income,
        expense,
      });
    }

    return result;
  }
}
