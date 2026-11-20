import { convertAmount } from '@/domain/currency';
import { roundMoney } from '@/domain/money';
import type { CurrencyCode, SavingsGoal, Transaction, TransactionType } from '@/domain/types';

export type GoalTransferDirection = 'deposit' | 'withdraw' | null;

/** Determines whether a transaction is a Kumbara deposit, withdrawal, or non-goal entry. */
export function getGoalTransferDirection(
  tx: Pick<Transaction, 'goalId' | 'toAccountId'> | null | undefined,
): GoalTransferDirection {
  if (!tx?.goalId) {
    return null;
  }
  return tx.toAccountId ? 'withdraw' : 'deposit';
}

export interface BuildQuickAddSaveInput {
  isEditing: boolean;
  initialTransaction: Transaction | null;
  linkedGoal: SavingsGoal | null;
  txType: TransactionType;
  numericAmount: number;
  currency: CurrencyCode;
  accountId: string;
  toAccountId: string;
  targetAccountCurrency?: CurrencyCode | null;
  toAmountOverride: number | null;
  categoryId: string;
  cleanDate: string;
  cleanNote: string;
  parsedTags: string[];
  receiptUri: string | null;
  ratesMap: Record<CurrencyCode, number>;
}

export type QuickAddSavePlan =
  | { ok: false; error: string }
  | {
      ok: true;
      mode: 'update';
      id: string;
      patch: Partial<Transaction>;
    }
  | {
      ok: true;
      mode: 'create';
      txInput: {
        type: TransactionType;
        amount: number;
        currency: CurrencyCode;
        accountId: string;
        toAccountId: string | null;
        toAmount: number | null;
        categoryId: string | null;
        date: string;
        note?: string;
        tags: string[];
        receiptUri: string | null;
      };
    };

/**
 * Validates QuickAddModal state and produces a clean create/update payload while
 * preserving Kumbara (`goalId`) deposit vs withdrawal directions.
 */
export function buildQuickAddSavePlan(input: BuildQuickAddSaveInput): QuickAddSavePlan {
  if (input.numericAmount <= 0) {
    return { ok: false, error: 'Lütfen 0’dan büyük geçerli bir tutar girin.' };
  }

  const goalDirection = input.isEditing ? getGoalTransferDirection(input.initialTransaction) : null;

  if (goalDirection === 'deposit' && input.initialTransaction) {
    if (!input.accountId) {
      return { ok: false, error: 'Lütfen kaynak hesap seçin.' };
    }
    const needsGoalConversion =
      Boolean(input.linkedGoal) && input.linkedGoal!.currency !== input.currency;
    const resolvedToAmount = needsGoalConversion
      ? input.toAmountOverride && input.toAmountOverride > 0
        ? roundMoney(input.toAmountOverride)
        : convertAmount(
            input.numericAmount,
            input.currency,
            input.linkedGoal!.currency,
            input.ratesMap,
          )
      : null;

    if (needsGoalConversion && (!resolvedToAmount || resolvedToAmount <= 0)) {
      return { ok: false, error: 'Lütfen geçerli bir kumbara tutarı girin.' };
    }

    return {
      ok: true,
      mode: 'update',
      id: input.initialTransaction.id,
      patch: {
        type: 'transfer',
        amount: input.numericAmount,
        currency: input.currency,
        accountId: input.accountId,
        toAccountId: null,
        toAmount: resolvedToAmount,
        categoryId: null,
        goalId: input.initialTransaction.goalId,
        date: input.cleanDate,
        note: input.cleanNote || undefined,
        tags: input.parsedTags,
        receiptUri: input.receiptUri,
      },
    };
  }

  if (goalDirection === 'withdraw' && input.initialTransaction) {
    if (!input.toAccountId) {
      return { ok: false, error: 'Lütfen hedef hesap seçin.' };
    }
    const targetCurrency = input.targetAccountCurrency ?? input.currency;
    const resolvedToAmount =
      input.toAmountOverride && input.toAmountOverride > 0
        ? roundMoney(input.toAmountOverride)
        : convertAmount(input.numericAmount, input.currency, targetCurrency, input.ratesMap);

    if (!resolvedToAmount || resolvedToAmount <= 0) {
      return { ok: false, error: 'Lütfen geçerli bir hedef tutar girin.' };
    }

    return {
      ok: true,
      mode: 'update',
      id: input.initialTransaction.id,
      patch: {
        type: 'transfer',
        amount: input.numericAmount,
        currency: input.currency,
        accountId: '',
        toAccountId: input.toAccountId,
        toAmount: resolvedToAmount,
        categoryId: null,
        goalId: input.initialTransaction.goalId,
        date: input.cleanDate,
        note: input.cleanNote || undefined,
        tags: input.parsedTags,
        receiptUri: input.receiptUri,
      },
    };
  }

  if (!input.accountId) {
    return { ok: false, error: 'Lütfen bir hesap seçin.' };
  }

  if (input.txType === 'transfer') {
    if (!input.toAccountId) {
      return { ok: false, error: 'Lütfen transfer için hedef hesap seçin.' };
    }
    if (input.toAccountId === input.accountId) {
      return { ok: false, error: 'Kaynak ve hedef hesap aynı olamaz.' };
    }
  } else if (!input.categoryId) {
    return { ok: false, error: 'Lütfen bir kategori seçin.' };
  }

  const resolvedToAmount =
    input.txType === 'transfer'
      ? input.toAmountOverride && input.toAmountOverride > 0
        ? roundMoney(input.toAmountOverride)
        : convertAmount(
            input.numericAmount,
            input.currency,
            input.targetAccountCurrency ?? input.currency,
            input.ratesMap,
          )
      : null;

  if (input.txType === 'transfer' && (!resolvedToAmount || resolvedToAmount <= 0)) {
    return { ok: false, error: 'Lütfen geçerli bir hedef tutar girin.' };
  }

  if (input.isEditing && input.initialTransaction) {
    return {
      ok: true,
      mode: 'update',
      id: input.initialTransaction.id,
      patch: {
        type: input.txType,
        amount: input.numericAmount,
        currency: input.currency,
        accountId: input.accountId,
        toAccountId: input.txType === 'transfer' ? input.toAccountId : null,
        toAmount: input.txType === 'transfer' ? resolvedToAmount : null,
        categoryId: input.txType === 'transfer' ? null : input.categoryId,
        date: input.cleanDate,
        note: input.cleanNote || undefined,
        tags: input.parsedTags,
        receiptUri: input.receiptUri,
      },
    };
  }

  return {
    ok: true,
    mode: 'create',
    txInput: {
      type: input.txType,
      amount: input.numericAmount,
      currency: input.currency,
      accountId: input.accountId,
      toAccountId: input.txType === 'transfer' ? input.toAccountId : null,
      toAmount: input.txType === 'transfer' ? resolvedToAmount : null,
      categoryId: input.txType === 'transfer' ? null : input.categoryId,
      date: input.cleanDate,
      note: input.cleanNote || undefined,
      tags: input.parsedTags,
      receiptUri: input.receiptUri,
    },
  };
}
