import { describe, expect, it } from 'vitest';
import {
  addMoney,
  formatMoney,
  formatPercent,
  fromKurus,
  getCurrencySymbol,
  roundMoney,
  splitInstallmentAmounts,
  subMoney,
  toKurus,
} from '@/domain/money';
import {
  addDays,
  addMonthsClamped,
  daysInMonth,
  getBucketsForPeriod,
  getFiscalMonthKey,
  getFiscalMonthRange,
  getLocalTodayIso,
  getPeriodRange,
  getPreviousPeriodRange,
  parseIsoDate,
  shiftPeriodAnchor,
  toIsoDate,
} from '@/domain/periods';
import {
  convertAmount,
  DEFAULT_EXCHANGE_RATES,
  getRateToBase,
  ratesListToMap,
} from '@/domain/currency';
import {
  buildDemoDataset,
  createDefaultCategories,
  createDefaultExchangeRates,
  DEFAULT_SETTINGS,
} from '@/domain/defaults';

describe('money arithmetic & formatting', () => {
  it('avoids floating point drift with integer kurus helpers', () => {
    expect(toKurus(0.1)).toBe(10);
    expect(toKurus(19.99)).toBe(1999);
    expect(fromKurus(1999)).toBe(19.99);
    expect(roundMoney(1.005)).toBe(1.01);
    expect(addMoney(0.1, 0.2)).toBe(0.3);
    expect(subMoney(1.0, 0.9)).toBe(0.1);
  });

  it('splits installment amounts with remainder kurus on the first installment', () => {
    const parts3 = splitInstallmentAmounts(100, 3);
    expect(parts3).toEqual([33.34, 33.33, 33.33]);
    expect(parts3.reduce((acc, val) => addMoney(acc, val), 0)).toBe(100);

    const parts7 = splitInstallmentAmounts(100, 7);
    expect(parts7).toEqual([14.32, 14.28, 14.28, 14.28, 14.28, 14.28, 14.28]);
    expect(parts7.reduce((acc, val) => addMoney(acc, val), 0)).toBe(100);
  });

  it('returns currency symbols and formats tr-TR money with privacy masking', () => {
    expect(getCurrencySymbol('TRY')).toBe('₺');
    expect(getCurrencySymbol('USD')).toBe('$');
    expect(getCurrencySymbol('EUR')).toBe('€');
    expect(getCurrencySymbol('GBP')).toBe('£');
    expect(getCurrencySymbol('XAU')).toBe('gr Altın');

    const formatted = formatMoney(1250.5, 'TRY');
    expect(formatted).toContain('1.250,50');
    expect(formatted).toContain('₺');

    expect(formatMoney(1250.5, 'TRY', true)).toBe('•••• ₺');
    expect(formatMoney(50, 'XAU', true)).toBe('•••• gr Altın');
    expect(formatPercent(24.56)).toBe('%24,6');
    expect(formatPercent(-12.5)).toBe('-%12,5');
  });
});

