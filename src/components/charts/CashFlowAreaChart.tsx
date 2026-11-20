import React, { useId, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { computeAreaPoints } from '@/components/charts/chartMath';
import { MoneyText } from '@/components/ui/MoneyText';
import type { CurrencyCode } from '@/domain/types';
import { useTheme } from '@/theme/theme';

export interface CashFlowPoint {
  key: string;
  label: string;
  cumulativeNet: number;
}

export interface CashFlowAreaChartProps {
  series: CashFlowPoint[];
  currency: CurrencyCode;
  privacyMode?: boolean;
  height?: number;
}

export function CashFlowAreaChart({
  series,
  currency,
  privacyMode,
  height = 190,
}: CashFlowAreaChartProps) {
  const theme = useTheme();
  const gradientId = useId().replace(/:/g, '');
  const [width, setWidth] = useState(320);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const plotHeight = Math.max(80, height - 24);
  const padding = 16;

  const geometry = useMemo(
    () =>
      computeAreaPoints(
        series.map((s) => s.cumulativeNet),
        width,
        plotHeight,
        padding,
      ),
    [series, width, plotHeight],
  );

  const lastValue = series.length > 0 ? series[series.length - 1].cumulativeNet : 0;
  const strokeColor = lastValue >= 0 ? theme.colors.income : theme.colors.expense;

  const selectedItem =
    selectedIndex !== null && series[selectedIndex] ? series[selectedIndex] : null;
  const selectedPoint =
    selectedIndex !== null && geometry.points[selectedIndex]
      ? geometry.points[selectedIndex]
      : null;

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.floor(event.nativeEvent.layout.width);
    if (nextWidth > 0 && nextWidth !== width) {
      setWidth(nextWidth);
    }
  };

  if (series.length === 0) {
    return (
      <View style={[styles.emptyBox, { borderColor: theme.colors.border }]}>
        <Text style={[styles.emptyText, { color: theme.colors.muted }]}>
          Nakit akışı grafiği için işlem verisi bulunamadı.
        </Text>
      </View>
    );
  }

  const xLabelIndices = Array.from(
    new Set([0, Math.floor((series.length - 1) / 2), series.length - 1]),
  );

  return (
    <View style={styles.wrapper} onLayout={handleLayout}>
      <View style={styles.headerRow}>
        <Text style={[styles.caption, { color: theme.colors.muted }]}>
          Kümülatif Net Akış
        </Text>
        <Text style={[styles.caption, { color: theme.colors.muted }]}>
          Noktaya dokunarak inceleyin
        </Text>
      </View>

      {selectedItem ? (
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
          <View style={styles.tooltipRow}>
            <View>
              <Text style={[styles.tooltipLabel, { color: theme.colors.muted }]}>
                {selectedItem.label}
              </Text>
              <MoneyText
                amount={selectedItem.cumulativeNet}
                currency={currency}
                privacyMode={privacyMode}
                sign="always"
                color={
                  selectedItem.cumulativeNet >= 0
                    ? theme.colors.income
                    : theme.colors.expense
                }
                style={styles.tooltipValue}
              />
            </View>
            <Pressable onPress={() => setSelectedIndex(null)} hitSlop={8}>
              <Text style={[styles.tooltipClose, { color: theme.colors.muted }]}>
                Kapat
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={{ width, height }}>
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={strokeColor} stopOpacity={0.32} />
              <Stop offset="100%" stopColor={strokeColor} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>

          <Line
            x1={padding}
            y1={geometry.zeroY}
            x2={Math.max(padding, width - padding)}
            y2={geometry.zeroY}
            stroke={theme.colors.border}
            strokeDasharray="4 4"
            strokeWidth={1.2}
          />

          {geometry.areaPath ? (
            <Path d={geometry.areaPath} fill={`url(#${gradientId})`} />
          ) : null}

          {geometry.linePath ? (
            <Path
              d={geometry.linePath}
              fill="none"
              stroke={strokeColor}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {selectedPoint ? (
            <Line
              x1={selectedPoint.x}
              y1={padding}
              x2={selectedPoint.x}
              y2={plotHeight - padding}
              stroke={theme.colors.accent}
              strokeDasharray="3 3"
              strokeWidth={1}
            />
          ) : null}

          {geometry.points.map((pt, idx) => {
            const isSelected = idx === selectedIndex;
            const pointColor = pt.value >= 0 ? theme.colors.income : theme.colors.expense;
            if (!isSelected && geometry.points.length > 16) {
              return null;
            }
            return (
              <Circle
                key={series[idx]?.key ?? idx}
                cx={pt.x}
                cy={pt.y}
                r={isSelected ? 5.5 : 3.2}
                fill={isSelected ? theme.colors.card : pointColor}
                stroke={pointColor}
                strokeWidth={isSelected ? 2.5 : 1.5}
              />
            );
          })}

          {xLabelIndices.map((idx) => {
            const pt = geometry.points[idx];
            const item = series[idx];
            if (!pt || !item) return null;
            const anchor =
              idx === 0 ? 'start' : idx === series.length - 1 ? 'end' : 'middle';
            return (
              <SvgText
                key={item.key}
                x={pt.x}
                y={height - 4}
                fontSize={10}
                fill={theme.colors.muted}
                textAnchor={anchor}
              >
                {item.label}
              </SvgText>
            );
          })}
        </Svg>

        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <View style={styles.hitOverlayRow}>
            {series.map((item, idx) => (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={`${item.label} nakit akışı noktası`}
                onPress={() =>
                  setSelectedIndex((prev) => (prev === idx ? null : idx))
                }
                style={styles.hitSlice}
              />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  caption: {
    fontSize: 11,
    fontWeight: '500',
  },
  tooltip: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tooltipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tooltipLabel: {
    fontSize: 11,
  },
  tooltipValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  tooltipClose: {
    fontSize: 11,
    fontWeight: '600',
  },
  hitOverlayRow: {
    flex: 1,
    flexDirection: 'row',
  },
  hitSlice: {
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
