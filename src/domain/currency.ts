import { roundMoney } from './money';
import type { CurrencyCode, ExchangeRate } from './types';

export const DEFAULT_EXCHANGE_RATES: Record<CurrencyCode, number> = {
  TRY: 1,
  USD: 36.5,
  EUR: 39.5,
  GBP: 46.0,
  XAU: 3350,
};

function resolveRateToTry(
  currency: CurrencyCode,
  rates: Record<CurrencyCode, number>,
): number {
  if (currency === 'TRY') {
    return 1;
  }
  const candidate = rates[currency];
  if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
    return candidate;
  }
  return DEFAULT_EXCHANGE_RATES[currency];
}

/** Converts an `ExchangeRate[]` list into a full `CurrencyCode -> rateToTry` map. */
export function ratesListToMap(rates: ExchangeRate[]): Record<CurrencyCode, number> {
  const map: Record<CurrencyCode, number> = { ...DEFAULT_EXCHANGE_RATES };
  for (const item of rates) {
    if (
      item.currencyCode !== 'TRY' &&
      Number.isFinite(item.rateToTry) &&
      item.rateToTry > 0
    ) {
      map[item.currencyCode] = item.rateToTry;
    }
  }
  map.TRY = 1;
  return map;
}

/** Computes the multiplier to convert 1 unit of `from` into `base` currency. */
export function getRateToBase(
  from: CurrencyCode,
  base: CurrencyCode,
  rates: Record<CurrencyCode, number>,
): number {
  if (from === base) {
    return 1;
  }
  const fromTry = resolveRateToTry(from, rates);
  const baseTry = resolveRateToTry(base, rates);
  return fromTry / baseTry;
}

/** Converts `amount` from `from` currency to `to` currency, rounded to 2 decimal places. */
export function convertAmount(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rates: Record<CurrencyCode, number>,
): number {
  if (from === to) {
    return roundMoney(amount);
  }
  return roundMoney(amount * getRateToBase(from, to, rates));
}
