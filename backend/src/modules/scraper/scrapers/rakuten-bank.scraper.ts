import type { Page } from 'playwright';
import { BaseScraper } from '../base-scraper.js';
import type { ScrapedTransaction, DecryptedCredentials } from '../scraper.types.js';

/**
 * 楽天銀行スクレイパー
 *
 * 注意: このスクレイパーはサイト仕様変更により動作しなくなる可能性があります。
 * 実際のセレクターやページ遷移はサイトを確認して調整が必要です。
 */
export class RakutenBankScraper extends BaseScraper {
  private static readonly ACCOUNT_NAME = '楽天銀行';
  private static readonly LOGIN_URL =
    'https://fes.rakuten-bank.co.jp/MS/main/RbS?CurrentPageID=START&&COMMAND=LOGIN';

  getSupportedAccountName(): string {
    return RakutenBankScraper.ACCOUNT_NAME;
  }

  getLoginUrl(): string {
    return RakutenBankScraper.LOGIN_URL;
  }

  async login(page: Page, credentials: DecryptedCredentials): Promise<void> {
    // ユーザーID入力
    await page.fill('input[name="LOGIN:USER_ID"]', credentials.username);

    // パスワード入力
    await page.fill('input[name="LOGIN:LOGIN_PASSWORD"]', credentials.password);

    // ログインボタンをクリック
    await page.click('input[type="submit"][value="ログイン"]');

    // ログイン後のページ遷移を待機
    await page.waitForLoadState('domcontentloaded');

    // ログインエラーチェック
    const errorMessage = await page.locator('.error-message').textContent().catch(() => null);
    if (errorMessage) {
      throw new Error(`ログイン失敗: ${errorMessage}`);
    }
  }

  async fetchTransactions(page: Page): Promise<ScrapedTransaction[]> {
    // 入出金明細ページへ移動
    await page.click('a:has-text("入出金明細")');
    await page.waitForLoadState('domcontentloaded');

    const transactions: ScrapedTransaction[] = [];

    // 明細テーブルを取得
    const rows = await page.locator('table.statement tbody tr').all();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      try {
        // 日付
        const dateText = await row.locator('td:nth-child(1)').textContent();
        if (!dateText) continue;
        const date = this.parseDate(dateText.trim());

        // 摘要
        const description =
          (await row.locator('td:nth-child(2)').textContent())?.trim() || '';

        // 出金額
        const withdrawalText =
          (await row.locator('td:nth-child(3)').textContent())?.trim() || '';
        // 入金額
        const depositText =
          (await row.locator('td:nth-child(4)').textContent())?.trim() || '';

        // 金額を判定（出金はマイナス、入金はプラス）
        let amount = 0;
        if (withdrawalText && withdrawalText !== '-') {
          amount = -this.parseAmount(withdrawalText);
        } else if (depositText && depositText !== '-') {
          amount = this.parseAmount(depositText);
        }

        if (amount === 0) continue;

        const externalId = this.generateExternalId(date, amount, description, i);

        transactions.push({
          date,
          amount,
          description,
          externalId,
        });
      } catch (error) {
        // パースエラーは無視して次の行へ
        console.error(`[RAKUTEN_BANK] Row parse error:`, error);
        continue;
      }
    }

    return transactions;
  }

  async fetchBalance(page: Page): Promise<number> {
    // 残高表示ページへ移動（通常はログイン後のトップに表示）
    await page.goto('https://fes.rakuten-bank.co.jp/MS/main/RbS?CurrentPageID=BALANCE');
    await page.waitForLoadState('domcontentloaded');

    // 残高を取得
    const balanceText = await page.locator('.total-balance .amount').textContent();
    if (!balanceText) {
      throw new Error('残高の取得に失敗しました');
    }

    return this.parseAmount(balanceText);
  }
}
