import { convertAmount, getRateToBase } from './currency';
import { addMoney, fromKurus, roundMoney, splitInstallmentAmounts, subMoney, toKurus } from './money';
import { addMonthsClamped, daysInMonth, parseIsoDate, toIsoDate } from './periods';
import type {
  Account,
  CurrencyCode,
  Debt,
  InstallmentPlan,
  SavingsGoal,
  Transaction,
} from './types';

export interface CreditCardSummary {
  totalDebt: number;
  availableLimit: number;
  statementDue: number;
  maturedDebt: number;
  statementStart: string;
  statementEnd: string;
  nextDueDate: string;
}

export interface NetWorthSummary {
  netWorth: number;
  totalAssets: number;
  totalGoals: number;
  totalCardDebt: number;
  owedToMe: number;
  owedByMe: number;
  netDebtPosition: number;
}

/** Generates a UUID v4 identifier using Web Crypto when available, with a Math.random fallback. */
export function generateEntityId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const rand = Math.floor(Math.random() * 16);
    const val = ch === 'x' ? rand : (rand & 0x3) | 0x8;
    return val.toString(16);
  });
}

function clampDayOfMonth(day: number | null | undefined, fallback: number): number {
  if (day == null || !Number.isFinite(day)) {
    return fallback;
  }
  return Math.max(1, Math.min(31, Math.trunc(day)));
}

function dateInMonthClamped(year: number, month1To12: number, day: number): string {
  return toIsoDate(year, month1To12, Math.min(day, daysInMonth(year, month1To12)));
}

function resolveCreditCardCycle(
  statementDay: number,
  dueDay: number,
  asOfDate: string,
): { statementStart: string; statementEnd: string; nextDueDate: string } {
  const { year, month } = parseIsoDate(asOfDate);
  const currentClose = dateInMonthClamped(year, month, statementDay);

  const endMonthAnchor =
    currentClose <= asOfDate
      ? { year, month }
      : parseIsoDate(addMonthsClamped(toIsoDate(year, month, 1), -1));

  const startMonthAnchor = parseIsoDate(
    addMonthsClamped(toIsoDate(endMonthAnchor.year, endMonthAnchor.month, 1), -1),
  );

  const statementEnd = dateInMonthClamped(endMonthAnchor.year, endMonthAnchor.month, statementDay);
  const statementStart = dateInMonthClamped(
    startMonthAnchor.year,
    startMonthAnchor.month,
    statementDay,
  );

  const sameMonthDue = dateInMonthClamped(endMonthAnchor.year, endMonthAnchor.month, dueDay);
  let nextDueDate = sameMonthDue;
  if (sameMonthDue <= statementEnd) {
    const nextMonthAnchor = parseIsoDate(
      addMonthsClamped(toIsoDate(endMonthAnchor.year, endMonthAnchor.month, 1), 1),
    );
    nextDueDate = dateInMonthClamped(nextMonthAnchor.year, nextMonthAnchor.month, dueDay);
  }

  return { statementStart, statementEnd, nextDueDate };
}

/**
 * Computes credit card debt metrics (`totalDebt` including unmatured installments,
 * `maturedDebt`, `availableLimit`, `statementDue`, and statement cycle dates) as of `asOfDate`.
 */
