import type { DateRange, PeriodType } from './types';

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_KEY_RE = /^(\d{4})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

const TR_WEEKDAYS_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'] as const;
const TR_MONTHS_SHORT = [
  'Oca',
  'Şub',
  'Mar',
  'Nis',
  'May',
  'Haz',
  'Tem',
  'Ağu',
  'Eyl',
  'Eki',
  'Kas',
  'Ara',
] as const;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function clampMonthStartDay(monthStartDay: number): number {
  if (!Number.isFinite(monthStartDay)) {
    return 1;
  }
  return Math.max(1, Math.min(28, Math.trunc(monthStartDay)));
}

function toUtcMs(isoDate: string): number {
  const { year, month, day } = parseIsoDate(isoDate);
  return Date.UTC(year, month - 1, day);
}

/** Formats numeric year, 1-based month, and day into a `YYYY-MM-DD` string. */
export function toIsoDate(year: number, month1To12: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${pad2(month1To12)}-${pad2(day)}`;
}

/** Returns the local calendar date (`YYYY-MM-DD`) without UTC shift. */
export function getLocalTodayIso(now = new Date()): string {
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Returns the number of days in the given year and 1-based month using UTC calendar math. */
export function daysInMonth(year: number, month1To12: number): number {
  return new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
}

/** Parses and validates a `YYYY-MM-DD` date string without local timezone conversion. */
export function parseIsoDate(isoDate: string): { year: number; month: number; day: number } {
  const match = ISO_DATE_RE.exec(isoDate.trim());
  if (!match) {
    throw new Error(`Geçersiz ISO tarih biçimi: ${isoDate}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Geçersiz takvim tarihi: ${isoDate}`);
  }
  return { year, month, day };
}

/** Shifts a `YYYY-MM-DD` date by `days` days in UTC. */
export function addDays(isoDate: string, days: number): string {
  const { year, month, day } = parseIsoDate(isoDate);
  const shifted = new Date(Date.UTC(year, month - 1, day + Math.trunc(days)));
  return toIsoDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/**
 * Adds `months` calendar months to `isoDate`, clamping the day to the target month's last day
 * (e.g. `2026-01-31 + 1m -> 2026-02-28`, `2028-01-31 + 1m -> 2028-02-29`).
 */
export function addMonthsClamped(isoDate: string, months: number): string {
  const { year, month, day } = parseIsoDate(isoDate);
  const totalMonths = year * 12 + (month - 1) + Math.trunc(months);
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth0 = ((totalMonths % 12) + 12) % 12;
  const targetMonth = targetMonth0 + 1;
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return toIsoDate(targetYear, targetMonth, clampedDay);
}

/** Returns the inclusive `{ startDate, endDate }` range for a fiscal month (`YYYY-MM`). */
export function getFiscalMonthRange(monthKey: string, monthStartDay: number): DateRange {
  const match = MONTH_KEY_RE.exec(monthKey.trim());
  if (!match) {
    throw new Error(`Geçersiz ay anahtarı: ${monthKey}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`Geçersiz ay numarası: ${monthKey}`);
  }

  const startDay = clampMonthStartDay(monthStartDay);
  const startDate = toIsoDate(year, month, startDay);
  const nextMonthStart = addMonthsClamped(startDate, 1);
  const endDate = addDays(nextMonthStart, -1);
  return { startDate, endDate };
}

/** Maps a `YYYY-MM-DD` date to its fiscal month key (`YYYY-MM`) given `monthStartDay`. */
export function getFiscalMonthKey(isoDate: string, monthStartDay: number): string {
  const { year, month, day } = parseIsoDate(isoDate);
  const startDay = clampMonthStartDay(monthStartDay);
  if (day >= startDay) {
    return `${String(year).padStart(4, '0')}-${pad2(month)}`;
  }
  return addMonthsClamped(toIsoDate(year, month, 1), -1).slice(0, 7);
}

/** Computes the date range for a reporting period containing `anchorDate`. */
export function getPeriodRange(
  periodType: PeriodType,
  anchorDate: string,
  monthStartDay: number,
  customRange?: DateRange,
): DateRange {
  const { year, month, day } = parseIsoDate(anchorDate);

  switch (periodType) {
    case 'daily':
      return { startDate: anchorDate, endDate: anchorDate };
    case 'weekly': {
      const utcWeekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      const diffFromMonday = utcWeekday === 0 ? 6 : utcWeekday - 1;
      const startDate = addDays(anchorDate, -diffFromMonday);
      return { startDate, endDate: addDays(startDate, 6) };
    }
    case 'monthly':
      return getFiscalMonthRange(getFiscalMonthKey(anchorDate, monthStartDay), monthStartDay);
    case 'yearly':
      // Yearly reports always use standard calendar Jan 1 - Dec 31 regardless of monthStartDay.
      return { startDate: toIsoDate(year, 1, 1), endDate: toIsoDate(year, 12, 31) };
    case 'custom':
      return customRange ?? { startDate: anchorDate, endDate: anchorDate };
  }
}

