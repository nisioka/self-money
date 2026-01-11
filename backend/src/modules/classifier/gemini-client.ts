import type { GeminiClient } from './classifier.service.js';

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

export class GeminiApiClient implements GeminiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(
    apiKey: string,
    model: string = 'gemini-2.0-flash-lite'
  ) {
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required');
    }
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  }

  async classify(description: string, categories: string[]): Promise<string | null> {
    const prompt = this.buildPrompt(description, categories);

    try {
      const response = await fetch(
        `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 50,
            },
          }),
        }
      );

      if (!response.ok) {
        console.error(
          `[GEMINI] API error: ${response.status} ${response.statusText}`
        );
        return null;
      }

      const data = (await response.json()) as GeminiResponse;
      return this.extractCategory(data, categories);
    } catch (error) {
      console.error('[GEMINI] Request failed:', error);
      return null;
    }
  }

  private buildPrompt(description: string, categories: string[]): string {
    const categoryList = categories.join(', ');
    return `あなたは家計簿の費目分類アシスタントです。
以下の取引明細を見て、最も適切な費目を1つだけ回答してください。

取引明細: ${description}

選択可能な費目: ${categoryList}

回答は費目名のみを出力してください。説明は不要です。`;
  }

  private extractCategory(
    data: GeminiResponse,
    validCategories: string[]
  ): string | null {
    const candidates = data.candidates;
    if (!candidates || candidates.length === 0) {
      return null;
    }

    const parts = candidates[0]?.content?.parts;
    if (!parts || parts.length === 0) {
      return null;
    }

    const text = parts[0]?.text?.trim();
    if (!text) {
      return null;
    }

    // Validate against provided categories
    const matchedCategory = validCategories.find(
      (cat) => cat === text || text.includes(cat)
    );

    return matchedCategory || text;
  }
}