export function computeCreditCardSummary(
  account: Account,
  transactions: Transaction[],
  asOfDate: string,
): CreditCardSummary {
  const statementDay = clampDayOfMonth(account.statementDay, 1);
  const dueDay = clampDayOfMonth(account.dueDay, 10);
  const { statementStart, statementEnd, nextDueDate } = resolveCreditCardCycle(
    statementDay,
    dueDay,
    asOfDate,
  );

  const initialKurus = toKurus(account.initialBalance);
  let totalDeltaKurus = 0;
  let maturedDeltaKurus = 0;
  let statementChargesKurus = 0;
  let paymentsUpToAsOfKurus = 0;

  for (const tx of transactions) {
    if (tx.deletedAt !== null) {
      continue;
    }

    const isCharge =
      (tx.type === 'expense' || tx.type === 'transfer') && tx.accountId === account.id;
    if (isCharge) {
      const amtKurus = toKurus(tx.amount);
      totalDeltaKurus += amtKurus;
      if (tx.date <= asOfDate) {
        maturedDeltaKurus += amtKurus;
      }
      if (tx.date <= statementEnd) {
        statementChargesKurus += amtKurus;
      }
    }

    let creditKurus = 0;
    if (tx.type === 'transfer' && tx.toAccountId === account.id) {
      creditKurus = toKurus(tx.toAmount ?? tx.amount);
    } else if (tx.type === 'income' && tx.accountId === account.id) {
      creditKurus = toKurus(tx.amount);
    }

    if (creditKurus !== 0) {
      totalDeltaKurus -= creditKurus;
      if (tx.date <= asOfDate) {
        maturedDeltaKurus -= creditKurus;
        paymentsUpToAsOfKurus += creditKurus;
      }
    }
  }

  const totalDebt = fromKurus(Math.max(0, initialKurus + totalDeltaKurus));
  const maturedDebt = fromKurus(Math.max(0, initialKurus + maturedDeltaKurus));
  const statementDue = fromKurus(
    Math.max(0, initialKurus + statementChargesKurus - paymentsUpToAsOfKurus),
  );
  const availableLimit = fromKurus(
    Math.max(0, toKurus(account.creditLimit ?? 0) - toKurus(totalDebt)),
  );

  return {
    totalDebt,
    availableLimit,
    statementDue,
    maturedDebt,
    statementStart,
    statementEnd,
    nextDueDate,
  };
}

/**
 * Computes the signed account balance as of `asOfDate`.
 * For `credit_card` accounts, returns `-totalDebt` (including unmatured future installments)
 * so summing accounts aligns with the 2A Net Worth definition.
 */
export function computeAccountBalance(
  account: Account,
  transactions: Transaction[],
  asOfDate: string,
): number {
  if (account.type === 'credit_card') {
    const { totalDebt } = computeCreditCardSummary(account, transactions, asOfDate);
    return totalDebt === 0 ? 0 : -totalDebt;
  }

  let kurus = toKurus(account.initialBalance);

  for (const tx of transactions) {
    if (tx.deletedAt !== null || tx.date > asOfDate) {
      continue;
    }

    if (tx.type === 'income' && tx.accountId === account.id) {
      kurus += toKurus(tx.amount);
    } else if (tx.type === 'expense' && tx.accountId === account.id) {
      kurus -= toKurus(tx.amount);
    } else if (tx.type === 'transfer') {
      if (tx.accountId === account.id) {
        kurus -= toKurus(tx.amount);
      }
      if (tx.toAccountId === account.id) {
        kurus += toKurus(tx.toAmount ?? tx.amount);
      }
    }
  }

  return fromKurus(kurus);
}

/**
 * Computes mark-to-market 2A Net Worth (`totalAssets + totalGoals - totalCardDebt`)
 * plus separate personal debt totals (`owedToMe`, `owedByMe`, `netDebtPosition`).
 */
export function computeNetWorth(params: {
  accounts: Account[];
  goals: SavingsGoal[];
  debts: Debt[];
  transactions: Transaction[];
  rates: Record<CurrencyCode, number>;
  baseCurrency: CurrencyCode;
  asOfDate: string;
}): NetWorthSummary {
  const { accounts, goals, debts, transactions, rates, baseCurrency, asOfDate } = params;

  let totalAssets = 0;
  let totalCardDebt = 0;

  for (const acc of accounts) {
    if (acc.deletedAt !== null) {
      continue;
    }

    if (acc.type === 'credit_card') {
      const { totalDebt } = computeCreditCardSummary(acc, transactions, asOfDate);
      const convertedDebt = convertAmount(totalDebt, acc.currency, baseCurrency, rates);
      totalCardDebt = addMoney(totalCardDebt, convertedDebt);
    } else {
      const balance = computeAccountBalance(acc, transactions, asOfDate);
      const convertedBalance = convertAmount(balance, acc.currency, baseCurrency, rates);
      totalAssets = addMoney(totalAssets, convertedBalance);
    }
  }

  let totalGoals = 0;
  for (const goal of goals) {
    if (goal.deletedAt !== null) {
      continue;
    }
    const convertedGoal = convertAmount(goal.currentAmount, goal.currency, baseCurrency, rates);
    totalGoals = addMoney(totalGoals, convertedGoal);
  }

  const netWorth = subMoney(addMoney(totalAssets, totalGoals), totalCardDebt);

  let owedToMe = 0;
  let owedByMe = 0;
  for (const debt of debts) {
    if (debt.deletedAt !== null || debt.isSettled) {
      continue;
    }
    const remaining = Math.max(0, subMoney(debt.totalAmount, debt.paidAmount));
    const convertedRemaining = convertAmount(remaining, debt.currency, baseCurrency, rates);
    if (debt.direction === 'owed_to_me') {
      owedToMe = addMoney(owedToMe, convertedRemaining);
    } else {
      owedByMe = addMoney(owedByMe, convertedRemaining);
    }
  }

  const netDebtPosition = subMoney(owedToMe, owedByMe);

  return {
    netWorth,
    totalAssets,
    totalGoals,
    totalCardDebt,
    owedToMe,
    owedByMe,
    netDebtPosition,
  };
}

