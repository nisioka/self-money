import type { PrismaClient, AutoRule, Category } from '@prisma/client';

export interface AutoRuleWithCategory extends AutoRule {
  category: Category;
}

export type AutoRuleError =
  | { type: 'NOT_FOUND' }
  | { type: 'INVALID_CATEGORY' }
  | { type: 'VALIDATION_ERROR'; message: string };

export type Result<T, E> =
  | { success: true; data: T }
  | { success: false; error: E };

export class AutoRuleService {
  constructor(private readonly prisma: PrismaClient) {}

  async getAll(): Promise<AutoRuleWithCategory[]> {
    return this.prisma.autoRule.findMany({
      include: { category: true },
      orderBy: { keyword: 'asc' },
    });
  }

  async findById(id: number): Promise<Result<AutoRuleWithCategory, AutoRuleError>> {
    const rule = await this.prisma.autoRule.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!rule) {
      return { success: false, error: { type: 'NOT_FOUND' } };
    }

    return { success: true, data: rule };
  }

  async findByKeyword(keyword: string): Promise<AutoRuleWithCategory | null> {
    return this.prisma.autoRule.findUnique({
      where: { keyword },
      include: { category: true },
    });
  }

  async findMatchingRule(description: string): Promise<AutoRuleWithCategory | null> {
    const rules = await this.prisma.autoRule.findMany({
      include: { category: true },
    });

    for (const rule of rules) {
      if (description.includes(rule.keyword)) {
        return rule;
      }
    }

    return null;
  }

  async createOrUpdate(
    keyword: string,
    categoryId: number
  ): Promise<Result<AutoRule, AutoRuleError>> {
    const trimmedKeyword = keyword.trim();

    if (!trimmedKeyword) {
      return {
        success: false,
        error: { type: 'VALIDATION_ERROR', message: 'Keyword is required' },
      };
    }

    // Validate category exists
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) {
      return { success: false, error: { type: 'INVALID_CATEGORY' } };
    }

    // Upsert: create or update
    const rule = await this.prisma.autoRule.upsert({
      where: { keyword: trimmedKeyword },
      update: { categoryId },
      create: { keyword: trimmedKeyword, categoryId },
    });

    return { success: true, data: rule };
  }

  async delete(id: number): Promise<Result<void, AutoRuleError>> {
    const existing = await this.prisma.autoRule.findUnique({
      where: { id },
    });

    if (!existing) {
      return { success: false, error: { type: 'NOT_FOUND' } };
    }

    await this.prisma.autoRule.delete({
      where: { id },
    });

    return { success: true, data: undefined };
  }
}
