import { convertAmount } from './currency';
import { addMoney, roundMoney, subMoney } from './money';
import {
  daysInMonth,
  getBucketsForPeriod,
  getFiscalMonthKey,
  getFiscalMonthRange,
  parseIsoDate,
  toIsoDate,
} from './periods';
import type {
  Budget,
  BudgetProgressItem,
  Category,
  CategoryBreakdownItem,
  CategoryMover,
  CurrencyCode,
  DateRange,
  PeriodKPIs,
  PeriodType,
  ReportSnapshot,
  SharedReportTransaction,
  Transaction,
  TransactionType,
} from './types';

const MS_PER_DAY = 86_400_000;
const GENERAL_BUDGET_NAME = 'Genel Aylık Bütçe';
const GENERAL_BUDGET_COLOR = '#6366F1';
const FALLBACK_CATEGORY = {
  id: 'uncategorized',
  name: 'Kategorisiz',
  color: '#94A3B8',
  icon: 'tag',
} as const;

export interface TransactionFilters {
  accountId?: string;
  categoryId?: string;
  search?: string;
  tag?: string;
  type?: TransactionType;
  minAmount?: number;
  maxAmount?: number;
}

function diffDaysInclusive(startDate: string, endDate: string): number {
  if (endDate < startDate) {
    return 0;
  }
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  const startMs = Date.UTC(start.year, start.month - 1, start.day);
  const endMs = Date.UTC(end.year, end.month - 1, end.day);
  return Math.max(1, Math.round((endMs - startMs) / MS_PER_DAY) + 1);
}

function isActiveCashFlowTx(tx: Transaction): boolean {
  return tx.deletedAt === null && (tx.type === 'income' || tx.type === 'expense');
}

function sumIncomeExpenseInRange(
  transactions: Transaction[],
  range: DateRange,
): { totalIncome: number; totalExpense: number } {
  let totalIncome = 0;
  let totalExpense = 0;

  for (const tx of transactions) {
    if (!isActiveCashFlowTx(tx) || tx.date < range.startDate || tx.date > range.endDate) {
      continue;
    }
    if (tx.type === 'income') {
      totalIncome = addMoney(totalIncome, tx.baseAmount);
    } else {
      totalExpense = addMoney(totalExpense, tx.baseAmount);
    }
  }

  return { totalIncome, totalExpense };
}

function computeDeltaPct(current: number, previous: number): number {
  if (previous === 0) {
    if (current === 0) {
      return 0;
    }
    return current > 0 ? 100 : -100;
  }
  return roundMoney(((current - previous) / Math.abs(previous)) * 100);
}

function buildCategoryLookup(categories: Category[]): Map<string, Category> {
  const map = new Map<string, Category>();
  for (const cat of categories) {
    map.set(cat.id, cat);
  }
  return map;
}

function resolveCategoryMeta(
  categoryId: string | null | undefined,
  categoryMap: Map<string, Category>,
): { categoryId: string; name: string; color: string; icon: string } {
  const cat = categoryId ? categoryMap.get(categoryId) : undefined;
  if (cat) {
    return {
      categoryId: cat.id,
      name: cat.name,
      color: cat.color,
      icon: cat.icon,
    };
  }
  return {
    categoryId: categoryId ?? FALLBACK_CATEGORY.id,
    name: FALLBACK_CATEGORY.name,
    color: FALLBACK_CATEGORY.color,
    icon: FALLBACK_CATEGORY.icon,
  };
}

