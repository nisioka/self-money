import type { Page } from 'playwright';
import { BaseScraper } from '../base-scraper.js';
import type { ScrapedTransaction, DecryptedCredentials } from '../scraper.types.js';

/**
 * SBI新生銀行スクレイパー
 *
 * 注意: このスクレイパーはサイト仕様変更により動作しなくなる可能性があります。
 */
export class SBIShinseiScraper extends BaseScraper {
  private static readonly ACCOUNT_NAME = 'SBI新生銀行';
  private static readonly LOGIN_URL =
    'https://bk.shinseibank.com/SFC/apps/services/www/SFC/desktopbrowser/default/login';

  getSupportedAccountName(): string {
    return SBIShinseiScraper.ACCOUNT_NAME;
  }

  getLoginUrl(): string {
    return SBIShinseiScraper.LOGIN_URL;
  }

  async login(page: Page, credentials: DecryptedCredentials): Promise<void> {
    // 口座番号入力
    await page.fill('input[name="accountNumber"]', credentials.username);

    // パスワード入力
    await page.fill('input[name="password"]', credentials.password);

    // ログインボタンをクリック
    await page.click('button[type="submit"]');
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
    await page.click('a:has-text("口座明細")');
    await page.waitForLoadState('domcontentloaded');

    const transactions: ScrapedTransaction[] = [];
    const rows = await page.locator('table.statement tbody tr').all();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const dateText = await row.locator('td:nth-child(1)').textContent();
        if (!dateText) continue;
        const date = this.parseDate(dateText.trim());

        const description =
          (await row.locator('td:nth-child(2)').textContent())?.trim() || '';

        const withdrawalText =
          (await row.locator('td:nth-child(3)').textContent())?.trim() || '';
        const depositText =
          (await row.locator('td:nth-child(4)').textContent())?.trim() || '';

        let amount = 0;
        if (withdrawalText && withdrawalText !== '-') {
          amount = -this.parseAmount(withdrawalText);
        } else if (depositText && depositText !== '-') {
          amount = this.parseAmount(depositText);
        }

        if (amount === 0) continue;

        transactions.push({
          date,
          amount,
          description,
          externalId: this.generateExternalId(date, amount, description, i),
        });
      } catch (error) {
        console.error(`[SBI_SHINSEI] Row parse error:`, error);
        continue;
      }
    }

    return transactions;
  }

  async fetchBalance(page: Page): Promise<number> {
    const balanceText = await page.locator('.account-balance-value').textContent();
    if (!balanceText) {
      throw new Error('残高の取得に失敗しました');
    }
    return this.parseAmount(balanceText);
  }
}
