import { DEFAULT_EXCHANGE_RATES } from '@/domain/currency';
import type { CurrencyCode, ExchangeRate } from '@/domain/types';

const FX_API_URL = 'https://open.er-api.com/v6/latest/TRY';
const GOLD_API_URL = 'https://api.gold-api.com/price/XAU';
const TROY_OUNCE_IN_GRAMS = 31.1034768;
const FETCH_TIMEOUT_MS = 6_000;
const SUPPORTED_CURRENCIES: readonly CurrencyCode[] = ['TRY', 'USD', 'EUR', 'GBP', 'XAU'];

interface ErApiResponse {
  result?: string;
  rates?: Record<string, number>;
}

interface GoldApiResponse {
  price?: number;
}

function roundRate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

async function fetchJsonWithTimeout<T>(
  url: string,
  fetchImpl: typeof fetch,
): Promise<T | null> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const timer = controller
    ? setTimeout(() => {
        controller.abort();
      }, FETCH_TIMEOUT_MS)
    : undefined;

  try {
    const response = await fetchImpl(
      url,
      controller ? { signal: controller.signal } : undefined,
    );
    if (!response || !response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Fetches live TRY-based FX rates (`USD`, `EUR`, `GBP`) and optional gram gold (`XAU`)
 * while preserving every `source === 'manual'` entry and falling back cleanly on errors.
 */
export async function fetchLiveRates(
  existingRates: ExchangeRate[],
  fetchImpl: typeof fetch | undefined = globalThis.fetch,
): Promise<ExchangeRate[]> {
  if (typeof fetchImpl !== 'function') {
    return existingRates;
  }

  const existingByCode = new Map<CurrencyCode, ExchangeRate>();
  for (const rate of existingRates) {
    existingByCode.set(rate.currencyCode, rate);
  }

  const payload = await fetchJsonWithTimeout<ErApiResponse>(FX_API_URL, fetchImpl);
  if (!payload || payload.result === 'error' || !payload.rates || typeof payload.rates !== 'object') {
    return existingRates;
  }

  const nowIso = new Date().toISOString();
  const nextByCode = new Map<CurrencyCode, ExchangeRate>();

  for (const code of SUPPORTED_CURRENCIES) {
    const existing = existingByCode.get(code);
    if (existing?.source === 'manual') {
      nextByCode.set(code, existing);
      continue;
    }

    if (code === 'TRY') {
      nextByCode.set('TRY', {
        currencyCode: 'TRY',
        rateToTry: 1,
        source: 'auto',
        updatedAt: nowIso,
      });
      continue;
    }

    if (code === 'XAU') {
      nextByCode.set(
        'XAU',
        existing ?? {
          currencyCode: 'XAU',
          rateToTry: DEFAULT_EXCHANGE_RATES.XAU,
          source: 'auto',
          updatedAt: nowIso,
        },
      );
      continue;
    }

    const rawPerTry = payload.rates[code];
    if (typeof rawPerTry === 'number' && Number.isFinite(rawPerTry) && rawPerTry > 0) {
      nextByCode.set(code, {
        currencyCode: code,
        rateToTry: roundRate(1 / rawPerTry),
        source: 'auto',
        updatedAt: nowIso,
      });
    } else if (existing) {
      nextByCode.set(code, existing);
    } else {
      nextByCode.set(code, {
        currencyCode: code,
        rateToTry: DEFAULT_EXCHANGE_RATES[code],
        source: 'auto',
        updatedAt: nowIso,
      });
    }
  }

  const existingXau = existingByCode.get('XAU');
  if (existingXau?.source !== 'manual') {
    const usdRateToTry = nextByCode.get('USD')?.rateToTry;
    if (usdRateToTry && usdRateToTry > 0) {
      const goldPayload = await fetchJsonWithTimeout<GoldApiResponse>(GOLD_API_URL, fetchImpl);
      if (
        goldPayload &&
        typeof goldPayload.price === 'number' &&
        Number.isFinite(goldPayload.price) &&
        goldPayload.price > 0
      ) {
        const gramTry = (goldPayload.price / TROY_OUNCE_IN_GRAMS) * usdRateToTry;
        nextByCode.set('XAU', {
          currencyCode: 'XAU',
          rateToTry: roundRate(gramTry),
          source: 'auto',
          updatedAt: nowIso,
        });
      }
    }
  }

  return SUPPORTED_CURRENCIES.map((code) => nextByCode.get(code)!);
}