/** Filters active transactions within `range` and optional report filter predicates. */
export function filterReportTransactions(
  transactions: Transaction[],
  range: DateRange,
  filters?: TransactionFilters,
): Transaction[] {
  const searchQuery = filters?.search?.trim().toLowerCase() ?? '';
  const tagFilter = filters?.tag?.trim().toLowerCase() ?? '';

  return transactions.filter((tx) => {
    if (tx.deletedAt !== null) {
      return false;
    }
    if (tx.date < range.startDate || tx.date > range.endDate) {
      return false;
    }
    if (filters?.accountId && tx.accountId !== filters.accountId && tx.toAccountId !== filters.accountId) {
      return false;
    }
    if (filters?.categoryId && tx.categoryId !== filters.categoryId) {
      return false;
    }
    if (filters?.type && tx.type !== filters.type) {
      return false;
    }
    if (filters?.minAmount !== undefined && tx.baseAmount < filters.minAmount) {
      return false;
    }
    if (filters?.maxAmount !== undefined && tx.baseAmount > filters.maxAmount) {
      return false;
    }
    if (tagFilter && !tx.tags.some((t) => t.toLowerCase() === tagFilter)) {
      return false;
    }
    if (searchQuery) {
      const noteMatch = (tx.note ?? '').toLowerCase().includes(searchQuery);
      const tagMatch = tx.tags.some((t) => t.toLowerCase().includes(searchQuery));
      if (!noteMatch && !tagMatch) {
        return false;
      }
    }
    return true;
  });
}

/** Computes period KPIs (totals, net, savings rate, daily average, and previous-period deltas). */
export function computePeriodKPIs(
  transactions: Transaction[],
  range: DateRange,
  prevRange: DateRange,
): PeriodKPIs {
  const current = sumIncomeExpenseInRange(transactions, range);
  const previous = sumIncomeExpenseInRange(transactions, prevRange);

  const netCashFlow = subMoney(current.totalIncome, current.totalExpense);
  const prevNet = subMoney(previous.totalIncome, previous.totalExpense);
  const savingsRate =
    current.totalIncome > 0
      ? roundMoney(((current.totalIncome - current.totalExpense) / current.totalIncome) * 100)
      : 0;

  const days = diffDaysInclusive(range.startDate, range.endDate);
  const dailyAverageExpense = days > 0 ? roundMoney(current.totalExpense / days) : 0;

  return {
    totalIncome: current.totalIncome,
    totalExpense: current.totalExpense,
    netCashFlow,
    savingsRate,
    dailyAverageExpense,
    incomeDeltaPct: computeDeltaPct(current.totalIncome, previous.totalIncome),
    expenseDeltaPct: computeDeltaPct(current.totalExpense, previous.totalExpense),
    netDeltaPct: computeDeltaPct(netCashFlow, prevNet),
  };
}

/** Computes bucketed income, expense, and net cash flow series (excluding transfers). */
export function computeIncomeExpenseSeries(
  transactions: Transaction[],
  periodType: PeriodType,
  range: DateRange,
): Array<{ key: string; label: string; income: number; expense: number; net: number }> {
  const buckets = getBucketsForPeriod(periodType, range);
  const activeTxs = transactions.filter(
    (tx) => isActiveCashFlowTx(tx) && tx.date >= range.startDate && tx.date <= range.endDate,
  );

  return buckets.map((bucket) => {
    let income = 0;
    let expense = 0;
    for (const tx of activeTxs) {
      if (tx.date >= bucket.startDate && tx.date <= bucket.endDate) {
        if (tx.type === 'income') {
          income = addMoney(income, tx.baseAmount);
        } else {
          expense = addMoney(expense, tx.baseAmount);
        }
      }
    }
    return {
      key: bucket.key,
      label: bucket.label,
      income,
      expense,
      net: subMoney(income, expense),
    };
  });
}

/** Computes running cumulative net cash flow across period buckets. */
export function computeCumulativeCashFlowSeries(
  transactions: Transaction[],
  periodType: PeriodType,
  range: DateRange,
): Array<{ key: string; label: string; cumulativeNet: number }> {
  const series = computeIncomeExpenseSeries(transactions, periodType, range);
  let cumulativeNet = 0;

  return series.map((bucket) => {
    cumulativeNet = addMoney(cumulativeNet, bucket.net);
    return {
      key: bucket.key,
      label: bucket.label,
      cumulativeNet,
    };
  });
}

