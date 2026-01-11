import type { Transaction } from '@prisma/client';
import type {
  TransactionService,
  UpdateTransactionInput,
  TransactionError,
  Result,
} from '../transactions/transaction.service.js';
import type { AutoRuleService } from './auto-rule.service.js';

export class TransactionWithLearning {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly autoRuleService: AutoRuleService
  ) {}

  async updateWithLearning(
    id: number,
    data: UpdateTransactionInput
  ): Promise<Result<Transaction, TransactionError>> {
    // First, get the existing transaction to access its description
    const existingResult = await this.transactionService.findById(id);
    if (!existingResult.success) {
      return existingResult;
    }

    const existingTransaction = existingResult.data;

    // Update the transaction
    const updateResult = await this.transactionService.update(id, data);
    if (!updateResult.success) {
      return updateResult;
    }

    // If category was changed, create or update the auto rule
    if (data.categoryId !== undefined && data.categoryId !== existingTransaction.categoryId) {
      await this.autoRuleService.createOrUpdate(
        existingTransaction.description,
        data.categoryId
      );
    }

    return updateResult;
  }
}
