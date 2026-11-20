import { describe, expect, it } from 'vitest';
import {
  buildInstallmentTransactions,
  computeAccountBalance,
  computeCreditCardSummary,
  computeNetWorth,
  recomputeDebtPaidAmount,
  recomputeGoalAmount,
} from '@/domain/ledger';
import { advanceRuleDate, processDueRecurringRules } from '@/domain/recurring';
import type {
  Account,
  CurrencyCode,
  Debt,
  InstallmentPlan,
  RecurringRule,
  SavingsGoal,
  Transaction,
} from '@/domain/types';

const RATES: Record<CurrencyCode, number> = {
  TRY: 1,
  USD: 40,
  EUR: 44,
  GBP: 50,
  XAU: 3500,
};

const NOW = '2026-11-20T12:00:00.000Z';

function makeAccount(overrides: Partial<Account> & Pick<Account, 'id' | 'type'>): Account {
  return {
    userId: null,
    name: 'Test Account',
    currency: 'TRY',
    initialBalance: 0,
    color: '#000000',
    icon: 'wallet',
    isArchived: false,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function makeTx(
  overrides: Partial<Transaction> & Pick<Transaction, 'id' | 'type' | 'amount' | 'accountId' | 'date'>,
): Transaction {
  return {
    userId: null,
    currency: 'TRY',
    exchangeRateToBase: 1,
    baseAmount: overrides.amount,
    tags: [],
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

describe('ledger engine: account balances', () => {
  it('computes normal account balance excluding deleted and future transactions', () => {
    const bank = makeAccount({
      id: 'acc-bank',
      type: 'bank',
      currency: 'TRY',
      initialBalance: 1_000,
    });
    const usdAccount = makeAccount({
      id: 'acc-usd',
      type: 'bank',
      currency: 'USD',
      initialBalance: 100,
    });

    const txs: Transaction[] = [
      makeTx({ id: 't1', type: 'income', amount: 5_000, accountId: 'acc-bank', date: '2026-11-05' }),
      makeTx({ id: 't2', type: 'expense', amount: 1_200, accountId: 'acc-bank', date: '2026-11-10' }),
      // Cross-currency incoming transfer using toAmount
      makeTx({
        id: 't3',
        type: 'transfer',
        amount: 50,
        currency: 'USD',
        accountId: 'acc-usd',
        toAccountId: 'acc-bank',
        toAmount: 2_000,
        date: '2026-11-12',
      }),
      // Outgoing transfer from bank
      makeTx({
        id: 't4',
        type: 'transfer',
        amount: 300,
        accountId: 'acc-bank',
        toAccountId: 'acc-cash',
        date: '2026-11-15',
      }),
      // Deleted transaction must be ignored
      makeTx({
        id: 't5',
        type: 'expense',
        amount: 9_999,
        accountId: 'acc-bank',
        date: '2026-11-15',
        deletedAt: NOW,
      }),
      // Future transaction (> asOfDate) must be excluded
      makeTx({
        id: 't6',
        type: 'expense',
        amount: 500,
        accountId: 'acc-bank',
        date: '2026-11-25',
      }),
    ];

    // 1000 + 5000 - 1200 + 2000 - 300 = 6500
    expect(computeAccountBalance(bank, txs, '2026-11-20')).toBe(6_500);
    // 100 - 50 = 50
    expect(computeAccountBalance(usdAccount, txs, '2026-11-20')).toBe(50);
  });

  it('converts cross-currency USD expenses and transfers accurately for TRY bank & credit card accounts', () => {
    const tryBank = makeAccount({
      id: 'acc-try-bank',
      type: 'bank',
      currency: 'TRY',
      initialBalance: 10_000,
    });
    const tryCard = makeAccount({
      id: 'acc-try-card',
      type: 'credit_card',
      currency: 'TRY',
      initialBalance: 0,
      creditLimit: 50_000,
      statementDay: 15,
      dueDay: 25,
    });

    const txs: Transaction[] = [
      makeTx({
        id: 'usd-bank-exp',
        type: 'expense',
        amount: 100,
        currency: 'USD',
        exchangeRateToBase: 40,
        baseAmount: 4_000,
        accountId: tryBank.id,
        date: '2026-11-10',
      }),
      makeTx({
        id: 'usd-card-exp',
        type: 'expense',
        amount: 50,
        currency: 'USD',
        exchangeRateToBase: 40,
        baseAmount: 2_000,
        accountId: tryCard.id,
        date: '2026-11-12',
      }),
    ];

    // 10,000 TRY - (100 USD * 40) = 6,000 TRY
    expect(computeAccountBalance(tryBank, txs, '2026-11-20', RATES)).toBe(6_000);

    // 50 USD * 40 = 2,000 TRY debt on TRY card
    const cardSummary = computeCreditCardSummary(tryCard, txs, '2026-11-20', RATES);
    expect(cardSummary.totalDebt).toBe(2_000);
    expect(cardSummary.availableLimit).toBe(48_000);
    expect(computeAccountBalance(tryCard, txs, '2026-11-20', RATES)).toBe(-2_000);

    const netWorth = computeNetWorth({
      accounts: [tryBank, tryCard],
      goals: [],
      debts: [],
      transactions: txs,
      rates: RATES,
      baseCurrency: 'TRY',
      asOfDate: '2026-11-20',
    });
    expect(netWorth.totalAssets).toBe(6_000);
    expect(netWorth.totalCardDebt).toBe(2_000);
    expect(netWorth.netWorth).toBe(4_000);
  });
});

describe('ledger engine: 2A credit card & net worth invariants', () => {
  it('computes credit card totalDebt (including future installments), availableLimit, statementDue, and maturedDebt', () => {
    const card = makeAccount({
      id: 'acc-card',
      type: 'credit_card',
      currency: 'TRY',
      initialBalance: 0,
      creditLimit: 50_000,
      statementDay: 15,
      dueDay: 25,
    });

    const plan: InstallmentPlan = {
      id: 'plan-1',
      userId: null,
      title: 'Telefon',
      accountId: 'acc-card',
      categoryId: 'cat-1',
      totalAmount: 3_000,
      currency: 'TRY',
      installmentCount: 3,
      startDate: '2026-11-10',
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    };

    const installmentTxs = buildInstallmentTransactions(plan, RATES, 'TRY');
    const payoffTx = makeTx({
      id: 'tx-payoff',
      type: 'transfer',
      amount: 400,
      accountId: 'acc-bank',
      toAccountId: 'acc-card',
      toAmount: 400,
      date: '2026-11-16',
    });

    const allTxs = [...installmentTxs, payoffTx];
    const summary = computeCreditCardSummary(card, allTxs, '2026-11-20');

    expect(summary.totalDebt).toBe(2_600);
    expect(summary.availableLimit).toBe(47_400);
    expect(summary.statementDue).toBe(600);
    expect(summary.maturedDebt).toBe(600);
    expect(summary.statementStart).toBe('2026-10-15');
    expect(summary.statementEnd).toBe('2026-11-15');
    expect(summary.nextDueDate).toBe('2026-11-25');

    // Signed balance convention for credit cards aligns with 2A Net Worth
    expect(computeAccountBalance(card, allTxs, '2026-11-20')).toBe(-2_600);
  });

  it('handles statement window when asOfDate is before statementDay and when dueDay <= statementDay', () => {
    const card = makeAccount({
      id: 'acc-card-2',
      type: 'credit_card',
      currency: 'TRY',
      initialBalance: 500,
      creditLimit: 20_000,
      statementDay: 20,
      dueDay: 5,
    });

    const txs: Transaction[] = [
      makeTx({ id: 'c1', type: 'expense', amount: 1_000, accountId: 'acc-card-2', date: '2026-10-18' }),
      makeTx({ id: 'c2', type: 'expense', amount: 300, accountId: 'acc-card-2', date: '2026-11-05' }),
      makeTx({
        id: 'p1',
        type: 'transfer',
        amount: 200,
        accountId: 'acc-bank',
        toAccountId: 'acc-card-2',
        date: '2026-11-02',
      }),
    ];

    const summary = computeCreditCardSummary(card, txs, '2026-11-10');
    expect(summary.statementStart).toBe('2026-09-20');
    expect(summary.statementEnd).toBe('2026-10-20');
    expect(summary.nextDueDate).toBe('2026-11-05');
    // initialBalance 500 + 1000 (<= Oct 20) - 200 (paid Nov 2) = 1300
    expect(summary.statementDue).toBe(1_300);
    // maturedDebt includes Nov 5 expense of 300 => 1600
    expect(summary.maturedDebt).toBe(1_600);
    expect(summary.totalDebt).toBe(1_600);
  });

  it('computes 2A Net Worth mark-to-market with goals, card totalDebt, and separate personal debts', () => {
    const bankTry = makeAccount({
      id: 'acc-bank',
      type: 'bank',
      currency: 'TRY',
      initialBalance: 10_000,
    });
    const bankUsd = makeAccount({
      id: 'acc-usd',
      type: 'bank',
      currency: 'USD',
      initialBalance: 100,
    });
    const card = makeAccount({
      id: 'acc-card',
      type: 'credit_card',
      currency: 'TRY',
      initialBalance: 2_600,
      creditLimit: 50_000,
      statementDay: 15,
      dueDay: 25,
    });
    const deletedAccount = makeAccount({
      id: 'acc-del',
      type: 'cash',
      currency: 'TRY',
      initialBalance: 99_999,
      deletedAt: NOW,
    });

    const goals: SavingsGoal[] = [
      {
        id: 'goal-1',
        userId: null,
        name: 'Acil Fon',
        targetAmount: 10_000,
        currentAmount: 2_000,
        currency: 'TRY',
        icon: 'shield',
        color: '#10B981',
        isCompleted: false,
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: null,
      },
      {
        id: 'goal-del',
        userId: null,
        name: 'Silinen',
        targetAmount: 5_000,
        currentAmount: 5_000,
        currency: 'TRY',
        icon: 'shield',
        color: '#10B981',
        isCompleted: false,
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: NOW,
      },
    ];

    const debts: Debt[] = [
      {
        id: 'debt-by-me',
        userId: null,
        personName: 'Zeynep',
        direction: 'owed_by_me',
        totalAmount: 1_500,
        paidAmount: 0,
        currency: 'TRY',
        isSettled: false,
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: null,
      },
      {
        id: 'debt-to-me',
        userId: null,
        personName: 'Ahmet',
        direction: 'owed_to_me',
        totalAmount: 500,
        paidAmount: 0,
        currency: 'TRY',
        isSettled: false,
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: null,
      },
      {
        id: 'debt-settled',
        userId: null,
        personName: 'Mehmet',
        direction: 'owed_to_me',
        totalAmount: 5_000,
        paidAmount: 5_000,
        currency: 'TRY',
        isSettled: true,
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: null,
      },
    ];

    const result = computeNetWorth({
      accounts: [bankTry, bankUsd, card, deletedAccount],
      goals,
      debts,
      transactions: [],
      rates: RATES,
      baseCurrency: 'TRY',
      asOfDate: '2026-11-20',
    });

    expect(result.totalAssets).toBe(14_000);
    expect(result.totalGoals).toBe(2_000);
    expect(result.totalCardDebt).toBe(2_600);
    expect(result.netWorth).toBe(13_400);
    expect(result.owedByMe).toBe(1_500);
    expect(result.owedToMe).toBe(500);
    expect(result.netDebtPosition).toBe(-1_000);
  });
});

describe('ledger engine: goal & debt recomputation', () => {
  it('recomputes goal amount on deposit, withdrawal, deletion, and clamps at 0', () => {
    const goal: SavingsGoal = {
      id: 'goal-1',
      userId: null,
      name: 'Tatil',
      targetAmount: 10_000,
      currentAmount: 0,
      currency: 'TRY',
      icon: 'plane',
      color: '#3B82F6',
      isCompleted: false,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    };

    const deposit1 = makeTx({
      id: 'g1',
      type: 'transfer',
      amount: 1_500,
      accountId: 'acc-bank',
      toAccountId: null,
      goalId: 'goal-1',
      date: '2026-11-01',
    });
    const withdraw1 = makeTx({
      id: 'g2',
      type: 'transfer',
      amount: 400,
      accountId: '',
      toAccountId: 'acc-bank',
      goalId: 'goal-1',
      date: '2026-11-05',
    });
    const deletedDeposit = makeTx({
      id: 'g3',
      type: 'transfer',
      amount: 2_000,
      accountId: 'acc-bank',
      toAccountId: null,
      goalId: 'goal-1',
      date: '2026-11-06',
      deletedAt: NOW,
    });

    expect(recomputeGoalAmount(goal, [deposit1, withdraw1, deletedDeposit])).toBe(1_100);
    expect(recomputeGoalAmount(goal, [deposit1, withdraw1], 500)).toBe(1_600);
    // Clamps to 0 when withdrawals exceed deposits
    expect(recomputeGoalAmount(goal, [withdraw1])).toBe(0);
  });

  it('recomputes debt paidAmount when linked transactions are added, edited, or deleted', () => {
    const debt: Debt = {
      id: 'debt-1',
      userId: null,
      personName: 'Ahmet',
      direction: 'owed_to_me',
      totalAmount: 5_000,
      paidAmount: 0,
      currency: 'TRY',
      isSettled: false,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    };

    const p1 = makeTx({
      id: 'd1',
      type: 'income',
      amount: 2_000,
      accountId: 'acc-bank',
      debtId: 'debt-1',
      date: '2026-11-10',
    });
    const p2 = makeTx({
      id: 'd2',
      type: 'income',
      amount: 1_500,
      accountId: 'acc-bank',
      debtId: 'debt-1',
      date: '2026-11-15',
    });

    expect(recomputeDebtPaidAmount(debt, [p1, p2])).toBe(3_500);
    // Soft-deleted payment drops off
    expect(recomputeDebtPaidAmount(debt, [p1, { ...p2, deletedAt: NOW }])).toBe(2_000);
    // Clamped to totalAmount
    expect(recomputeDebtPaidAmount(debt, [p1, p2], 3_000)).toBe(5_000);
  });
});

describe('Review Focus #1: installment month-end clamping & remainder kurus', () => {
  it('splits 100 across 3 months starting 2026-01-31 with clamped month-end dates', () => {
    const plan: InstallmentPlan = {
      id: 'plan-jan31',
      userId: 'user-1',
      title: 'Mobilya',
      accountId: 'acc-card',
      categoryId: 'cat-home',
      totalAmount: 100,
      currency: 'USD',
      installmentCount: 3,
      startDate: '2026-01-31',
      note: 'Salon',
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      isDemo: true,
    };

    const txs = buildInstallmentTransactions(plan, RATES, 'TRY');

    expect(txs).toHaveLength(3);
    expect(txs.map((t) => t.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(txs.map((t) => t.amount)).toEqual([33.34, 33.33, 33.33]);
    expect(txs[0].note).toContain('1/3');
    expect(txs[1].note).toContain('2/3');
    expect(txs[2].note).toContain('3/3');
    expect(txs[0].note).toContain('Salon');
    expect(txs.map((t) => t.installmentNumber)).toEqual([1, 2, 3]);
    expect(txs.every((t) => t.installmentPlanId === 'plan-jan31' && t.isDemo === true)).toBe(true);
    expect(txs[0].exchangeRateToBase).toBe(40);
    expect(txs[0].baseAmount).toBe(1333.6);
  });

  it('clamps to Feb 29 in leap years', () => {
    const plan: InstallmentPlan = {
      id: 'plan-leap',
      userId: null,
      title: 'Kurs',
      accountId: 'acc-card',
      categoryId: 'cat-edu',
      totalAmount: 300,
      currency: 'TRY',
      installmentCount: 3,
      startDate: '2028-01-31',
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    };

    const txs = buildInstallmentTransactions(plan, RATES, 'TRY');
    expect(txs.map((t) => t.date)).toEqual(['2028-01-31', '2028-02-29', '2028-03-31']);
  });
});

describe('Review Focus #2: recurring rule advancement & multi-period catch-up', () => {
  it('preserves anchor day across month-end clamping and handles all frequencies', () => {
    expect(advanceRuleDate('2026-08-31', 'daily')).toBe('2026-09-01');
    expect(advanceRuleDate('2026-08-31', 'weekly')).toBe('2026-09-07');
    expect(advanceRuleDate('2026-08-31', 'monthly')).toBe('2026-09-30');
    expect(advanceRuleDate('2026-09-30', 'monthly', 31)).toBe('2026-10-31');
    expect(advanceRuleDate('2026-10-31', 'monthly', 31)).toBe('2026-11-30');
    expect(advanceRuleDate('2028-02-29', 'yearly', 29)).toBe('2029-02-28');
    expect(advanceRuleDate('2031-02-28', 'yearly', 29)).toBe('2032-02-29');
  });

  it('catches up all missed monthly occurrences for autoCreate: true without skipping', () => {
    const rule: RecurringRule = {
      id: 'rule-1',
      userId: null,
      title: 'Kira',
      type: 'expense',
      amount: 15_000,
      currency: 'TRY',
      accountId: 'acc-bank',
      categoryId: 'cat-rent',
      frequency: 'monthly',
      nextRunDate: '2026-08-31',
      autoCreate: true,
      remindDaysBefore: 2,
      isActive: true,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    };

    const result = processDueRecurringRules([rule], '2026-11-20', RATES, 'TRY', NOW);

    expect(result.pendingApprovals).toHaveLength(0);
    expect(result.createdTransactions).toHaveLength(3);
    expect(result.createdTransactions.map((t) => t.date)).toEqual([
      '2026-08-31',
      '2026-09-30',
      '2026-10-31',
    ]);
    expect(result.createdTransactions.every((t) => t.recurringRuleId === 'rule-1')).toBe(true);
    expect(result.updatedRules[0].nextRunDate).toBe('2026-11-30');
  });

  it('queues pendingApprovals without creating transactions or mutating nextRunDate when autoCreate: false', () => {
    const rule: RecurringRule = {
      id: 'rule-manual',
      userId: null,
      title: 'Aidat',
      type: 'expense',
      amount: 1_200,
      currency: 'TRY',
      accountId: 'acc-bank',
      categoryId: 'cat-rent',
      frequency: 'monthly',
      nextRunDate: '2026-08-31',
      autoCreate: false,
      remindDaysBefore: 1,
      isActive: true,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    };

    const result = processDueRecurringRules([rule], '2026-11-20', RATES, 'TRY', NOW);

    expect(result.createdTransactions).toHaveLength(0);
    expect(result.pendingApprovals.map((p) => p.dueDate)).toEqual([
      '2026-08-31',
      '2026-09-30',
      '2026-10-31',
    ]);
    expect(result.updatedRules[0].nextRunDate).toBe('2026-08-31');
  });

  it('skips inactive or deleted rules and caps catch-up iterations safely', () => {
    const inactive: RecurringRule = {
      id: 'rule-inactive',
      userId: null,
      title: 'Pasif',
      type: 'expense',
      amount: 100,
      currency: 'TRY',
      accountId: 'acc-bank',
      categoryId: 'cat-1',
      frequency: 'daily',
      nextRunDate: '2026-11-01',
      autoCreate: true,
      remindDaysBefore: 0,
      isActive: false,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    };
    const ancientDaily: RecurringRule = {
      ...inactive,
      id: 'rule-ancient',
      title: 'Günlük Çok Eski',
      isActive: true,
      nextRunDate: '2020-01-01',
    };

    const result = processDueRecurringRules([inactive, ancientDaily], '2026-11-20', RATES, 'TRY', NOW);
    expect(result.createdTransactions.length).toBeLessThanOrEqual(400);
    expect(result.createdTransactions.some((t) => t.recurringRuleId === 'rule-inactive')).toBe(false);
  });
});