/** Aggregates income or expense transactions by category, sorted descending by amount. */
export function computeCategoryBreakdown(
  transactions: Transaction[],
  categories: Category[],
  type: 'income' | 'expense',
): CategoryBreakdownItem[] {
  const categoryMap = buildCategoryLookup(categories);
  const grouped = new Map<
    string,
    { categoryId: string; name: string; color: string; icon: string; amount: number; count: number }
  >();

  let total = 0;
  for (const tx of transactions) {
    if (tx.deletedAt !== null || tx.type !== type) {
      continue;
    }
    const meta = resolveCategoryMeta(tx.categoryId, categoryMap);
    const existing = grouped.get(meta.categoryId);
    if (existing) {
      existing.amount = addMoney(existing.amount, tx.baseAmount);
      existing.count += 1;
    } else {
      grouped.set(meta.categoryId, {
        ...meta,
        amount: roundMoney(tx.baseAmount),
        count: 1,
      });
    }
    total = addMoney(total, tx.baseAmount);
  }

  return Array.from(grouped.values())
    .sort((a, b) => b.amount - a.amount || b.count - a.count)
    .map((item) => ({
      ...item,
      sharePct: total > 0 ? roundMoney((item.amount / total) * 100) : 0,
    }));
}

function sumExpensesByCategory(transactions: Transaction[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.deletedAt !== null || tx.type !== 'expense') {
      continue;
    }
    const key = tx.categoryId ?? FALLBACK_CATEGORY.id;
    totals.set(key, addMoney(totals.get(key) ?? 0, tx.baseAmount));
  }
  return totals;
}

/** Computes top 3 increased and top 3 decreased expense categories between two transaction sets. */
export function computeCategoryMovers(
  currentTx: Transaction[],
  prevTx: Transaction[],
  categories: Category[],
): { topIncreased: CategoryMover[]; topDecreased: CategoryMover[] } {
  const categoryMap = buildCategoryLookup(categories);
  const currentTotals = sumExpensesByCategory(currentTx);
  const prevTotals = sumExpensesByCategory(prevTx);

  const allIds = new Set([...currentTotals.keys(), ...prevTotals.keys()]);
  const movers: CategoryMover[] = [];

  for (const categoryId of allIds) {
    const currentAmount = currentTotals.get(categoryId) ?? 0;
    const previousAmount = prevTotals.get(categoryId) ?? 0;
    const deltaAmount = subMoney(currentAmount, previousAmount);
    if (deltaAmount === 0) {
      continue;
    }
    const meta = resolveCategoryMeta(categoryId, categoryMap);
    movers.push({
      categoryId: meta.categoryId,
      name: meta.name,
      color: meta.color,
      icon: meta.icon,
      currentAmount,
      previousAmount,
      deltaAmount,
      deltaPct: computeDeltaPct(currentAmount, previousAmount),
    });
  }

  const topIncreased = movers
    .filter((m) => m.deltaAmount > 0)
    .sort((a, b) => b.deltaAmount - a.deltaAmount)
    .slice(0, 3);

  const topDecreased = movers
    .filter((m) => m.deltaAmount < 0)
    .sort((a, b) => a.deltaAmount - b.deltaAmount)
    .slice(0, 3);

  return { topIncreased, topDecreased };
}

/**
 * Evaluates active budgets for `monthKey` using fiscal month range shifted by `monthStartDay`,
 * converting multi-currency expenses into each budget's target currency.
 */
