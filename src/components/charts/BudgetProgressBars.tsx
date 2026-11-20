import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MoneyText } from '@/components/ui/MoneyText';
import { formatPercent } from '@/domain/money';
import type { BudgetProgressItem } from '@/domain/types';
import { TABULAR_NUMS_STYLE, useTheme } from '@/theme/theme';

export interface BudgetProgressBarsProps {
  items: BudgetProgressItem[];
  privacyMode?: boolean;
  onPressItem?: (item: BudgetProgressItem) => void;
}

export function BudgetProgressBars({
  items,
  privacyMode,
  onPressItem,
}: BudgetProgressBarsProps) {
  const theme = useTheme();

  if (items.length === 0) {
    return (
      <View style={[styles.emptyBox, { borderColor: theme.colors.border }]}>
        <Text style={[styles.emptyText, { color: theme.colors.muted }]}>
          Bu ay için tanımlanmış bütçe limiti yok.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {items.map((item) => {
        const barColor =
          item.pct >= 100
            ? theme.colors.expense
            : item.pct >= 80
              ? theme.colors.warning
              : theme.colors.income;

        const statusLabel =
          item.pct >= 100
            ? 'Limit Aşıldı'
            : item.pct >= 80
              ? 'Sınıra Yakın'
              : 'Normal';

        const fillWidthPct = `${Math.min(100, Math.max(0, item.pct))}%` as const;

        const rowContent = (
          <View style={styles.itemContent}>
            <View style={styles.topRow}>
              <View style={styles.titleRow}>
                <View style={[styles.catDot, { backgroundColor: item.categoryColor }]} />
                <Text
                  numberOfLines={1}
                  style={[styles.categoryName, { color: theme.colors.text }]}
                >
                  {item.categoryName}
                </Text>
              </View>

              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: `${barColor}20` },
                  ]}
                >
                  <Text style={[styles.statusText, { color: barColor }]}>
                    {statusLabel}
                  </Text>
                </View>
                <Text style={[styles.pctText, TABULAR_NUMS_STYLE, { color: barColor }]}>
                  {formatPercent(item.pct)}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.track,
                {
                  backgroundColor: theme.colors.elevated,
                  borderRadius: theme.radius.pill,
                },
              ]}
            >
              <View
                style={[
                  styles.fill,
                  {
                    width: fillWidthPct,
                    backgroundColor: barColor,
                    borderRadius: theme.radius.pill,
                  },
                ]}
              />
            </View>

            <View style={styles.amountsRow}>
              <Text style={[styles.amountLabel, { color: theme.colors.muted }]}>
                Harcanan:{' '}
                <MoneyText
                  amount={item.spent}
                  currency={item.budget.currency}
                  privacyMode={privacyMode}
                  color={theme.colors.text}
                  style={styles.amountStrong}
                />
              </Text>
              <Text style={[styles.amountLabel, { color: theme.colors.muted }]}>
                Limit:{' '}
                <MoneyText
                  amount={item.limit}
                  currency={item.budget.currency}
                  privacyMode={privacyMode}
                  color={theme.colors.text}
                  style={styles.amountStrong}
                />
              </Text>
            </View>
          </View>
        );

        if (onPressItem) {
          return (
            <Pressable
              key={item.budget.id}
              accessibilityRole="button"
              onPress={() => onPressItem(item)}
              style={({ pressed }) => [
                styles.itemCard,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.elevated,
                  borderRadius: theme.radius.md,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              {rowContent}
            </Pressable>
          );
        }

        return (
          <View
            key={item.budget.id}
            style={[
              styles.itemCard,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.elevated,
                borderRadius: theme.radius.md,
              },
            ]}
          >
            {rowContent}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 10,
  },
  itemCard: {
    borderWidth: 1,
    padding: 12,
  },
  itemContent: {
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  catDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  pctText: {
    fontSize: 13,
    fontWeight: '700',
  },
  track: {
    height: 8,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
  amountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  amountLabel: {
    fontSize: 12,
  },
  amountStrong: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
});
