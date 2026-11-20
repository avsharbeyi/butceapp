import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getCurrencySymbol } from '@/domain/money';
import { daysInMonth, toIsoDate } from '@/domain/periods';
import type { CurrencyCode } from '@/domain/types';
import { TABULAR_NUMS_STYLE, useTheme } from '@/theme/theme';

export interface CalendarDaySummary {
  income: number;
  expense: number;
  net: number;
  intensity: 0 | 1 | 2 | 3 | 4;
}

export interface SpendingCalendarProps {
  year: number;
  monthIndex0: number;
  summary: Record<string, CalendarDaySummary>;
  currency: CurrencyCode;
  selectedDate?: string | null;
  privacyMode?: boolean;
  onSelectDate: (isoDate: string) => void;
}

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;

function formatCompactMoney(amount: number, currency: CurrencyCode, privacyMode: boolean): string {
  if (privacyMode) {
    return '••';
  }
  const symbol = getCurrencySymbol(currency);
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    return `${(abs / 1_000_000).toFixed(1).replace('.', ',')}M${symbol}`;
  }
  if (abs >= 1_000) {
    return `${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace('.', ',')}B${symbol}`;
  }
  return `${Math.round(abs)}${symbol}`;
}

export function SpendingCalendar({
  year,
  monthIndex0,
  summary,
  currency,
  selectedDate,
  privacyMode = false,
  onSelectDate,
}: SpendingCalendarProps) {
  const theme = useTheme();

  const weeks = useMemo(() => {
    const month1To12 = monthIndex0 + 1;
    const totalDays = daysInMonth(year, month1To12);
    const utcDay = new Date(Date.UTC(year, monthIndex0, 1)).getUTCDay();
    const leadingEmpty = (utcDay + 6) % 7;

    const cells: Array<{ day: number; isoDate: string } | null> = [];
    for (let i = 0; i < leadingEmpty; i += 1) {
      cells.push(null);
    }
    for (let day = 1; day <= totalDays; day += 1) {
      cells.push({
        day,
        isoDate: toIsoDate(year, month1To12, day),
      });
    }
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    const rows: Array<Array<{ day: number; isoDate: string } | null>> = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }
    return rows;
  }, [year, monthIndex0]);

  const intensityBg = (intensity: 0 | 1 | 2 | 3 | 4): string => {
    switch (intensity) {
      case 0:
        return theme.colors.elevated;
      case 1:
        return theme.isDark ? 'rgba(239, 68, 68, 0.14)' : 'rgba(239, 68, 68, 0.08)';
      case 2:
        return theme.isDark ? 'rgba(239, 68, 68, 0.24)' : 'rgba(239, 68, 68, 0.16)';
      case 3:
        return theme.isDark ? 'rgba(239, 68, 68, 0.36)' : 'rgba(239, 68, 68, 0.24)';
      case 4:
        return theme.isDark ? 'rgba(239, 68, 68, 0.48)' : 'rgba(239, 68, 68, 0.34)';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.weekdayRow}>
        {WEEKDAYS.map((day) => (
          <View key={day} style={styles.weekdayCell}>
            <Text style={[styles.weekdayText, { color: theme.colors.muted }]}>{day}</Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {weeks.map((week, wIdx) => (
          <View key={wIdx} style={styles.weekRow}>
            {week.map((cell, cIdx) => {
              if (!cell) {
                return <View key={`empty-${wIdx}-${cIdx}`} style={styles.daySpacer} />;
              }

              const daySummary = summary[cell.isoDate] ?? {
                income: 0,
                expense: 0,
                net: 0,
                intensity: 0 as const,
              };
              const isSelected = selectedDate === cell.isoDate;

              return (
                <Pressable
                  key={cell.isoDate}
                  accessibilityRole="button"
                  accessibilityLabel={`${cell.isoDate} günlük özet`}
                  onPress={() => onSelectDate(cell.isoDate)}
                  style={({ pressed }) => [
                    styles.dayCell,
                    {
                      backgroundColor: intensityBg(daySummary.intensity),
                      borderColor: isSelected ? theme.colors.accent : theme.colors.border,
                      borderWidth: isSelected ? 1.8 : 1,
                      borderRadius: theme.radius.sm,
                      opacity: pressed ? 0.78 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNum,
                      TABULAR_NUMS_STYLE,
                      {
                        color: isSelected ? theme.colors.accent : theme.colors.text,
                        fontWeight: isSelected ? '800' : '600',
                      },
                    ]}
                  >
                    {cell.day}
                  </Text>

                  <View style={styles.indicators}>
                    {daySummary.income > 0 ? (
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.indicatorText,
                          TABULAR_NUMS_STYLE,
                          { color: theme.colors.income },
                        ]}
                      >
                        +{formatCompactMoney(daySummary.income, currency, privacyMode)}
                      </Text>
                    ) : null}
                    {daySummary.expense > 0 ? (
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.indicatorText,
                          TABULAR_NUMS_STYLE,
                          { color: theme.colors.expense },
                        ]}
                      >
                        -{formatCompactMoney(daySummary.expense, currency, privacyMode)}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.legendRow}>
        <Text style={[styles.legendLabel, { color: theme.colors.muted }]}>
          Harcama Yoğunluğu:
        </Text>
        {([0, 1, 2, 3, 4] as const).map((level) => (
          <View
            key={level}
            style={[
              styles.legendSwatch,
              {
                backgroundColor: intensityBg(level),
                borderColor: theme.colors.border,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  weekdayRow: {
    flexDirection: 'row',
    gap: 4,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  weekdayText: {
    fontSize: 11,
    fontWeight: '700',
  },
  grid: {
    gap: 4,
  },
  weekRow: {
    flexDirection: 'row',
    gap: 4,
  },
  daySpacer: {
    flex: 1,
    minHeight: 54,
  },
  dayCell: {
    flex: 1,
    minHeight: 54,
    padding: 4,
    justifyContent: 'space-between',
  },
  dayNum: {
    fontSize: 11,
  },
  indicators: {
    gap: 1,
  },
  indicatorText: {
    fontSize: 9,
    fontWeight: '700',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    marginTop: 4,
  },
  legendLabel: {
    fontSize: 11,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
    borderWidth: 1,
  },
});
