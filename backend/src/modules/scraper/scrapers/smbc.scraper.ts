import type { Page } from 'playwright';
import { BaseScraper } from '../base-scraper.js';
import type { ScrapedTransaction, DecryptedCredentials } from '../scraper.types.js';

/**
 * 三井住友銀行スクレイパー
 *
 * 注意: このスクレイパーはサイト仕様変更により動作しなくなる可能性があります。
 */
export class SMBCScraper extends BaseScraper {
  private static readonly ACCOUNT_NAME = '三井住友銀行';
  private static readonly LOGIN_URL =
    'https://direct.smbc.co.jp/aib/aibgsjsw5001.jsp';

  getSupportedAccountName(): string {
    return SMBCScraper.ACCOUNT_NAME;
  }

  getLoginUrl(): string {
    return SMBCScraper.LOGIN_URL;
  }

  async login(page: Page, credentials: DecryptedCredentials): Promise<void> {
    // 店番号・口座番号入力
    if (credentials.additionalFields?.branchCode) {
      await page.fill('input[name="branchNo"]', credentials.additionalFields.branchCode);
    }
    if (credentials.additionalFields?.accountNumber) {
      await page.fill('input[name="accountNo"]', credentials.additionalFields.accountNumber);
    }

    // パスワード入力
    await page.fill('input[name="password"]', credentials.password);

    // ログインボタンをクリック
    await page.click('input[type="submit"]');
    await page.waitForLoadState('domcontentloaded');

    // エラーチェック
    const errorExists = await page.locator('.error').count() > 0;
    if (errorExists) {
      const errorText = await page.locator('.error').textContent();
      throw new Error(`ログイン失敗: ${errorText}`);
    }
  }

  async fetchTransactions(page: Page): Promise<ScrapedTransaction[]> {
    // 入出金明細ページへ移動
    await page.click('a:has-text("入出金明細照会")');
    await page.waitForLoadState('domcontentloaded');

    const transactions: ScrapedTransaction[] = [];
    const rows = await page.locator('table.statement-table tbody tr').all();

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
        console.error(`[SMBC] Row parse error:`, error);
        continue;
      }
    }

    return transactions;
  }

  async fetchBalance(page: Page): Promise<number> {
    const balanceText = await page.locator('.balance-amount').textContent();
    if (!balanceText) {
      throw new Error('残高の取得に失敗しました');
    }
    return this.parseAmount(balanceText);
  }
}
