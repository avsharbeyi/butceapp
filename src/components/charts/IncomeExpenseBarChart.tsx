import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { computeBarMetrics } from '@/components/charts/chartMath';
import { MoneyText } from '@/components/ui/MoneyText';
import type { CurrencyCode } from '@/domain/types';
import { TABULAR_NUMS_STYLE, useTheme } from '@/theme/theme';

export interface IncomeExpensePoint {
  key: string;
  label: string;
  income: number;
  expense: number;
  net: number;
}

export interface IncomeExpenseBarChartProps {
  series: IncomeExpensePoint[];
  currency: CurrencyCode;
  privacyMode?: boolean;
  height?: number;
}

export function IncomeExpenseBarChart({
  series,
  currency,
  privacyMode,
  height = 190,
}: IncomeExpenseBarChartProps) {
  const theme = useTheme();
  const [containerWidth, setContainerWidth] = useState(320);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const labelAreaHeight = 24;
  const topPadding = 12;
  const plotHeight = Math.max(60, height - labelAreaHeight - topPadding);

  const metrics = useMemo(
    () =>
      computeBarMetrics(
        series.map((s) => ({ income: s.income, expense: s.expense })),
        plotHeight,
      ),
    [series, plotHeight],
  );

  const groupMinWidth = series.length > 14 ? 32 : 46;
  const svgWidth = Math.max(containerWidth, series.length * groupMinWidth);
  const groupWidth = series.length > 0 ? svgWidth / series.length : svgWidth;
  const barWidth = Math.max(5, Math.min(14, Math.floor((groupWidth - 10) / 2)));
  const barGap = 3;

  const selectedPoint = useMemo(
    () => series.find((s) => s.key === selectedKey) ?? null,
    [series, selectedKey],
  );

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.floor(event.nativeEvent.layout.width);
    if (nextWidth > 0 && nextWidth !== containerWidth) {
      setContainerWidth(nextWidth);
    }
  };

  if (series.length === 0) {
    return (
      <View style={[styles.emptyBox, { borderColor: theme.colors.border }]}>
        <Text style={[styles.emptyText, { color: theme.colors.muted }]}>
          Bu dönem için gösterilecek gelir/gider verisi yok.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper} onLayout={handleLayout}>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: theme.colors.income }]} />
          <Text style={[styles.legendLabel, { color: theme.colors.muted }]}>Gelir</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: theme.colors.expense }]} />
          <Text style={[styles.legendLabel, { color: theme.colors.muted }]}>Gider</Text>
        </View>
        <Text style={[styles.hintText, { color: theme.colors.muted }]}>
          Detay için çubuğa dokunun
        </Text>
      </View>

      {selectedPoint ? (
        <View
          style={[
            styles.tooltip,
            {
              backgroundColor: theme.colors.elevated,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
            },
          ]}
        >
          <View style={styles.tooltipHeader}>
            <Text style={[styles.tooltipTitle, { color: theme.colors.text }]}>
              {selectedPoint.label}
            </Text>
            <Pressable onPress={() => setSelectedKey(null)} hitSlop={8}>
              <Text style={[styles.tooltipClose, { color: theme.colors.muted }]}>Kapat</Text>
            </Pressable>
          </View>
          <View style={styles.tooltipMetrics}>
            <View style={styles.tooltipCol}>
              <Text style={[styles.tooltipLabel, { color: theme.colors.muted }]}>Gelir</Text>
              <MoneyText
                amount={selectedPoint.income}
                currency={currency}
                privacyMode={privacyMode}
                color={theme.colors.income}
                style={styles.tooltipValue}
              />
            </View>
            <View style={styles.tooltipCol}>
              <Text style={[styles.tooltipLabel, { color: theme.colors.muted }]}>Gider</Text>
              <MoneyText
                amount={selectedPoint.expense}
                currency={currency}
                privacyMode={privacyMode}
                color={theme.colors.expense}
                style={styles.tooltipValue}
              />
            </View>
            <View style={styles.tooltipCol}>
              <Text style={[styles.tooltipLabel, { color: theme.colors.muted }]}>Net</Text>
              <MoneyText
                amount={selectedPoint.net}
                currency={currency}
                privacyMode={privacyMode}
                sign="always"
                color={
                  selectedPoint.net >= 0 ? theme.colors.income : theme.colors.expense
                }
                style={styles.tooltipValue}
              />
            </View>
          </View>
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={svgWidth > containerWidth}
        bounces={false}
      >
        <View style={{ width: svgWidth, height }}>
          <Svg width={svgWidth} height={height}>
            {[0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = topPadding + plotHeight * (1 - ratio);
              return (
                <Line
                  key={ratio}
                  x1={0}
                  y1={y}
                  x2={svgWidth}
                  y2={y}
                  stroke={theme.colors.border}
                  strokeDasharray="3 4"
                  strokeWidth={1}
                />
              );
            })}

            <Line
              x1={0}
              y1={topPadding + plotHeight}
              x2={svgWidth}
              y2={topPadding + plotHeight}
              stroke={theme.colors.border}
              strokeWidth={1}
            />

            {series.map((item, idx) => {
              const bar = metrics.bars[idx] ?? { incomeHeight: 0, expenseHeight: 0 };
              const centerX = idx * groupWidth + groupWidth / 2;
              const pairWidth = barWidth * 2 + barGap;
              const incomeX = centerX - pairWidth / 2;
              const expenseX = incomeX + barWidth + barGap;
              const baseY = topPadding + plotHeight;
              const isSelected = selectedKey === item.key;

              const showLabel =
                series.length <= 12 || idx % 3 === 0 || idx === series.length - 1;

              return (
                <React.Fragment key={item.key}>
                  {isSelected ? (
                    <Rect
                      x={idx * groupWidth + 2}
                      y={topPadding - 4}
                      width={Math.max(4, groupWidth - 4)}
                      height={plotHeight + 4}
                      rx={6}
                      fill={theme.colors.accentSoft}
                    />
                  ) : null}

                  {bar.incomeHeight > 0 ? (
                    <Rect
                      x={incomeX}
                      y={baseY - bar.incomeHeight}
                      width={barWidth}
                      height={bar.incomeHeight}
                      rx={3}
                      fill={theme.colors.income}
                      opacity={selectedKey && !isSelected ? 0.5 : 1}
                    />
                  ) : null}

                  {bar.expenseHeight > 0 ? (
                    <Rect
                      x={expenseX}
                      y={baseY - bar.expenseHeight}
                      width={barWidth}
                      height={bar.expenseHeight}
                      rx={3}
                      fill={theme.colors.expense}
                      opacity={selectedKey && !isSelected ? 0.5 : 1}
                    />
                  ) : null}

                  {showLabel ? (
                    <SvgText
                      x={centerX}
                      y={height - 6}
                      fontSize={10}
                      fontWeight={isSelected ? '700' : '500'}
                      fill={isSelected ? theme.colors.text : theme.colors.muted}
                      textAnchor="middle"
                    >
                      {item.label}
                    </SvgText>
                  ) : null}
                </React.Fragment>
              );
            })}
          </Svg>

          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <View style={styles.hitOverlayRow}>
              {series.map((item) => (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.label} çubuk detayı`}
                  onPress={() =>
                    setSelectedKey((prev) => (prev === item.key ? null : item.key))
                  }
                  style={{ width: groupWidth, height }}
                />
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 10,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  hintText: {
    marginLeft: 'auto',
    fontSize: 11,
  },
  tooltip: {
    borderWidth: 1,
    padding: 10,
    gap: 6,
  },
  tooltipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tooltipTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  tooltipClose: {
    fontSize: 11,
    fontWeight: '600',
  },
  tooltipMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  tooltipCol: {
    flex: 1,
    gap: 2,
  },
  tooltipLabel: {
    fontSize: 11,
  },
  tooltipValue: {
    fontSize: 13,
    fontWeight: '700',
    ...TABULAR_NUMS_STYLE,
  },
  hitOverlayRow: {
    flexDirection: 'row',
    flex: 1,
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
