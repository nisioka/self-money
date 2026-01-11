import type { Page } from 'playwright';
import { BaseScraper } from '../base-scraper.js';
import type { ScrapedTransaction, DecryptedCredentials } from '../scraper.types.js';

/**
 * 楽天証券スクレイパー
 *
 * 注意: このスクレイパーはサイト仕様変更により動作しなくなる可能性があります。
 */
export class RakutenSecuritiesScraper extends BaseScraper {
  private static readonly ACCOUNT_NAME = '楽天証券';
  private static readonly LOGIN_URL =
    'https://www.rakuten-sec.co.jp/web/login.html';

  getSupportedAccountName(): string {
    return RakutenSecuritiesScraper.ACCOUNT_NAME;
  }

  getLoginUrl(): string {
    return RakutenSecuritiesScraper.LOGIN_URL;
  }

  async login(page: Page, credentials: DecryptedCredentials): Promise<void> {
    // ログインID入力
    await page.fill('input[name="loginid"]', credentials.username);

    // パスワード入力
    await page.fill('input[name="passwd"]', credentials.password);

    // ログインボタンをクリック
    await page.click('button:has-text("ログイン")');
    await page.waitForLoadState('domcontentloaded');

    // エラーチェック
    const errorExists = await page.locator('.login-error').count() > 0;
    if (errorExists) {
      const errorText = await page.locator('.login-error').textContent();
      throw new Error(`ログイン失敗: ${errorText}`);
    }
  }

  async fetchTransactions(page: Page): Promise<ScrapedTransaction[]> {
    // 入出金明細ページへ移動
    await page.click('a:has-text("入出金・振替")');
    await page.waitForLoadState('domcontentloaded');

    const transactions: ScrapedTransaction[] = [];
    const rows = await page.locator('table.history tbody tr').all();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const dateText = await row.locator('td:nth-child(1)').textContent();
        if (!dateText) continue;
        const date = this.parseDate(dateText.trim());

        const description =
          (await row.locator('td:nth-child(2)').textContent())?.trim() || '';

        // 証券口座は単一の金額カラムで正負を判定
        const amountText =
          (await row.locator('td:nth-child(3)').textContent())?.trim() || '';

        if (!amountText || amountText === '-') continue;

        const amount = this.parseAmount(amountText);

        transactions.push({
          date,
          amount,
          description,
          externalId: this.generateExternalId(date, amount, description, i),
        });
      } catch (error) {
        console.error(`[RAKUTEN_SEC] Row parse error:`, error);
        continue;
      }
    }

    return transactions;
  }

  async fetchBalance(page: Page): Promise<number> {
    // 預り金残高を取得
    const balanceText = await page.locator('.deposit-balance').textContent();
    if (!balanceText) {
      throw new Error('残高の取得に失敗しました');
    }
    return this.parseAmount(balanceText);
  }
}
