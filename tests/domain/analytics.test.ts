import { describe, expect, it } from 'vitest';
import {
  buildSharedReportSnapshot,
  computeBudgetProgress,
  computeCalendarDailySummary,
  computeCategoryBreakdown,
  computeCategoryMovers,
  computeCumulativeCashFlowSeries,
  computeEndOfMonthForecast,
  computeIncomeExpenseSeries,
  computePeriodKPIs,
  filterReportTransactions,
} from '@/domain/analytics';
import { DEFAULT_EXCHANGE_RATES } from '@/domain/currency';
import { getFiscalMonthRange, getPeriodRange } from '@/domain/periods';
import type { Budget, Category, Transaction } from '@/domain/types';

const NOW = '2026-11-20T12:00:00.000Z';

function makeCategory(overrides: Partial<Category> & Pick<Category, 'id' | 'name' | 'type'>): Category {
  return {
    userId: null,
    icon: 'tag',
    color: '#EF4444',
    isDefault: true,
    sortOrder: 1,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function makeTx(
  overrides: Partial<Transaction> & Pick<Transaction, 'id' | 'type' | 'amount' | 'date'>,
): Transaction {
  const baseAmount = overrides.baseAmount ?? overrides.amount;
  return {
    userId: null,
    currency: 'TRY',
    exchangeRateToBase: 1,
    baseAmount,
    accountId: 'acc-bank',
    toAccountId: null,
    toAmount: null,
    categoryId: null,
    tags: [],
    receiptUri: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function makeBudget(
  overrides: Partial<Budget> & Pick<Budget, 'id' | 'month' | 'limitAmount'>,
): Budget {
  return {
    userId: null,
    categoryId: null,
    currency: 'TRY',
    alert80Sent: false,
    alert100Sent: false,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

const CATEGORIES: Category[] = [
  makeCategory({ id: 'cat-salary', name: 'Maaş', type: 'income', color: '#10B981', icon: 'briefcase' }),
  makeCategory({ id: 'cat-freelance', name: 'Freelance', type: 'income', color: '#059669', icon: 'laptop' }),
  makeCategory({ id: 'cat-market', name: 'Market', type: 'expense', color: '#EF4444', icon: 'shopping-cart' }),
  makeCategory({ id: 'cat-food', name: 'Yeme-İçme', type: 'expense', color: '#F97316', icon: 'utensils' }),
  makeCategory({ id: 'cat-rent', name: 'Kira', type: 'expense', color: '#EC4899', icon: 'home' }),
  makeCategory({ id: 'cat-bills', name: 'Faturalar', type: 'expense', color: '#EAB308', icon: 'receipt' }),
  makeCategory({ id: 'cat-travel', name: 'Ulaşım', type: 'expense', color: '#F59E0B', icon: 'car' }),
];

describe('filterReportTransactions', () => {
  it('excludes soft-deleted rows and filters by date range and predicates including toAccountId', () => {
    const txs: Transaction[] = [
      makeTx({
        id: 't1',
        type: 'expense',
        amount: 250,
        date: '2026-11-05',
        accountId: 'acc-cash',
        categoryId: 'cat-market',
        note: 'Haftalık Migros alışverişi',
        tags: ['mutfak', 'temel'],
      }),
      makeTx({
        id: 't2',
        type: 'transfer',
        amount: 5000,
        date: '2026-11-10',
        accountId: 'acc-bank',
        toAccountId: 'acc-card',
        note: 'Kart borcu ödemesi',
      }),
      makeTx({
        id: 't3',
        type: 'expense',
        amount: 900,
        date: '2026-11-12',
        accountId: 'acc-cash',
        categoryId: 'cat-market',
        deletedAt: NOW,
      }),
      makeTx({
        id: 't4',
        type: 'expense',
        amount: 400,
        date: '2026-10-31',
        accountId: 'acc-cash',
        categoryId: 'cat-market',
      }),
    ];

    const range = { startDate: '2026-11-01', endDate: '2026-11-30' };
    expect(filterReportTransactions(txs, range).map((t) => t.id)).toEqual(['t1', 't2']);
    expect(filterReportTransactions(txs, range, { accountId: 'acc-card' }).map((t) => t.id)).toEqual(['t2']);
    expect(filterReportTransactions(txs, range, { categoryId: 'cat-market', tag: 'MUTFAK' }).map((t) => t.id)).toEqual(['t1']);
    expect(filterReportTransactions(txs, range, { search: 'migros' }).map((t) => t.id)).toEqual(['t1']);
    expect(filterReportTransactions(txs, range, { minAmount: 1000, maxAmount: 6000 }).map((t) => t.id)).toEqual(['t2']);
  });
});

describe('computePeriodKPIs & series', () => {
  const currentRange = { startDate: '2026-11-01', endDate: '2026-11-10' }; // 10 days
  const prevRange = { startDate: '2026-10-22', endDate: '2026-10-31' }; // 10 days

  it('excludes transfers and soft-deleted rows and computes KPIs and deltas accurately', () => {
    const txs: Transaction[] = [
      // Current period
      makeTx({ id: 'c-inc', type: 'income', amount: 1000, currency: 'USD', exchangeRateToBase: 36.5, baseAmount: 36500, date: '2026-11-01', categoryId: 'cat-salary' }),
      makeTx({ id: 'c-exp', type: 'expense', amount: 10000, baseAmount: 10000, date: '2026-11-03', categoryId: 'cat-rent' }),
      makeTx({ id: 'c-tr-acc', type: 'transfer', amount: 5000, baseAmount: 5000, date: '2026-11-04', toAccountId: 'acc-savings' }),
      makeTx({ id: 'c-tr-card', type: 'transfer', amount: 3000, baseAmount: 3000, date: '2026-11-05', toAccountId: 'acc-card' }),
      makeTx({ id: 'c-tr-goal', type: 'transfer', amount: 2000, baseAmount: 2000, date: '2026-11-06', goalId: 'goal-1' }),
      makeTx({ id: 'c-del', type: 'expense', amount: 99999, baseAmount: 99999, date: '2026-11-07', deletedAt: NOW }),
      // Previous period
      makeTx({ id: 'p-inc', type: 'income', amount: 30000, baseAmount: 30000, date: '2026-10-23', categoryId: 'cat-salary' }),
      makeTx({ id: 'p-exp', type: 'expense', amount: 12500, baseAmount: 12500, date: '2026-10-25', categoryId: 'cat-rent' }),
      makeTx({ id: 'p-tr', type: 'transfer', amount: 10000, baseAmount: 10000, date: '2026-10-26', toAccountId: 'acc-card' }),
    ];

    const kpis = computePeriodKPIs(txs, currentRange, prevRange);
    expect(kpis.totalIncome).toBe(36500);
    expect(kpis.totalExpense).toBe(10000);
    expect(kpis.netCashFlow).toBe(26500);
    expect(kpis.savingsRate).toBe(72.6); // (26500 / 36500) * 100 = 72.6027...
    expect(kpis.dailyAverageExpense).toBe(1000);
    expect(kpis.incomeDeltaPct).toBe(21.67); // (36500 - 30000) / 30000 * 100
    expect(kpis.expenseDeltaPct).toBe(-20); // (10000 - 12500) / 12500 * 100
    expect(kpis.netDeltaPct).toBe(51.43); // (26500 - 17500) / 17500 * 100
  });

  it('handles zero previous period KPIs without NaN or Infinity', () => {
    const txs: Transaction[] = [
      makeTx({ id: 'c-inc', type: 'income', amount: 5000, baseAmount: 5000, date: '2026-11-02' }),
    ];
    const kpis = computePeriodKPIs(txs, currentRange, prevRange);
    expect(kpis.incomeDeltaPct).toBe(100);
    expect(kpis.expenseDeltaPct).toBe(0);
    expect(kpis.netDeltaPct).toBe(100);
  });

  it('builds income/expense and cumulative cash flow series excluding transfers', () => {
    const weekRange = getPeriodRange('weekly', '2026-11-04', 1); // 2026-11-02 (Pzt) .. 2026-11-08 (Paz)
    const txs: Transaction[] = [
      makeTx({ id: 's1', type: 'income', amount: 1000, baseAmount: 1000, date: '2026-11-02' }),
      makeTx({ id: 's2', type: 'expense', amount: 300, baseAmount: 300, date: '2026-11-03' }),
      makeTx({ id: 's3', type: 'transfer', amount: 900, baseAmount: 900, date: '2026-11-03', toAccountId: 'acc-2' }),
      makeTx({ id: 's4', type: 'expense', amount: 200, baseAmount: 200, date: '2026-11-05' }),
    ];

    const series = computeIncomeExpenseSeries(txs, 'weekly', weekRange);
    expect(series).toHaveLength(7);
    expect(series[0]).toMatchObject({ key: '2026-11-02', label: 'Pzt', income: 1000, expense: 0, net: 1000 });
    expect(series[1]).toMatchObject({ key: '2026-11-03', label: 'Sal', income: 0, expense: 300, net: -300 });

    const cumulative = computeCumulativeCashFlowSeries(txs, 'weekly', weekRange);
    expect(cumulative).toHaveLength(7);
    expect(cumulative[0].cumulativeNet).toBe(1000);
    expect(cumulative[1].cumulativeNet).toBe(700);
    expect(cumulative[2].cumulativeNet).toBe(700);
    expect(cumulative[3].cumulativeNet).toBe(500);
    expect(cumulative[6].cumulativeNet).toBe(500);
  });
});

describe('category breakdown & movers', () => {
  it('computes sorted category breakdown with sharePct summing to ~100 and excludes transfers', () => {
    const txs: Transaction[] = [
      makeTx({ id: 'b1', type: 'expense', amount: 1000, baseAmount: 1000, date: '2026-11-01', categoryId: 'cat-market' }),
      makeTx({ id: 'b2', type: 'expense', amount: 500, baseAmount: 500, date: '2026-11-02', categoryId: 'cat-market' }),
      makeTx({ id: 'b3', type: 'expense', amount: 500, baseAmount: 500, date: '2026-11-03', categoryId: 'cat-food' }),
      makeTx({ id: 'b4', type: 'transfer', amount: 5000, baseAmount: 5000, date: '2026-11-04', categoryId: 'cat-market' }),
      makeTx({ id: 'b5', type: 'income', amount: 20000, baseAmount: 20000, date: '2026-11-05', categoryId: 'cat-salary' }),
    ];

    const breakdown = computeCategoryBreakdown(txs, CATEGORIES, 'expense');
    expect(breakdown).toHaveLength(2);
    expect(breakdown[0]).toMatchObject({
      categoryId: 'cat-market',
      name: 'Market',
      amount: 1500,
      sharePct: 75,
      count: 2,
    });
    expect(breakdown[1]).toMatchObject({
      categoryId: 'cat-food',
      name: 'Yeme-İçme',
      amount: 500,
      sharePct: 25,
      count: 1,
    });
  });

  it('computes top 3 increased and top 3 decreased expense category movers', () => {
    const prevTx: Transaction[] = [
      makeTx({ id: 'pm', type: 'expense', amount: 1000, baseAmount: 1000, date: '2026-10-01', categoryId: 'cat-market' }),
      makeTx({ id: 'pf', type: 'expense', amount: 500, baseAmount: 500, date: '2026-10-02', categoryId: 'cat-food' }),
      makeTx({ id: 'pr', type: 'expense', amount: 8000, baseAmount: 8000, date: '2026-10-03', categoryId: 'cat-rent' }),
      makeTx({ id: 'pb', type: 'expense', amount: 1200, baseAmount: 1200, date: '2026-10-04', categoryId: 'cat-bills' }),
      makeTx({ id: 'pt', type: 'expense', amount: 900, baseAmount: 900, date: '2026-10-05', categoryId: 'cat-travel' }),
    ];
    const currentTx: Transaction[] = [
      makeTx({ id: 'cm', type: 'expense', amount: 2500, baseAmount: 2500, date: '2026-11-01', categoryId: 'cat-market' }), // +1500
      makeTx({ id: 'cf', type: 'expense', amount: 1100, baseAmount: 1100, date: '2026-11-02', categoryId: 'cat-food' }), // +600
      makeTx({ id: 'cr', type: 'expense', amount: 7000, baseAmount: 7000, date: '2026-11-03', categoryId: 'cat-rent' }), // -1000
      makeTx({ id: 'cb', type: 'expense', amount: 700, baseAmount: 700, date: '2026-11-04', categoryId: 'cat-bills' }), // -500
      makeTx({ id: 'ct', type: 'expense', amount: 600, baseAmount: 600, date: '2026-11-05', categoryId: 'cat-travel' }), // -300
      makeTx({ id: 'ci', type: 'income', amount: 50000, baseAmount: 50000, date: '2026-11-06', categoryId: 'cat-salary' }),
    ];

    const movers = computeCategoryMovers(currentTx, prevTx, CATEGORIES);
    expect(movers.topIncreased.map((m) => [m.categoryId, m.deltaAmount])).toEqual([
      ['cat-market', 1500],
      ['cat-food', 600],
    ]);
    expect(movers.topDecreased.map((m) => [m.categoryId, m.deltaAmount])).toEqual([
      ['cat-rent', -1000],
      ['cat-bills', -500],
      ['cat-travel', -300],
    ]);
  });
});

describe('computeBudgetProgress', () => {
  it('converts multi-currency expenses into budget currency, shifts by monthStartDay, and computes ok/warning/exceeded + general budget', () => {
    // Fiscal month 2026-11 with monthStartDay=15 => 2026-11-15 .. 2026-12-14
    const budgets: Budget[] = [
      makeBudget({ id: 'b-general', categoryId: null, month: '2026-11', limitAmount: 10000, currency: 'TRY' }),
      makeBudget({ id: 'b-market', categoryId: 'cat-market', month: '2026-11', limitAmount: 100, currency: 'USD' }),
      makeBudget({ id: 'b-food', categoryId: 'cat-food', month: '2026-11', limitAmount: 1000, currency: 'TRY' }),
      makeBudget({ id: 'b-old', categoryId: 'cat-rent', month: '2026-10', limitAmount: 5000, currency: 'TRY' }),
      makeBudget({ id: 'b-del', categoryId: 'cat-bills', month: '2026-11', limitAmount: 500, currency: 'TRY', deletedAt: NOW }),
    ];

    const txs: Transaction[] = [
      // Inside fiscal month (2026-11-15 .. 2026-12-14)
      // 3650 TRY -> 100 USD at rate 36.5; plus 20 USD -> 120 USD total for cat-market (exceeded: 120%)
      makeTx({ id: 'x1', type: 'expense', amount: 3650, currency: 'TRY', baseAmount: 3650, date: '2026-11-15', categoryId: 'cat-market' }),
      makeTx({ id: 'x2', type: 'expense', amount: 20, currency: 'USD', exchangeRateToBase: 36.5, baseAmount: 730, date: '2026-12-14', categoryId: 'cat-market' }),
      // 850 TRY in food -> 85% (warning)
      makeTx({ id: 'x3', type: 'expense', amount: 850, currency: 'TRY', baseAmount: 850, date: '2026-11-20', categoryId: 'cat-food' }),
      // Outside fiscal month (Nov 14 belongs to 2026-10 fiscal month when monthStartDay=15)
      makeTx({ id: 'x4', type: 'expense', amount: 5000, currency: 'TRY', baseAmount: 5000, date: '2026-11-14', categoryId: 'cat-food' }),
      // Transfer & income must be ignored
      makeTx({ id: 'x5', type: 'transfer', amount: 9000, currency: 'TRY', baseAmount: 9000, date: '2026-11-25', categoryId: 'cat-market' }),
      makeTx({ id: 'x6', type: 'income', amount: 20000, currency: 'TRY', baseAmount: 20000, date: '2026-11-25', categoryId: 'cat-salary' }),
    ];

    const progress = computeBudgetProgress(budgets, txs, CATEGORIES, '2026-11', 15, DEFAULT_EXCHANGE_RATES);
    expect(progress).toHaveLength(3);

    const general = progress.find((p) => p.budget.id === 'b-general')!;
    expect(general.categoryName).toBe('Genel Aylık Bütçe');
    expect(general.spent).toBe(5230); // 3650 + 730 + 850
    expect(general.pct).toBe(52.3);
    expect(general.status).toBe('ok');

    const market = progress.find((p) => p.budget.id === 'b-market')!;
    expect(market.spent).toBe(120);
    expect(market.pct).toBe(120);
    expect(market.status).toBe('exceeded');

    const food = progress.find((p) => p.budget.id === 'b-food')!;
    expect(food.spent).toBe(850);
    expect(food.pct).toBe(85);
    expect(food.status).toBe('warning');
  });
});

describe('computeEndOfMonthForecast & computeCalendarDailySummary', () => {
  it('computes EOM forecast on day 15 of 30 with 15_000 spent -> 30_000 projectedTotal', () => {
    const monthRange = getFiscalMonthRange('2026-11', 1); // 2026-11-01 .. 2026-11-30 (30 days)
    const txs: Transaction[] = [
      makeTx({ id: 'e1', type: 'expense', amount: 10000, baseAmount: 10000, date: '2026-11-05' }),
      makeTx({ id: 'e2', type: 'expense', amount: 5000, baseAmount: 5000, date: '2026-11-15' }),
      makeTx({ id: 'e3', type: 'expense', amount: 4000, baseAmount: 4000, date: '2026-11-20' }), // after asOfDate
      makeTx({ id: 'e4', type: 'transfer', amount: 8000, baseAmount: 8000, date: '2026-11-10', toAccountId: 'acc-2' }),
    ];

    const forecast = computeEndOfMonthForecast(txs, monthRange, '2026-11-15');
    expect(forecast).toEqual({
      spentSoFar: 15000,
      elapsedDays: 15,
      totalDays: 30,
      projectedTotal: 30000,
    });
  });

  it('computes calendar daily summary for 1..30/31 with intensity quartiles 0..4', () => {
    const txs: Transaction[] = [
      makeTx({ id: 'd1', type: 'income', amount: 10000, baseAmount: 10000, date: '2026-11-01' }),
      makeTx({ id: 'd2', type: 'expense', amount: 200, baseAmount: 200, date: '2026-11-02' }), // 20% -> 1
      makeTx({ id: 'd3', type: 'expense', amount: 450, baseAmount: 450, date: '2026-11-03' }), // 45% -> 2
      makeTx({ id: 'd4', type: 'expense', amount: 700, baseAmount: 700, date: '2026-11-04' }), // 70% -> 3
      makeTx({ id: 'd5', type: 'expense', amount: 1000, baseAmount: 1000, date: '2026-11-05' }), // 100% -> 4
      makeTx({ id: 'd6', type: 'transfer', amount: 5000, baseAmount: 5000, date: '2026-11-06', toAccountId: 'acc-2' }),
    ];

    const summary = computeCalendarDailySummary(txs, 2026, 10); // November (0-indexed 10) -> 30 days
    expect(Object.keys(summary)).toHaveLength(30);
    expect(summary['2026-11-01']).toEqual({ income: 10000, expense: 0, net: 10000, intensity: 0 });
    expect(summary['2026-11-02']).toEqual({ income: 0, expense: 200, net: -200, intensity: 1 });
    expect(summary['2026-11-03']).toEqual({ income: 0, expense: 450, net: -450, intensity: 2 });
    expect(summary['2026-11-04']).toEqual({ income: 0, expense: 700, net: -700, intensity: 3 });
    expect(summary['2026-11-05']).toEqual({ income: 0, expense: 1000, net: -1000, intensity: 4 });
    expect(summary['2026-11-06']).toEqual({ income: 0, expense: 0, net: 0, intensity: 0 });
  });
});

describe('buildSharedReportSnapshot (Review Focus #3 privacy stripping)', () => {
  const range = { startDate: '2026-11-01', endDate: '2026-11-30' };
  const prevRange = { startDate: '2026-10-01', endDate: '2026-10-31' };
  const budgets: Budget[] = [
    makeBudget({ id: 'b1', categoryId: 'cat-market', month: '2026-11', limitAmount: 2000 }),
  ];
  const txs: Transaction[] = [
    makeTx({
      id: 'tx-inc',
      type: 'income',
      amount: 40000,
      baseAmount: 40000,
      date: '2026-11-01',
      categoryId: 'cat-salary',
      note: 'Kasım maaş notu',
      tags: ['maaş', 'özel'],
      receiptUri: 'data:image/png;base64,SECRET_RECEIPT',
    }),
    makeTx({
      id: 'tx-exp',
      type: 'expense',
      amount: 1200,
      baseAmount: 1200,
      date: '2026-11-10',
      categoryId: 'cat-market',
      note: 'Gizli fiş notu',
      tags: ['market'],
      receiptUri: 'file:///private/receipt.jpg',
    }),
    makeTx({
      id: 'tx-tr',
      type: 'transfer',
      amount: 5000,
      baseAmount: 5000,
      date: '2026-11-12',
      toAccountId: 'acc-card',
      note: 'Transfer gizli',
      tags: ['transfer'],
    }),
  ];

  const baseParams = {
    title: 'Kasım 2026 Özeti',
    periodType: 'monthly' as const,
    range,
    prevRange,
    transactions: txs,
    categories: CATEGORIES,
    budgets,
    baseCurrency: 'TRY' as const,
    monthStartDay: 1,
    rates: DEFAULT_EXCHANGE_RATES,
    generatedAt: '2026-11-20T18:00:00.000Z',
  };

  it('returns empty transactions array when includeTransactions is false', () => {
    const snapshot = buildSharedReportSnapshot({
      ...baseParams,
      includeTransactions: false,
      includeNotes: true,
    });

    expect(snapshot.title).toBe('Kasım 2026 Özeti');
    expect(snapshot.kpis.totalIncome).toBe(40000);
    expect(snapshot.kpis.totalExpense).toBe(1200);
    expect(snapshot.transactions).toEqual([]);
    expect(snapshot.budgetProgress).toHaveLength(1);
    expect(snapshot.budgetProgress[0].spent).toBe(1200);
    expect(snapshot.generatedAt).toBe('2026-11-20T18:00:00.000Z');
  });

  it('strips note, tags, and receiptUri when includeTransactions is true and includeNotes is false', () => {
    const snapshot = buildSharedReportSnapshot({
      ...baseParams,
      includeTransactions: true,
      includeNotes: false,
    });

    expect(snapshot.transactions).toHaveLength(2);
    for (const item of snapshot.transactions) {
      expect(item.note).toBeUndefined();
      expect(item.tags).toBeUndefined();
      expect('note' in item).toBe(false);
      expect('tags' in item).toBe(false);
      expect('receiptUri' in item).toBe(false);
    }
    expect(snapshot.transactions.map((t) => t.id)).toEqual(['tx-inc', 'tx-exp']);
  });

  it('includes note and tags when includeNotes is true, but NEVER leaks receiptUri', () => {
    const snapshot = buildSharedReportSnapshot({
      ...baseParams,
      includeTransactions: true,
      includeNotes: true,
    });

    expect(snapshot.transactions).toHaveLength(2);
    expect(snapshot.transactions[0]).toMatchObject({
      id: 'tx-inc',
      type: 'income',
      categoryName: 'Maaş',
      baseAmount: 40000,
      currency: 'TRY',
      note: 'Kasım maaş notu',
      tags: ['maaş', 'özel'],
    });
    for (const item of snapshot.transactions) {
      expect('receiptUri' in item).toBe(false);
    }
    expect(JSON.stringify(snapshot)).not.toContain('receiptUri');
    expect(JSON.stringify(snapshot)).not.toContain('SECRET_RECEIPT');
  });
});
