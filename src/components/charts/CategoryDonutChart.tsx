import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import {
  computeDonutArcs,
  describeDonutSectorPath,
} from '@/components/charts/chartMath';
import { MoneyText } from '@/components/ui/MoneyText';
import { formatPercent } from '@/domain/money';
import type { CategoryBreakdownItem, CurrencyCode } from '@/domain/types';
import { TABULAR_NUMS_STYLE, useTheme } from '@/theme/theme';

export interface CategoryDonutChartProps {
  items: CategoryBreakdownItem[];
  currency: CurrencyCode;
  privacyMode?: boolean;
  selectedCategoryId?: string | null;
  onSelectCategory?: (categoryId: string) => void;
  centerLabel?: string;
  size?: number;
}

export function CategoryDonutChart({
  items,
  currency,
  privacyMode,
  selectedCategoryId,
  onSelectCategory,
  centerLabel = 'Toplam',
  size = 184,
}: CategoryDonutChartProps) {
  const theme = useTheme();

  const totalAmount = useMemo(
    () => items.reduce((sum, item) => sum + item.amount, 0),
    [items],
  );

  const arcs = useMemo(
    () =>
      computeDonutArcs(
        items.map((item) => ({
          id: item.categoryId,
          value: item.amount,
          color: item.color,
        })),
      ),
    [items],
  );

  const selectedItem = useMemo(
    () => items.find((i) => i.categoryId === selectedCategoryId) ?? null,
    [items, selectedCategoryId],
  );

  if (items.length === 0 || arcs.length === 0) {
    return (
      <View style={[styles.emptyBox, { borderColor: theme.colors.border }]}>
        <Text style={[styles.emptyText, { color: theme.colors.muted }]}>
          Seçili dönem için kategori dağılımı bulunmuyor.
        </Text>
      </View>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = size / 2 - 6;
  const strokeWidth = Math.max(22, Math.round(size * 0.16));
  const innerRadius = Math.max(24, outerRadius - strokeWidth);
  const midRadius = (outerRadius + innerRadius) / 2;

  return (
    <View style={styles.container}>
      <View style={[styles.donutWrap, { width: size, height: size }]}>
        <Svg width={size} height={size}>
          {arcs.map((arc) => {
            const isSelected = selectedCategoryId === arc.id;
            const dimmed = Boolean(selectedCategoryId) && !isSelected;

            if (arc.isFullCircle) {
              return (
                <Circle
                  key={arc.id}
                  cx={cx}
                  cy={cy}
                  r={midRadius}
                  stroke={arc.color}
                  strokeWidth={strokeWidth}
                  fill="none"
                  opacity={dimmed ? 0.35 : 1}
                  onPress={onSelectCategory ? () => onSelectCategory(arc.id) : undefined}
                />
              );
            }

            const d = describeDonutSectorPath(
              cx,
              cy,
              isSelected ? outerRadius + 3 : outerRadius,
              innerRadius,
              arc.startAngle,
              arc.endAngle,
            );

            return (
              <Path
                key={arc.id}
                d={d}
                fill={arc.color}
                stroke={theme.colors.card}
                strokeWidth={1.5}
                opacity={dimmed ? 0.35 : 1}
                onPress={onSelectCategory ? () => onSelectCategory(arc.id) : undefined}
              />
            );
          })}
        </Svg>

        <View style={[styles.centerOverlay, { width: innerRadius * 1.8 }]} pointerEvents="none">
          <Text
            numberOfLines={1}
            style={[styles.centerLabel, { color: theme.colors.muted }]}
          >
            {selectedItem ? selectedItem.name : centerLabel}
          </Text>
          <MoneyText
            amount={selectedItem ? selectedItem.amount : totalAmount}
            currency={currency}
            privacyMode={privacyMode}
            style={styles.centerAmount}
            numberOfLines={1}
          />
          {selectedItem ? (
            <Text style={[styles.centerPct, TABULAR_NUMS_STYLE, { color: theme.colors.accent }]}>
              {formatPercent(selectedItem.sharePct)}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.legendList}>
        {items.map((item) => {
          const isSelected = selectedCategoryId === item.categoryId;
          return (
            <Pressable
              key={item.categoryId}
              accessibilityRole={onSelectCategory ? 'button' : undefined}
              disabled={!onSelectCategory}
              onPress={() => onSelectCategory?.(item.categoryId)}
              style={({ pressed }) => [
                styles.legendRow,
                {
                  backgroundColor: isSelected ? theme.colors.elevated : 'transparent',
                  borderColor: isSelected ? theme.colors.border : 'transparent',
                  borderRadius: theme.radius.md,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <View style={styles.legendLeft}>
                <View style={[styles.dot, { backgroundColor: item.color }]} />
                <View style={styles.nameBlock}>
                  <Text
                    numberOfLines={1}
                    style={[styles.categoryName, { color: theme.colors.text }]}
                  >
                    {item.name}
                  </Text>
                  <Text style={[styles.countText, { color: theme.colors.muted }]}>
                    {item.count} işlem
                  </Text>
                </View>
              </View>

              <View style={styles.legendRight}>
                <MoneyText
                  amount={item.amount}
                  currency={currency}
                  privacyMode={privacyMode}
                  style={styles.amountText}
                />
                <Text
                  style={[
                    styles.pctText,
                    TABULAR_NUMS_STYLE,
                    { color: theme.colors.muted },
                  ]}
                >
                  {formatPercent(item.sharePct)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    alignItems: 'center',
  },
  donutWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  centerLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  centerAmount: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  centerPct: {
    fontSize: 11,
    fontWeight: '700',
  },
  legendList: {
    width: '100%',
    gap: 6,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    gap: 12,
  },
  legendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  nameBlock: {
    flex: 1,
    gap: 1,
  },
  categoryName: {
    fontSize: 13,
    fontWeight: '600',
  },
  countText: {
    fontSize: 11,
  },
  legendRight: {
    alignItems: 'flex-end',
    gap: 1,
  },
  amountText: {
    fontSize: 13,
    fontWeight: '700',
  },
  pctText: {
    fontSize: 11,
  },
  emptyBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
});
