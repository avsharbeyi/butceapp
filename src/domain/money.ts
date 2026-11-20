import type { CurrencyCode } from './types';

const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  TRY: '₺',
  USD: '$',
  EUR: '€',
  GBP: '£',
  XAU: 'gr Altın',
};

const TR_NUMBER_FORMATTER = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const TR_PERCENT_FORMATTER = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Converts a decimal currency amount to integer kuruş (1/100 unit) safely. */
export function toKurus(amount: number): number {
  if (!Number.isFinite(amount)) {
    return 0;
  }
  const sign = amount < 0 ? -1 : 1;
  // Adding a tiny epsilon before rounding corrects IEEE-754 representations like 1.005 * 100 = 100.49999999999999
  const kurus = sign * Math.round(Math.abs(amount) * 100 + 1e-9);
  return kurus === 0 ? 0 : kurus;
}

/** Converts integer kuruş back to a 2-decimal currency amount. */
export function fromKurus(kurus: number): number {
  if (!Number.isFinite(kurus)) {
    return 0;
  }
  const value = Math.round(kurus) / 100;
  return value === 0 ? 0 : value;
}

/** Rounds a currency amount to 2 decimal places via integer kuruş arithmetic. */
export function roundMoney(amount: number): number {
  return fromKurus(toKurus(amount));
}

/** Adds two currency amounts without floating-point drift. */
export function addMoney(a: number, b: number): number {
  return fromKurus(toKurus(a) + toKurus(b));
}

/** Subtracts currency amount b from a without floating-point drift. */
export function subMoney(a: number, b: number): number {
  return fromKurus(toKurus(a) - toKurus(b));
}

/**
 * Splits a total amount into `count` installments in kuruş precision.
 * Any indivisible remainder kuruş is added to the FIRST installment so the exact sum equals `totalAmount`.
 */
export function splitInstallmentAmounts(totalAmount: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('Taksit sayısı en az 1 tam sayı olmalıdır.');
  }

  const totalKurus = toKurus(totalAmount);
  const baseKurus = Math.trunc(totalKurus / count);
  const remainderKurus = totalKurus - baseKurus * count;

  const installments: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const kurus = i === 0 ? baseKurus + remainderKurus : baseKurus;
    installments.push(fromKurus(kurus));
  }
  return installments;
}

export function getCurrencySymbol(currency: CurrencyCode): string {
  return CURRENCY_SYMBOLS[currency];
}

/** Formats a currency amount in `tr-TR` locale, or returns a masked string in privacy mode. */
export function formatMoney(
  amount: number,
  currency: CurrencyCode,
  privacyMode = false,
): string {
  const symbol = getCurrencySymbol(currency);
  if (privacyMode) {
    return `•••• ${symbol}`;
  }

  const safe = roundMoney(amount);
  const normalized = Object.is(safe, -0) ? 0 : safe;
  return `${TR_NUMBER_FORMATTER.format(normalized)} ${symbol}`;
}

/** Formats a percentage value (e.g. 24.56 -> "%24,6") using Turkish locale formatting. */
export function formatPercent(pct: number): string {
  const safe = Number.isFinite(pct) ? pct : 0;
  const absFormatted = TR_PERCENT_FORMATTER.format(Math.abs(safe));
  return safe < 0 ? `-%${absFormatted}` : `%${absFormatted}`;
}