describe('timezone-safe dates & fiscal periods', () => {
  it('parses, formats, and computes daysInMonth in UTC', () => {
    expect(toIsoDate(2026, 2, 5)).toBe('2026-02-05');
    expect(getLocalTodayIso(new Date(2026, 10, 20, 0, 15, 0))).toBe('2026-11-20');
    expect(parseIsoDate('2026-11-20')).toEqual({ year: 2026, month: 11, day: 20 });
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('clamps month-end dates without overflowing into the next month', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsClamped('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('computes fiscal month keys and ranges based on monthStartDay', () => {
    expect(getFiscalMonthRange('2026-11', 15)).toEqual({
      startDate: '2026-11-15',
      endDate: '2026-12-14',
    });
    expect(getFiscalMonthRange('2026-11', 1)).toEqual({
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    });
    expect(getFiscalMonthKey('2026-11-14', 15)).toBe('2026-10');
    expect(getFiscalMonthKey('2026-11-15', 15)).toBe('2026-11');
    expect(getFiscalMonthKey('2026-01-05', 15)).toBe('2025-12');
  });

  it('computes daily, weekly, monthly, yearly, and previous period ranges', () => {
    expect(getPeriodRange('daily', '2026-11-20', 15)).toEqual({
      startDate: '2026-11-20',
      endDate: '2026-11-20',
    });
    // 2026-11-20 is Friday -> ISO week Mon 2026-11-16 .. Sun 2026-11-22
    expect(getPeriodRange('weekly', '2026-11-20', 15)).toEqual({
      startDate: '2026-11-16',
      endDate: '2026-11-22',
    });
    expect(getPeriodRange('monthly', '2026-11-14', 15)).toEqual({
      startDate: '2026-10-15',
      endDate: '2026-11-14',
    });
    // Yearly strictly ignores monthStartDay
    expect(getPeriodRange('yearly', '2026-11-20', 15)).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });

    expect(
      getPreviousPeriodRange('monthly', { startDate: '2026-11-15', endDate: '2026-12-14' }, 15),
    ).toEqual({
      startDate: '2026-10-15',
      endDate: '2026-11-14',
    });
    expect(
      getPreviousPeriodRange('yearly', { startDate: '2026-01-01', endDate: '2026-12-31' }, 15),
    ).toEqual({
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    });
    expect(
      getPreviousPeriodRange('daily', { startDate: '2026-11-20', endDate: '2026-11-20' }, 15),
    ).toEqual({
      startDate: '2026-11-19',
      endDate: '2026-11-19',
    });
    expect(
      getPreviousPeriodRange('weekly', { startDate: '2026-11-16', endDate: '2026-11-22' }, 15),
    ).toEqual({
      startDate: '2026-11-09',
      endDate: '2026-11-15',
    });
    expect(
      getPreviousPeriodRange('custom', { startDate: '2026-11-10', endDate: '2026-11-16' }, 1),
    ).toEqual({
      startDate: '2026-11-03',
      endDate: '2026-11-09',
    });
    expect(shiftPeriodAnchor('monthly', '2026-01-31', 1)).toBe('2026-02-28');
    expect(shiftPeriodAnchor('yearly', '2026-11-20', -1)).toBe('2025-11-20');
  });

  it('generates contiguous buckets for weekly, monthly, and yearly periods', () => {
    const weeklyBuckets = getBucketsForPeriod('weekly', {
      startDate: '2026-11-16',
      endDate: '2026-11-22',
    });
    expect(weeklyBuckets).toHaveLength(7);
    expect(weeklyBuckets[0].startDate).toBe('2026-11-16');
    expect(weeklyBuckets[6].endDate).toBe('2026-11-22');

    const yearlyBuckets = getBucketsForPeriod('yearly', {
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    expect(yearlyBuckets).toHaveLength(12);
    expect(yearlyBuckets[0].key).toBe('2026-01');
    expect(yearlyBuckets[11].key).toBe('2026-12');
  });
});

describe('currency conversion', () => {
  const rates = { TRY: 1, USD: 40, EUR: 44, GBP: 50, XAU: 3500 };

  it('converts amounts via TRY base using cross rates rounded to 2 decimals', () => {
    expect(DEFAULT_EXCHANGE_RATES.TRY).toBe(1);
    expect(getRateToBase('USD', 'USD', rates)).toBe(1);
    expect(convertAmount(100, 'USD', 'EUR', rates)).toBe(90.91);
    expect(convertAmount(2, 'XAU', 'TRY', rates)).toBe(7000);
  });

  it('builds a rate map from ExchangeRate[] keeping TRY=1', () => {
    const map = ratesListToMap([
      { currencyCode: 'USD', rateToTry: 41.5, source: 'manual', updatedAt: '2026-11-20T00:00:00Z' },
    ]);
    expect(map.TRY).toBe(1);
    expect(map.USD).toBe(41.5);
    expect(map.EUR).toBe(DEFAULT_EXCHANGE_RATES.EUR);
  });
});

describe('defaults & demo dataset', () => {
  it('creates exact 7 income + 13 expense Turkish default categories', () => {
    const categories = createDefaultCategories();
    const income = categories.filter((c) => c.type === 'income');
    const expense = categories.filter((c) => c.type === 'expense');

    expect(income).toHaveLength(7);
    expect(expense).toHaveLength(13);
    expect(income.map((c) => c.name)).toEqual([
      'Maaş',
      'Freelance / Ek İş',
      'Yatırım / Faiz',
      'Kira Geliri',
      'Alacak Tahsilatı',
      'Hediye / İade',
      'Diğer Gelir',
    ]);
    expect(expense.map((c) => c.name)).toEqual([
      'Market',
      'Yeme-İçme',
      'Ulaşım / Yakıt',
      'Faturalar',
      'Kira / Konut',
      'Sağlık',
      'Giyim',
      'Eğlence / Hobi',
      'Abonelikler',
      'Eğitim',
      'Kişisel Bakım',
      'Borç Ödeme',
      'Diğer Gider',
    ]);
    expect(categories.every((c) => c.isDefault && c.deletedAt === null)).toBe(true);
    expect(DEFAULT_SETTINGS.baseCurrency).toBe('TRY');
    expect(DEFAULT_SETTINGS.monthStartDay).toBe(1);
    expect(createDefaultExchangeRates().find((r) => r.currencyCode === 'TRY')?.rateToTry).toBe(1);
  });

  it('builds a complete demo dataset with every entity marked isDemo: true', () => {
    const demo = buildDemoDataset('2026-11-20');

    expect(demo.accounts.length).toBeGreaterThanOrEqual(4);
    expect(demo.categories.length).toBe(20);
    expect(demo.transactions.length).toBeGreaterThan(5);
    expect(demo.installmentPlans.length).toBeGreaterThanOrEqual(1);
    expect(demo.recurringRules.length).toBeGreaterThanOrEqual(1);
    expect(demo.budgets.length).toBeGreaterThanOrEqual(2);
    expect(demo.savingsGoals.length).toBeGreaterThanOrEqual(2);
    expect(demo.debts.length).toBeGreaterThanOrEqual(2);

    const allEntities = [
      ...demo.accounts,
      ...demo.categories,
      ...demo.transactions,
      ...demo.installmentPlans,
      ...demo.recurringRules,
      ...demo.budgets,
      ...demo.savingsGoals,
      ...demo.debts,
    ];
    expect(allEntities.every((entity) => entity.isDemo === true)).toBe(true);
  });
});
