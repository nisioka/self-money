import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ClassifierService, type GeminiClient } from './classifier.service.js';
import { AutoRuleService } from '../auto-rules/auto-rule.service.js';

const prisma = new PrismaClient();

describe('ClassifierService', () => {
  let autoRuleService: AutoRuleService;
  let mockGeminiClient: GeminiClient;
  let service: ClassifierService;
  let foodCategoryId: number;
  let transportCategoryId: number;
  let unknownCategoryId: number;

  beforeAll(async () => {
    await prisma.$connect();
    autoRuleService = new AutoRuleService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.autoRule.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.category.deleteMany();
    await prisma.account.deleteMany();

    // Create test categories
    const foodCategory = await prisma.category.create({
      data: { name: '食費' },
    });
    foodCategoryId = foodCategory.id;

    const transportCategory = await prisma.category.create({
      data: { name: '交通費' },
    });
    transportCategoryId = transportCategory.id;

    const unknownCategory = await prisma.category.create({
      data: { name: '使途不明金' },
    });
    unknownCategoryId = unknownCategory.id;

    // Create mock Gemini client
    mockGeminiClient = {
      classify: vi.fn(),
    };

    service = new ClassifierService(
      prisma,
      autoRuleService,
      mockGeminiClient,
      '使途不明金'
    );
  });

  describe('classify', () => {
    describe('Rule-based classification', () => {
      it('should classify using rule when keyword matches', async () => {
        // Create a rule
        await autoRuleService.createOrUpdate('セブンイレブン', foodCategoryId);

        const result = await service.classify('セブンイレブン 三鷹店');

        expect(result.categoryId).toBe(foodCategoryId);
        expect(result.categoryName).toBe('食費');
        expect(result.source).toBe('RULE');
      });

      it('should match partial keyword in description', async () => {
        await autoRuleService.createOrUpdate('タクシー', transportCategoryId);

        const result = await service.classify('日本交通タクシー代');

        expect(result.categoryId).toBe(transportCategoryId);
        expect(result.source).toBe('RULE');
      });

      it('should not call AI when rule matches', async () => {
        await autoRuleService.createOrUpdate('コンビニ', foodCategoryId);

        await service.classify('コンビニローソン');

        expect(mockGeminiClient.classify).not.toHaveBeenCalled();
      });
    });

    describe('AI classification', () => {
      it('should use AI when no rule matches', async () => {
        vi.mocked(mockGeminiClient.classify).mockResolvedValue('食費');

        const result = await service.classify('スターバックス');

        expect(mockGeminiClient.classify).toHaveBeenCalledWith(
          'スターバックス',
          expect.arrayContaining(['食費', '交通費', '使途不明金'])
        );
        expect(result.categoryId).toBe(foodCategoryId);
        expect(result.source).toBe('AI');
      });

      it('should return AI confidence when available', async () => {
        vi.mocked(mockGeminiClient.classify).mockResolvedValue('交通費');

        const result = await service.classify('JR東日本');

        expect(result.categoryId).toBe(transportCategoryId);
        expect(result.source).toBe('AI');
      });

      it('should fallback when AI returns invalid category', async () => {
        vi.mocked(mockGeminiClient.classify).mockResolvedValue('存在しない費目');

        const result = await service.classify('謎の支払い');

        expect(result.categoryId).toBe(unknownCategoryId);
        expect(result.categoryName).toBe('使途不明金');
        expect(result.source).toBe('FALLBACK');
      });
    });

    describe('Fallback handling', () => {
      it('should fallback when AI throws error', async () => {
        vi.mocked(mockGeminiClient.classify).mockRejectedValue(
          new Error('API Error')
        );

        const result = await service.classify('エラーテスト');

        expect(result.categoryId).toBe(unknownCategoryId);
        expect(result.categoryName).toBe('使途不明金');
        expect(result.source).toBe('FALLBACK');
      });

      it('should fallback when AI returns empty response', async () => {
        vi.mocked(mockGeminiClient.classify).mockResolvedValue('');

        const result = await service.classify('空レスポンス');

        expect(result.categoryId).toBe(unknownCategoryId);
        expect(result.source).toBe('FALLBACK');
      });

      it('should fallback when AI returns null', async () => {
        vi.mocked(mockGeminiClient.classify).mockResolvedValue(null as any);

        const result = await service.classify('nullレスポンス');

        expect(result.categoryId).toBe(unknownCategoryId);
        expect(result.source).toBe('FALLBACK');
      });
    });
  });

  describe('classifyBatch', () => {
    it('should classify multiple descriptions', async () => {
      await autoRuleService.createOrUpdate('コンビニ', foodCategoryId);
      vi.mocked(mockGeminiClient.classify).mockResolvedValue('交通費');

      const results = await service.classifyBatch([
        'コンビニセブン',
        'JR東日本',
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].source).toBe('RULE');
      expect(results[1].source).toBe('AI');
    });

    it('should return empty array for empty input', async () => {
      const results = await service.classifyBatch([]);
      expect(results).toEqual([]);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty description', async () => {
      vi.mocked(mockGeminiClient.classify).mockResolvedValue('食費');

      const result = await service.classify('');

      // Should still try AI classification
      expect(mockGeminiClient.classify).toHaveBeenCalled();
    });

    it('should handle whitespace-only description', async () => {
      vi.mocked(mockGeminiClient.classify).mockResolvedValue('食費');

      const result = await service.classify('   ');

      expect(mockGeminiClient.classify).toHaveBeenCalled();
    });
  });
});
