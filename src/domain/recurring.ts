import { convertAmount, getRateToBase } from './currency';
import { generateEntityId } from './ledger';
import { roundMoney } from './money';
import { addDays, addMonthsClamped, daysInMonth, parseIsoDate, toIsoDate } from './periods';
import type { CurrencyCode, Frequency, RecurringRule, Transaction } from './types';

const MAX_OCCURRENCES_PER_RULE = 400;

function advanceMonthsWithAnchor(isoDate: string, months: number, anchorDay?: number): string {
  if (anchorDay == null) {
    return addMonthsClamped(isoDate, months);
  }

  const { year, month } = parseIsoDate(isoDate);
  const clampedAnchor = Math.max(1, Math.min(31, Math.trunc(anchorDay)));
  const totalMonths = year * 12 + (month - 1) + Math.trunc(months);
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12 + 1;
  const day = Math.min(clampedAnchor, daysInMonth(targetYear, targetMonth));
  return toIsoDate(targetYear, targetMonth, day);
}

/**
 * Advances a recurring rule date by one frequency interval, preserving `anchorDay`
 * across month-end clamping (e.g. `2026-08-31 -> 2026-09-30 -> 2026-10-31`).
 */
export function advanceRuleDate(
  isoDate: string,
  frequency: Frequency,
  anchorDay?: number,
): string {
  switch (frequency) {
    case 'daily':
      return addDays(isoDate, 1);
    case 'weekly':
      return addDays(isoDate, 7);
    case 'monthly':
      return advanceMonthsWithAnchor(isoDate, 1, anchorDay);
    case 'yearly':
      return advanceMonthsWithAnchor(isoDate, 12, anchorDay);
  }
}

export interface ProcessRecurringResult {
  createdTransactions: Transaction[];
  pendingApprovals: Array<{ rule: RecurringRule; dueDate: string }>;
  updatedRules: RecurringRule[];
}

/**
 * Processes all active recurring rules whose `nextRunDate <= asOfDate`, catching up
 * every missed occurrence up to `asOfDate` (capped at 400 iterations per rule).
 */
export function processDueRecurringRules(
  rules: RecurringRule[],
  asOfDate: string,
  rates: Record<CurrencyCode, number>,
  baseCurrency: CurrencyCode,
  nowIso = new Date().toISOString(),
): ProcessRecurringResult {
  const createdTransactions: Transaction[] = [];
  const pendingApprovals: Array<{ rule: RecurringRule; dueDate: string }> = [];
  const updatedRules: RecurringRule[] = [];

  for (const rule of rules) {
    if (!rule.isActive || rule.deletedAt !== null || rule.nextRunDate > asOfDate) {
      updatedRules.push(rule);
      continue;
    }

    const anchorDay = parseIsoDate(rule.nextRunDate).day;
    let cursorDate = rule.nextRunDate;
    let iterations = 0;

    while (cursorDate <= asOfDate && iterations < MAX_OCCURRENCES_PER_RULE) {
      iterations += 1;

      if (rule.autoCreate) {
        const amount = roundMoney(rule.amount);
        createdTransactions.push({
          id: generateEntityId(),
          userId: rule.userId,
          type: rule.type,
          amount,
          currency: rule.currency,
          exchangeRateToBase: getRateToBase(rule.currency, baseCurrency, rates),
          baseAmount: convertAmount(amount, rule.currency, baseCurrency, rates),
          accountId: rule.accountId,
          toAccountId: null,
          toAmount: null,
          categoryId: rule.categoryId,
          date: cursorDate,
          note: rule.title,
          tags: ['tekrar'],
          recurringRuleId: rule.id,
          createdAt: nowIso,
          updatedAt: nowIso,
          deletedAt: null,
          isDemo: rule.isDemo,
        });
      } else {
        pendingApprovals.push({ rule, dueDate: cursorDate });
      }

      cursorDate = advanceRuleDate(cursorDate, rule.frequency, anchorDay);
    }

    if (rule.autoCreate) {
      updatedRules.push({
        ...rule,
        nextRunDate: cursorDate,
        updatedAt: nowIso,
      });
    } else {
      updatedRules.push(rule);
    }
  }

  return {
    createdTransactions,
    pendingApprovals,
    updatedRules,
  };
}
