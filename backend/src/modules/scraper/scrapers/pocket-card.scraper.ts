import type { Page } from 'playwright';
import { BaseScraper } from '../base-scraper.js';
import type { ScrapedTransaction, DecryptedCredentials } from '../scraper.types.js';

/**
 * ポケットカードスクレイパー
 *
 * 注意: このスクレイパーはサイト仕様変更により動作しなくなる可能性があります。
 */
export class PocketCardScraper extends BaseScraper {
  private static readonly ACCOUNT_NAME = 'ポケットカード';
  private static readonly LOGIN_URL =
    'https://www.pocketcard.co.jp/member/login';

  getSupportedAccountName(): string {
    return PocketCardScraper.ACCOUNT_NAME;
  }

  getLoginUrl(): string {
    return PocketCardScraper.LOGIN_URL;
  }

  async login(page: Page, credentials: DecryptedCredentials): Promise<void> {
    // 会員ID入力
    await page.fill('input[name="memberId"]', credentials.username);

    // パスワード入力
    await page.fill('input[name="password"]', credentials.password);

    // ログインボタンをクリック
    await page.click('button[type="submit"]');
    await page.waitForLoadState('domcontentloaded');

    // エラーチェック
    const errorExists = await page.locator('.error-text').count() > 0;
    if (errorExists) {
      const errorText = await page.locator('.error-text').textContent();
      throw new Error(`ログイン失敗: ${errorText}`);
    }
  }

  async fetchTransactions(page: Page): Promise<ScrapedTransaction[]> {
    // 利用明細ページへ移動
    await page.click('a:has-text("ご利用明細")');
    await page.waitForLoadState('domcontentloaded');

    const transactions: ScrapedTransaction[] = [];
    const rows = await page.locator('table.usage-detail tbody tr').all();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const dateText = await row.locator('td:nth-child(1)').textContent();
        if (!dateText) continue;
        const date = this.parseDate(dateText.trim());

        const description =
          (await row.locator('td:nth-child(2)').textContent())?.trim() || '';

        const amountText =
          (await row.locator('td:nth-child(3)').textContent())?.trim() || '';

        if (!amountText) continue;

        // カード利用は常に支出（マイナス）
        const amount = -Math.abs(this.parseAmount(amountText));

        transactions.push({
          date,
          amount,
          description,
          externalId: this.generateExternalId(date, amount, description, i),
        });
      } catch (error) {
        console.error(`[POCKET_CARD] Row parse error:`, error);
        continue;
      }
    }

    return transactions;
  }

  async fetchBalance(page: Page): Promise<number> {
    // カードの場合は利用可能額ではなく、未請求残高を返す（負の値）
    const balanceText = await page.locator('.unpaid-balance').textContent();
    if (!balanceText) {
      // カードに「残高」の概念がない場合は0を返す
      return 0;
    }
    return -Math.abs(this.parseAmount(balanceText));
  }
}