export function computeBudgetProgress(
  budgets: Budget[],
  transactions: Transaction[],
  categories: Category[],
  monthKey: string,
  monthStartDay: number,
  rates: Record<CurrencyCode, number>,
): BudgetProgressItem[] {
  const range = getFiscalMonthRange(monthKey, monthStartDay);
  const categoryMap = buildCategoryLookup(categories);
  const fiscalExpenses = transactions.filter(
    (tx) =>
      tx.deletedAt === null &&
      tx.type === 'expense' &&
      tx.date >= range.startDate &&
      tx.date <= range.endDate,
  );

  return budgets
    .filter((budget) => budget.deletedAt === null && budget.month === monthKey)
    .map((budget) => {
      let spent = 0;
      for (const tx of fiscalExpenses) {
        if (budget.categoryId === null || tx.categoryId === budget.categoryId) {
          const converted = convertAmount(tx.amount, tx.currency, budget.currency, rates);
          spent = addMoney(spent, converted);
        }
      }

      const limit = roundMoney(budget.limitAmount);
      const pct = limit > 0 ? roundMoney((spent / limit) * 100) : 0;
      const status: BudgetProgressItem['status'] =
        pct >= 100 ? 'exceeded' : pct >= 80 ? 'warning' : 'ok';

      const isGeneral = budget.categoryId === null;
      const category = budget.categoryId ? categoryMap.get(budget.categoryId) : undefined;

      return {
        budget,
        categoryName: isGeneral ? GENERAL_BUDGET_NAME : (category?.name ?? FALLBACK_CATEGORY.name),
        categoryColor: isGeneral ? GENERAL_BUDGET_COLOR : (category?.color ?? FALLBACK_CATEGORY.color),
        spent,
        limit,
        pct,
        status,
      };
    });
}

/** Projects end-of-month expenses based on average daily spending through `asOfDate`. */
export function computeEndOfMonthForecast(
  transactions: Transaction[],
  monthRange: DateRange,
  asOfDate: string,
): { spentSoFar: number; elapsedDays: number; totalDays: number; projectedTotal: number } {
  const totalDays = Math.max(1, diffDaysInclusive(monthRange.startDate, monthRange.endDate));
  const effectiveEnd = asOfDate < monthRange.endDate ? asOfDate : monthRange.endDate;

  let spentSoFar = 0;
  if (effectiveEnd >= monthRange.startDate) {
    for (const tx of transactions) {
      if (
        tx.deletedAt === null &&
        tx.type === 'expense' &&
        tx.date >= monthRange.startDate &&
        tx.date <= effectiveEnd
      ) {
        spentSoFar = addMoney(spentSoFar, tx.baseAmount);
      }
    }
  }

  const rawElapsed =
    effectiveEnd < monthRange.startDate ? 1 : diffDaysInclusive(monthRange.startDate, effectiveEnd);
  const elapsedDays = Math.max(1, Math.min(totalDays, rawElapsed));
  const projectedTotal = roundMoney((spentSoFar / elapsedDays) * totalDays);

  return {
    spentSoFar,
    elapsedDays,
    totalDays,
    projectedTotal,
  };
}

/**
 * Computes standard calendar month daily totals (`1..daysInMonth`) and quartile expense intensity (`0..4`).
 * Always uses calendar dates regardless of `monthStartDay` and excludes transfers.
 */
