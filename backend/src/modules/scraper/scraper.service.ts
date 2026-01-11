import type { AccountService } from '../accounts/account.service.js';
import type { TransactionService } from '../transactions/transaction.service.js';
import type { ClassifierService } from '../classifier/classifier.service.js';
import type {
  ScraperFactory,
  ScrapeResult,
  ScrapeAccountError,
  ScrapeAllResult,
  ScrapedTransaction,
} from './scraper.types.js';

export interface ScrapeSingleResult {
  accountId: number;
  transactionsAdded: number;
  transactionsSkipped: number;
  newBalance: number;
}

type Result<T, E> = { success: true; data: T } | { success: false; error: E };

export class ScraperService {
  constructor(
    private readonly accountService: AccountService,
    private readonly transactionService: TransactionService,
    private readonly classifierService: ClassifierService,
    private readonly scraperFactory: ScraperFactory
  ) {}

  async scrapeAccount(
    accountId: number
  ): Promise<Result<ScrapeSingleResult, ScrapeAccountError>> {
    // Get account
    const accountResult = await this.accountService.getById(accountId);
    if (!accountResult.success) {
      return {
        success: false,
        error: {
          accountId,
          errorType: 'NETWORK_ERROR',
          message: 'Account not found',
        },
      };
    }

    const account = accountResult.data;

    // Check credentials
    if (!account.encryptedCredentials) {
      return {
        success: false,
        error: {
          accountId,
          errorType: 'NO_CREDENTIALS',
          message: '認証情報が設定されていません',
        },
      };
    }

    // Get scraper
    const scraper = this.scraperFactory.getScraper(account.name);
    if (!scraper) {
      return {
        success: false,
        error: {
          accountId,
          errorType: 'SITE_CHANGED',
          message: `スクレイパーが見つかりません: ${account.name}`,
        },
      };
    }

    try {
      // Get decrypted credentials
      const credentials = await this.accountService.getCredentials(accountId);

      // Execute scraping
      const scrapeResult = await scraper.scrape(credentials);

      // Process transactions
      let transactionsAdded = 0;
      let transactionsSkipped = 0;

      for (const tx of scrapeResult.transactions) {
        // Check for duplicates
        const existing = await this.transactionService.findByExternalId(
          tx.externalId
        );
        if (existing) {
          transactionsSkipped++;
          continue;
        }

        // Classify the transaction
        const classification = await this.classifierService.classify(
          tx.description
        );

        // Create transaction
        await this.transactionService.create({
          date: tx.date,
          amount: tx.amount,
          description: tx.description,
          categoryId: classification.categoryId,
          accountId: accountId,
          isManual: false,
          externalId: tx.externalId,
        });

        transactionsAdded++;
      }

      // Update account balance
      await this.accountService.updateBalance(accountId, scrapeResult.balance);

      return {
        success: true,
        data: {
          accountId,
          transactionsAdded,
          transactionsSkipped,
          newBalance: scrapeResult.balance,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: {
          accountId,
          errorType: 'AUTH_FAILED',
          message,
        },
      };
    }
  }

  async scrapeAllAccounts(): Promise<{
    results: ScrapeSingleResult[];
    errors: ScrapeAccountError[];
  }> {
    const accounts = await this.accountService.getAll();
    const results: ScrapeSingleResult[] = [];
    const errors: ScrapeAccountError[] = [];

    for (const account of accounts) {
      // Skip accounts without credentials (e.g., CASH type)
      if (!account.encryptedCredentials) {
        continue;
      }

      const result = await this.scrapeAccount(account.id);
      if (result.success) {
        results.push(result.data);
      } else {
        errors.push(result.error);
      }
    }

    return { results, errors };
  }
}