/** Computes the immediately preceding period range matching `periodType` and `currentRange`. */
export function getPreviousPeriodRange(
  periodType: PeriodType,
  currentRange: DateRange,
  monthStartDay: number,
): DateRange {
  switch (periodType) {
    case 'daily': {
      const prev = addDays(currentRange.startDate, -1);
      return { startDate: prev, endDate: prev };
    }
    case 'weekly':
      return {
        startDate: addDays(currentRange.startDate, -7),
        endDate: addDays(currentRange.endDate, -7),
      };
    case 'monthly':
      return getPeriodRange('monthly', addDays(currentRange.startDate, -1), monthStartDay);
    case 'yearly': {
      const { year } = parseIsoDate(currentRange.startDate);
      return { startDate: toIsoDate(year - 1, 1, 1), endDate: toIsoDate(year - 1, 12, 31) };
    }
    case 'custom': {
      const spanDays = Math.max(
        0,
        Math.round((toUtcMs(currentRange.endDate) - toUtcMs(currentRange.startDate)) / MS_PER_DAY),
      );
      const prevEnd = addDays(currentRange.startDate, -1);
      return { startDate: addDays(prevEnd, -spanDays), endDate: prevEnd };
    }
  }
}

/** Shifts a period anchor date forward (+1) or backward (-1) by one period unit. */
export function shiftPeriodAnchor(
  periodType: PeriodType,
  anchorDate: string,
  direction: -1 | 1,
): string {
  switch (periodType) {
    case 'daily':
      return addDays(anchorDate, direction);
    case 'weekly':
      return addDays(anchorDate, direction * 7);
    case 'monthly':
      return addMonthsClamped(anchorDate, direction);
    case 'yearly':
      return addMonthsClamped(anchorDate, direction * 12);
    case 'custom':
      return anchorDate;
  }
}

export interface PeriodBucket {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
}

function buildDailyBuckets(range: DateRange, useWeekdayLabel: boolean): PeriodBucket[] {
  const buckets: PeriodBucket[] = [];
  let cursor = range.startDate;
  while (cursor <= range.endDate) {
    const { year, month, day } = parseIsoDate(cursor);
    const label = useWeekdayLabel
      ? TR_WEEKDAYS_SHORT[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
      : `${pad2(day)}.${pad2(month)}`;
    buckets.push({
      key: cursor,
      label,
      startDate: cursor,
      endDate: cursor,
    });
    cursor = addDays(cursor, 1);
  }
  return buckets;
}

function buildMonthlyBuckets(range: DateRange, includeYearInLabel: boolean): PeriodBucket[] {
  const start = parseIsoDate(range.startDate);
  const end = parseIsoDate(range.endDate);
  const startTotal = start.year * 12 + (start.month - 1);
  const endTotal = end.year * 12 + (end.month - 1);

  const buckets: PeriodBucket[] = [];
  for (let m = startTotal; m <= endTotal; m += 1) {
    const year = Math.floor(m / 12);
    const month = (m % 12) + 1;
    const monthStart = toIsoDate(year, month, 1);
    const monthEnd = toIsoDate(year, month, daysInMonth(year, month));
    const clampedStart = monthStart < range.startDate ? range.startDate : monthStart;
    const clampedEnd = monthEnd > range.endDate ? range.endDate : monthEnd;
    const shortMonth = TR_MONTHS_SHORT[month - 1];
    buckets.push({
      key: `${String(year).padStart(4, '0')}-${pad2(month)}`,
      label: includeYearInLabel ? `${shortMonth} '${String(year).slice(-2)}` : shortMonth,
      startDate: clampedStart,
      endDate: clampedEnd,
    });
  }
  return buckets;
}

/** Builds contiguous chart buckets covering `[range.startDate, range.endDate]`. */
export function getBucketsForPeriod(periodType: PeriodType, range: DateRange): PeriodBucket[] {
  if (range.startDate > range.endDate) {
    return [];
  }

  switch (periodType) {
    case 'daily':
    case 'monthly':
      return buildDailyBuckets(range, false);
    case 'weekly':
      return buildDailyBuckets(range, true);
    case 'yearly':
      return buildMonthlyBuckets(range, false);
    case 'custom': {
      const totalDays =
        Math.round((toUtcMs(range.endDate) - toUtcMs(range.startDate)) / MS_PER_DAY) + 1;
      if (totalDays <= 35) {
        return buildDailyBuckets(range, false);
      }
      if (totalDays <= 180) {
        const buckets: PeriodBucket[] = [];
        let cursor = range.startDate;
        while (cursor <= range.endDate) {
          const candidateEnd = addDays(cursor, 6);
          const bucketEnd = candidateEnd > range.endDate ? range.endDate : candidateEnd;
          const { month, day } = parseIsoDate(cursor);
          buckets.push({
            key: cursor,
            label: `${pad2(day)}.${pad2(month)}`,
            startDate: cursor,
            endDate: bucketEnd,
          });
          cursor = addDays(bucketEnd, 1);
        }
        return buckets;
      }
      return buildMonthlyBuckets(range, true);
    }
  }
}