/**
 * Generates individual monthly installment transactions for an `InstallmentPlan`,
 * clamping month-end dates and placing indivisible remainder kuruş on the first installment.
 */
export function buildInstallmentTransactions(
  plan: InstallmentPlan,
  rates: Record<CurrencyCode, number>,
  baseCurrency: CurrencyCode,
  userId?: string | null,
): Transaction[] {
  const amounts = splitInstallmentAmounts(plan.totalAmount, plan.installmentCount);
  const exchangeRateToBase = getRateToBase(plan.currency, baseCurrency, rates);
  const resolvedUserId = userId !== undefined ? userId : plan.userId;

  return amounts.map((amount, index) => {
    const number = index + 1;
    const label = `${plan.title} (${number}/${plan.installmentCount})`;
    const note = plan.note ? `${label} — ${plan.note}` : label;

    return {
      id: generateEntityId(),
      userId: resolvedUserId,
      type: 'expense',
      amount,
      currency: plan.currency,
      exchangeRateToBase,
      baseAmount: convertAmount(amount, plan.currency, baseCurrency, rates),
      accountId: plan.accountId,
      toAccountId: null,
      toAmount: null,
      categoryId: plan.categoryId,
      date: addMonthsClamped(plan.startDate, index),
      note,
      tags: ['taksit'],
      installmentPlanId: plan.id,
      installmentNumber: number,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      deletedAt: null,
      isDemo: plan.isDemo,
    };
  });
}

/**
 * Deterministically recomputes a savings goal's `currentAmount` from active linked transfers.
 * Deposits (`!toAccountId`) add `amount`; withdrawals (`!!toAccountId`) subtract `amount`.
 */
export function recomputeGoalAmount(
  goal: SavingsGoal,
  transactions: Transaction[],
  baseManualOffset = 0,
): number {
  let deltaKurus = 0;

  for (const tx of transactions) {
    if (tx.deletedAt !== null || tx.type !== 'transfer' || tx.goalId !== goal.id) {
      continue;
    }
    if (!tx.toAccountId) {
      deltaKurus += toKurus(tx.amount);
    } else {
      deltaKurus -= toKurus(tx.amount);
    }
  }

  return Math.max(0, roundMoney(fromKurus(toKurus(baseManualOffset) + deltaKurus)));
}

/**
 * Deterministically recomputes a debt's `paidAmount` from active linked transactions,
 * clamped to `[0, debt.totalAmount]`.
 */
export function recomputeDebtPaidAmount(
  debt: Debt,
  transactions: Transaction[],
  baseManualOffset = 0,
): number {
  let paidKurus = toKurus(baseManualOffset);

  for (const tx of transactions) {
    if (tx.deletedAt !== null || tx.debtId !== debt.id) {
      continue;
    }
    paidKurus += toKurus(tx.amount);
  }

  const maxKurus = Math.max(0, toKurus(debt.totalAmount));
  return fromKurus(Math.min(maxKurus, Math.max(0, paidKurus)));
}
