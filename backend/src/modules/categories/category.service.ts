import type { PrismaClient, Category } from '@prisma/client';

export type CategoryError =
  | { type: 'NOT_FOUND' }
  | { type: 'IN_USE'; transactionCount: number }
  | { type: 'DUPLICATE_NAME' }
  | { type: 'VALIDATION_ERROR'; message: string };

export type Result<T, E> =
  | { success: true; data: T }
  | { success: false; error: E };

const DEFAULT_CATEGORIES = [
  '食費',
  '交通費',
  '住居費',
  '光熱費',
  '通信費',
  '日用品',
  '医療費',
  '保険',
  '教育費',
  '娯楽費',
  '衣服費',
  '美容費',
  '交際費',
  '給与',
  '使途不明金',
];

export class CategoryService {
  constructor(private readonly prisma: PrismaClient) {}

  async getAll(): Promise<Category[]> {
    return this.prisma.category.findMany({
      orderBy: { id: 'asc' },
    });
  }

  async create(name: string): Promise<Result<Category, CategoryError>> {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return {
        success: false,
        error: { type: 'VALIDATION_ERROR', message: 'Name is required' },
      };
    }

    const existing = await this.prisma.category.findUnique({
      where: { name: trimmedName },
    });

    if (existing) {
      return {
        success: false,
        error: { type: 'DUPLICATE_NAME' },
      };
    }

    const category = await this.prisma.category.create({
      data: { name: trimmedName },
    });

    return { success: true, data: category };
  }

  async update(id: number, name: string): Promise<Result<Category, CategoryError>> {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return {
        success: false,
        error: { type: 'VALIDATION_ERROR', message: 'Name is required' },
      };
    }

    const existing = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!existing) {
      return {
        success: false,
        error: { type: 'NOT_FOUND' },
      };
    }

    const duplicate = await this.prisma.category.findFirst({
      where: {
        name: trimmedName,
        id: { not: id },
      },
    });

    if (duplicate) {
      return {
        success: false,
        error: { type: 'DUPLICATE_NAME' },
      };
    }

    const category = await this.prisma.category.update({
      where: { id },
      data: { name: trimmedName },
    });

    return { success: true, data: category };
  }

  async delete(id: number): Promise<Result<void, CategoryError>> {
    const existing = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!existing) {
      return {
        success: false,
        error: { type: 'NOT_FOUND' },
      };
    }

    const transactionCount = await this.prisma.transaction.count({
      where: { categoryId: id },
    });

    if (transactionCount > 0) {
      return {
        success: false,
        error: { type: 'IN_USE', transactionCount },
      };
    }

    await this.prisma.category.delete({
      where: { id },
    });

    return { success: true, data: undefined };
  }

  async seedDefaults(): Promise<void> {
    for (const name of DEFAULT_CATEGORIES) {
      await this.prisma.category.upsert({
        where: { name },
        update: {},
        create: { name, isDefault: true },
      });
    }
  }
}