export function computeCalendarDailySummary(
  transactions: Transaction[],
  year: number,
  monthIndex0: number,
): Record<string, { income: number; expense: number; net: number; intensity: 0 | 1 | 2 | 3 | 4 }> {
  const month1To12 = monthIndex0 + 1;
  const totalDays = daysInMonth(year, month1To12);
  const startDate = toIsoDate(year, month1To12, 1);
  const endDate = toIsoDate(year, month1To12, totalDays);

  const dailyTotals = new Map<string, { income: number; expense: number }>();
  for (let day = 1; day <= totalDays; day += 1) {
    dailyTotals.set(toIsoDate(year, month1To12, day), { income: 0, expense: 0 });
  }

  for (const tx of transactions) {
    if (!isActiveCashFlowTx(tx) || tx.date < startDate || tx.date > endDate) {
      continue;
    }
    const entry = dailyTotals.get(tx.date);
    if (!entry) {
      continue;
    }
    if (tx.type === 'income') {
      entry.income = addMoney(entry.income, tx.baseAmount);
    } else {
      entry.expense = addMoney(entry.expense, tx.baseAmount);
    }
  }

  let maxExpense = 0;
  for (const entry of dailyTotals.values()) {
    if (entry.expense > maxExpense) {
      maxExpense = entry.expense;
    }
  }

  const summary: Record<
    string,
    { income: number; expense: number; net: number; intensity: 0 | 1 | 2 | 3 | 4 }
  > = {};

  for (const [dateKey, entry] of dailyTotals.entries()) {
    let intensity: 0 | 1 | 2 | 3 | 4 = 0;
    if (entry.expense > 0 && maxExpense > 0) {
      const ratio = entry.expense / maxExpense;
      if (ratio <= 0.25) {
        intensity = 1;
      } else if (ratio <= 0.5) {
        intensity = 2;
      } else if (ratio <= 0.75) {
        intensity = 3;
      } else {
        intensity = 4;
      }
    }

    summary[dateKey] = {
      income: entry.income,
      expense: entry.expense,
      net: subMoney(entry.income, entry.expense),
      intensity,
    };
  }

  return summary;
}

function toSharedTransaction(
  tx: Transaction,
  categoryMap: Map<string, Category>,
  includeNotes: boolean,
): SharedReportTransaction {
  const meta = resolveCategoryMeta(tx.categoryId, categoryMap);
  const shared: SharedReportTransaction = {
    id: tx.id,
    date: tx.date,
    type: tx.type,
    categoryName: meta.name,
    baseAmount: tx.baseAmount,
    currency: tx.currency,
  };

  if (includeNotes) {
    if (tx.note !== undefined) {
      shared.note = tx.note;
    }
    shared.tags = [...tx.tags];
  }

  return shared;
}

/** Builds a self-contained public report snapshot with strict privacy stripping (Review Focus #3). */
export function buildSharedReportSnapshot(params: {
  title: string;
  periodType: PeriodType;
  range: DateRange;
  prevRange: DateRange;
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  baseCurrency: CurrencyCode;
  monthStartDay: number;
  rates: Record<CurrencyCode, number>;
  includeTransactions: boolean;
  includeNotes: boolean;
  generatedAt?: string;
}): ReportSnapshot {
  const periodCashFlowTxs = filterReportTransactions(params.transactions, params.range).filter(
    isActiveCashFlowTx,
  );
  const categoryMap = buildCategoryLookup(params.categories);
  const budgetMonthKey = getFiscalMonthKey(params.range.endDate, params.monthStartDay);

  const transactions: SharedReportTransaction[] = params.includeTransactions
    ? periodCashFlowTxs.map((tx) => toSharedTransaction(tx, categoryMap, params.includeNotes))
    : [];

  return {
    title: params.title,
    periodType: params.periodType,
    range: params.range,
    baseCurrency: params.baseCurrency,
    includeTransactions: params.includeTransactions,
    includeNotes: params.includeNotes,
    kpis: computePeriodKPIs(params.transactions, params.range, params.prevRange),
    incomeExpenseSeries: computeIncomeExpenseSeries(
      params.transactions,
      params.periodType,
      params.range,
    ),
    cumulativeCashFlowSeries: computeCumulativeCashFlowSeries(
      params.transactions,
      params.periodType,
      params.range,
    ),
    expenseBreakdown: computeCategoryBreakdown(periodCashFlowTxs, params.categories, 'expense'),
    incomeBreakdown: computeCategoryBreakdown(periodCashFlowTxs, params.categories, 'income'),
    budgetProgress: computeBudgetProgress(
      params.budgets,
      params.transactions,
      params.categories,
      budgetMonthKey,
      params.monthStartDay,
      params.rates,
    ),
    transactions,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
  };
}
