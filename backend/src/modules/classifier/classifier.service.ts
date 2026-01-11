import type { PrismaClient } from '@prisma/client';
import type { AutoRuleService } from '../auto-rules/auto-rule.service.js';

export interface ClassificationResult {
  categoryId: number;
  categoryName: string;
  source: 'RULE' | 'AI' | 'FALLBACK';
  confidence?: number;
}

export interface GeminiClient {
  classify(description: string, categories: string[]): Promise<string | null>;
}

export class ClassifierService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly autoRuleService: AutoRuleService,
    private readonly geminiClient: GeminiClient,
    private readonly fallbackCategoryName: string = '使途不明金'
  ) {}

  async classify(description: string): Promise<ClassificationResult> {
    // 1. Try rule-based classification first
    const matchingRule = await this.autoRuleService.findMatchingRule(description);
    if (matchingRule) {
      return {
        categoryId: matchingRule.categoryId,
        categoryName: matchingRule.category.name,
        source: 'RULE',
      };
    }

    // 2. Get all categories for AI classification
    const categories = await this.prisma.category.findMany();
    const categoryNames = categories.map((c) => c.name);

    // 3. Try AI classification
    try {
      const aiResult = await this.geminiClient.classify(description, categoryNames);

      if (aiResult && aiResult.trim()) {
        const matchedCategory = categories.find(
          (c) => c.name === aiResult.trim()
        );

        if (matchedCategory) {
          return {
            categoryId: matchedCategory.id,
            categoryName: matchedCategory.name,
            source: 'AI',
          };
        }
      }
    } catch (error) {
      // Log error but continue to fallback
      console.error('[CLASSIFIER] AI classification failed:', error);
    }

    // 4. Fallback to unknown category
    return this.getFallbackResult(categories);
  }

  async classifyBatch(descriptions: string[]): Promise<ClassificationResult[]> {
    if (descriptions.length === 0) {
      return [];
    }

    const results: ClassificationResult[] = [];
    for (const description of descriptions) {
      const result = await this.classify(description);
      results.push(result);
    }
    return results;
  }

  private async getFallbackResult(
    categories: { id: number; name: string }[]
  ): Promise<ClassificationResult> {
    const fallbackCategory = categories.find(
      (c) => c.name === this.fallbackCategoryName
    );

    if (fallbackCategory) {
      return {
        categoryId: fallbackCategory.id,
        categoryName: fallbackCategory.name,
        source: 'FALLBACK',
      };
    }

    // If fallback category doesn't exist, create it
    const created = await this.prisma.category.create({
      data: { name: this.fallbackCategoryName },
    });

    return {
      categoryId: created.id,
      categoryName: created.name,
      source: 'FALLBACK',
    };
  }
}
