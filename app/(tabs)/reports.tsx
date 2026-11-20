import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { type Href, useRouter } from 'expo-router';
import {
  ChevronLeft,
  ChevronRight,
  Share2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShareReportModal } from '@/components/ShareReportModal';
import { BudgetProgressBars } from '@/components/charts/BudgetProgressBars';
import { CashFlowAreaChart } from '@/components/charts/CashFlowAreaChart';
import { CategoryDonutChart } from '@/components/charts/CategoryDonutChart';
import { IncomeExpenseBarChart } from '@/components/charts/IncomeExpenseBarChart';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { MoneyText } from '@/components/ui/MoneyText';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import {
  computeBudgetProgress,
  computeCategoryBreakdown,
  computeCategoryMovers,
  computeCumulativeCashFlowSeries,
  computeIncomeExpenseSeries,
  computePeriodKPIs,
  filterReportTransactions,
} from '@/domain/analytics';
import { ratesListToMap } from '@/domain/currency';
import { formatPercent } from '@/domain/money';
import {
  getFiscalMonthKey,
  getLocalTodayIso,
  getPeriodRange,
  getPreviousPeriodRange,
  parseIsoDate,
  shiftPeriodAnchor,
} from '@/domain/periods';
import type { DateRange, PeriodType } from '@/domain/types';
import { useFinanceStore } from '@/store/useFinanceStore';
import { TABULAR_NUMS_STYLE, useResponsiveLayout, useTheme } from '@/theme/theme';

const PERIOD_OPTIONS: Array<{ value: PeriodType; label: string }> = [
  { value: 'daily', label: 'Günlük' },
  { value: 'weekly', label: 'Haftalık' },
  { value: 'monthly', label: 'Aylık' },
  { value: 'yearly', label: 'Yıllık' },
  { value: 'custom', label: 'Özel' },
];

const DONUT_TYPE_OPTIONS: Array<{ value: 'expense' | 'income'; label: string }> = [
  { value: 'expense', label: 'Gider' },
  { value: 'income', label: 'Gelir' },
];

function formatShortDateTr(isoDate: string): string {
  try {
    const { year, month, day } = parseIsoDate(isoDate);
    return new Intl.DateTimeFormat('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));
  } catch {
    return isoDate;
  }
}

function formatRangeLabel(range: DateRange): string {
  if (range.startDate === range.endDate) {
    return formatShortDateTr(range.startDate);
  }
  return `${formatShortDateTr(range.startDate)} – ${formatShortDateTr(range.endDate)}`;
}

function DeltaBadge({
  pct,
  invertColor = false,
}: {
  pct: number;
  invertColor?: boolean;
}) {
  const theme = useTheme();
  const isPositive = pct > 0;
  const isZero = pct === 0;

  let color = theme.colors.muted;
  let bg = theme.colors.elevated;

  if (!isZero) {
    const good = invertColor ? !isPositive : isPositive;
    color = good ? theme.colors.income : theme.colors.expense;
    bg = good ? theme.colors.incomeSoft : theme.colors.expenseSoft;
  }

  return (
    <View style={[styles.deltaBadge, { backgroundColor: bg }]}>
      <Text style={[styles.deltaText, TABULAR_NUMS_STYLE, { color }]}>
        {isPositive ? '+' : ''}
        {formatPercent(pct)}
      </Text>
    </View>
  );
}

export default function ReportsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isWide, contentMaxWidth } = useResponsiveLayout();

  const transactions = useFinanceStore((s) => s.transactions);
  const accounts = useFinanceStore((s) => s.accounts);
  const categories = useFinanceStore((s) => s.categories);
  const budgets = useFinanceStore((s) => s.budgets);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);
  const settings = useFinanceStore((s) => s.settings);

  const todayIso = getLocalTodayIso();
  const initialMonthRange = getPeriodRange('monthly', todayIso, settings.monthStartDay);

  const [periodType, setPeriodType] = useState<PeriodType>('monthly');
  const [anchorDate, setAnchorDate] = useState<string>(todayIso);
  const [customStart, setCustomStart] = useState<string>(initialMonthRange.startDate);
  const [customEnd, setCustomEnd] = useState<string>(initialMonthRange.endDate);
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [donutType, setDonutType] = useState<'expense' | 'income'>('expense');
  const [selectedDonutCategoryId, setSelectedDonutCategoryId] = useState<string | null>(null);
  const [shareModalVisible, setShareModalVisible] = useState(false);

  const ratesMap = useMemo(() => ratesListToMap(exchangeRates), [exchangeRates]);
  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.deletedAt === null),
    [accounts],
  );
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const customValidation = useMemo(() => {
    try {
      parseIsoDate(customStart.trim());
      parseIsoDate(customEnd.trim());
      if (customStart.trim() > customEnd.trim()) {
        return {
          valid: false,
          error: 'Başlangıç tarihi bitiş tarihinden sonra olamaz.',
          range: { startDate: todayIso, endDate: todayIso },
        };
      }
      return {
        valid: true,
        error: null,
        range: { startDate: customStart.trim(), endDate: customEnd.trim() },
      };
    } catch {
      return {
        valid: false,
        error: 'Geçerli YYYY-AA-GG tarih aralığı girin.',
        range: { startDate: todayIso, endDate: todayIso },
      };
    }
  }, [customStart, customEnd, todayIso]);

  const range = useMemo(
    () =>
      getPeriodRange(
        periodType,
        anchorDate,
        settings.monthStartDay,
        customValidation.range,
      ),
    [periodType, anchorDate, settings.monthStartDay, customValidation.range],
  );

  const prevRange = useMemo(
    () => getPreviousPeriodRange(periodType, range, settings.monthStartDay),
    [periodType, range, settings.monthStartDay],
  );

  const scopedTransactions = useMemo(() => {
    if (accountFilter === 'all') {
      return transactions;
    }
    return transactions.filter(
      (t) => t.accountId === accountFilter || t.toAccountId === accountFilter,
    );
  }, [transactions, accountFilter]);

  const kpis = useMemo(
    () => computePeriodKPIs(scopedTransactions, range, prevRange),
    [scopedTransactions, range, prevRange],
  );

  const incomeExpenseSeries = useMemo(
    () => computeIncomeExpenseSeries(scopedTransactions, periodType, range),
    [scopedTransactions, periodType, range],
  );

  const cashFlowSeries = useMemo(
    () => computeCumulativeCashFlowSeries(scopedTransactions, periodType, range),
    [scopedTransactions, periodType, range],
  );

  const currentRangeTxs = useMemo(
    () => filterReportTransactions(scopedTransactions, range),
    [scopedTransactions, range],
  );

  const prevRangeTxs = useMemo(
    () => filterReportTransactions(scopedTransactions, prevRange),
    [scopedTransactions, prevRange],
  );

  const donutItems = useMemo(
    () => computeCategoryBreakdown(currentRangeTxs, categories, donutType),
    [currentRangeTxs, categories, donutType],
  );

  const selectedCategoryTxs = useMemo(() => {
    if (!selectedDonutCategoryId) {
      return [];
    }
    return currentRangeTxs
      .filter((tx) => {
        if (tx.type !== donutType) return false;
        const resolvedCatId = tx.categoryId ?? 'uncategorized';
        return resolvedCatId === selectedDonutCategoryId;
      })
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [currentRangeTxs, selectedDonutCategoryId, donutType]);

  const activeFiscalMonthKey = useMemo(
    () => getFiscalMonthKey(range.endDate, settings.monthStartDay),
    [range.endDate, settings.monthStartDay],
  );

  const budgetItems = useMemo(
    () =>
      computeBudgetProgress(
        budgets,
        scopedTransactions,
        categories,
        activeFiscalMonthKey,
        settings.monthStartDay,
        ratesMap,
      ),
    [
      budgets,
      scopedTransactions,
      categories,
      activeFiscalMonthKey,
      settings.monthStartDay,
      ratesMap,
    ],
  );

  const movers = useMemo(
    () => computeCategoryMovers(currentRangeTxs, prevRangeTxs, categories),
    [currentRangeTxs, prevRangeTxs, categories],
  );

  const handlePeriodChange = (nextPeriod: PeriodType) => {
    setPeriodType(nextPeriod);
    setSelectedDonutCategoryId(null);
  };

  const handleShiftPeriod = (dir: -1 | 1) => {
    setAnchorDate((prev) => shiftPeriodAnchor(periodType, prev, dir));
    setSelectedDonutCategoryId(null);
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 12,
            paddingBottom: 28,
          },
          isWide && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={[styles.pageTitle, { color: theme.colors.text }]}>Raporlar</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShareModalVisible(true)}
            style={({ pressed }) => [
              styles.shareBtn,
              {
                backgroundColor: theme.colors.accent,
                borderRadius: theme.radius.md,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Share2 size={16} color="#FFFFFF" />
            <Text style={styles.shareBtnText}>Paylaş / Dışa Aktar</Text>
          </Pressable>
        </View>

        {/* Period selector + navigation */}
        <Card padding={12}>
          <SegmentedControl
            options={PERIOD_OPTIONS}
            value={periodType}
            onChange={handlePeriodChange}
          />

          {periodType === 'custom' ? (
            <View style={styles.customRangeBox}>
              <View style={styles.customInputsRow}>
                <View style={styles.customInputCol}>
                  <Text style={[styles.inputLabel, { color: theme.colors.muted }]}>
                    Başlangıç (YYYY-AA-GG)
                  </Text>
                  <TextInput
                    value={customStart}
                    onChangeText={setCustomStart}
                    placeholder="2026-11-01"
                    placeholderTextColor={theme.colors.muted}
                    style={[
                      styles.dateInput,
                      TABULAR_NUMS_STYLE,
                      {
                        backgroundColor: theme.colors.elevated,
                        borderColor: theme.colors.border,
                        color: theme.colors.text,
                        borderRadius: theme.radius.md,
                      },
                    ]}
                  />
                </View>
                <View style={styles.customInputCol}>
                  <Text style={[styles.inputLabel, { color: theme.colors.muted }]}>
                    Bitiş (YYYY-AA-GG)
                  </Text>
                  <TextInput
                    value={customEnd}
                    onChangeText={setCustomEnd}
                    placeholder="2026-11-30"
                    placeholderTextColor={theme.colors.muted}
                    style={[
                      styles.dateInput,
                      TABULAR_NUMS_STYLE,
                      {
                        backgroundColor: theme.colors.elevated,
                        borderColor: theme.colors.border,
                        color: theme.colors.text,
                        borderRadius: theme.radius.md,
                      },
                    ]}
                  />
                </View>
              </View>
              {!customValidation.valid && customValidation.error ? (
                <Text style={[styles.errorHint, { color: theme.colors.expense }]}>
                  {customValidation.error}
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.periodNavRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => handleShiftPeriod(-1)}
                style={({ pressed }) => [
                  styles.navBtn,
                  {
                    backgroundColor: theme.colors.elevated,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.sm,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <ChevronLeft size={16} color={theme.colors.text} />
                <Text style={[styles.navBtnText, { color: theme.colors.text }]}>
                  Önceki
                </Text>
              </Pressable>

              <Text style={[styles.rangeLabel, { color: theme.colors.text }]}>
                {formatRangeLabel(range)}
              </Text>

              <Pressable
                accessibilityRole="button"
                onPress={() => handleShiftPeriod(1)}
                style={({ pressed }) => [
                  styles.navBtn,
                  {
                    backgroundColor: theme.colors.elevated,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.sm,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <Text style={[styles.navBtnText, { color: theme.colors.text }]}>
                  Sonraki
                </Text>
                <ChevronRight size={16} color={theme.colors.text} />
              </Pressable>
            </View>
          )}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.accountChipsRow}
          >
            <Chip
              label="Tüm Hesaplar"
              selected={accountFilter === 'all'}
              onPress={() => setAccountFilter('all')}
            />
            {activeAccounts.map((acc) => (
              <Chip
                key={acc.id}
                label={acc.name}
                selected={accountFilter === acc.id}
                color={acc.color}
                onPress={() =>
                  setAccountFilter((prev) => (prev === acc.id ? 'all' : acc.id))
                }
              />
            ))}
          </ScrollView>
        </Card>

        {/* KPI Şeridi */}
        <View style={[styles.kpiGrid, isWide && styles.kpiGridWide]}>
          <Card style={styles.kpiCard} padding={14}>
            <View style={styles.kpiTopRow}>
              <Text style={[styles.kpiTitle, { color: theme.colors.muted }]}>
                Toplam Gelir
              </Text>
              <DeltaBadge pct={kpis.incomeDeltaPct} />
            </View>
            <MoneyText
              amount={kpis.totalIncome}
              currency={settings.baseCurrency}
              privacyMode={settings.privacyMode}
              color={theme.colors.income}
              style={styles.kpiValue}
            />
          </Card>

          <Card style={styles.kpiCard} padding={14}>
            <View style={styles.kpiTopRow}>
              <Text style={[styles.kpiTitle, { color: theme.colors.muted }]}>
                Toplam Gider
              </Text>
              <DeltaBadge pct={kpis.expenseDeltaPct} invertColor />
            </View>
            <MoneyText
              amount={kpis.totalExpense}
              currency={settings.baseCurrency}
              privacyMode={settings.privacyMode}
              color={theme.colors.expense}
              style={styles.kpiValue}
            />
          </Card>

          <Card style={styles.kpiCard} padding={14}>
            <View style={styles.kpiTopRow}>
              <Text style={[styles.kpiTitle, { color: theme.colors.muted }]}>
                Net Tasarruf
              </Text>
              <DeltaBadge pct={kpis.netDeltaPct} />
            </View>
            <MoneyText
              amount={kpis.netCashFlow}
              currency={settings.baseCurrency}
              privacyMode={settings.privacyMode}
              sign="always"
              color={
                kpis.netCashFlow >= 0 ? theme.colors.income : theme.colors.expense
              }
              style={styles.kpiValue}
            />
          </Card>

          <Card style={styles.kpiCard} padding={14}>
            <Text style={[styles.kpiTitle, { color: theme.colors.muted }]}>
              Tasarruf Oranı
            </Text>
            <Text
              style={[
                styles.kpiValue,
                TABULAR_NUMS_STYLE,
                {
                  color:
                    kpis.savingsRate >= 0
                      ? theme.colors.accent
                      : theme.colors.expense,
                },
              ]}
            >
              {formatPercent(kpis.savingsRate)}
            </Text>
            <Text style={[styles.kpiSub, { color: theme.colors.muted }]}>
              Günlük Ort. Harcama:{' '}
              <MoneyText
                amount={kpis.dailyAverageExpense}
                currency={settings.baseCurrency}
                privacyMode={settings.privacyMode}
                color={theme.colors.text}
                style={styles.kpiSubBold}
              />
            </Text>
          </Card>
        </View>

        {/* Chart 1 & 2 */}
        <View style={[styles.chartsGrid, isWide && styles.chartsGridWide]}>
          <Card style={isWide ? styles.chartHalf : undefined}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              Gelir / Gider Karşılaştırması
            </Text>
            <View style={styles.chartBody}>
              <IncomeExpenseBarChart
                series={incomeExpenseSeries}
                currency={settings.baseCurrency}
                privacyMode={settings.privacyMode}
              />
            </View>
          </Card>

          <Card style={isWide ? styles.chartHalf : undefined}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              Kümülatif Nakit Akışı
            </Text>
            <View style={styles.chartBody}>
              <CashFlowAreaChart
                series={cashFlowSeries}
                currency={settings.baseCurrency}
                privacyMode={settings.privacyMode}
              />
            </View>
          </Card>
        </View>

        {/* Chart 3: Category Donut + Drilldown list */}
        <Card>
          <View style={styles.donutHeaderRow}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              Kategori Dağılımı
            </Text>
            <View style={styles.donutToggleWrap}>
              <SegmentedControl
                options={DONUT_TYPE_OPTIONS}
                value={donutType}
                onChange={(val) => {
                  setDonutType(val);
                  setSelectedDonutCategoryId(null);
                }}
              />
            </View>
          </View>

          <View style={styles.chartBody}>
            <CategoryDonutChart
              items={donutItems}
              currency={settings.baseCurrency}
              privacyMode={settings.privacyMode}
              selectedCategoryId={selectedDonutCategoryId}
              onSelectCategory={(catId) =>
                setSelectedDonutCategoryId((prev) => (prev === catId ? null : catId))
              }
              centerLabel={donutType === 'expense' ? 'Toplam Gider' : 'Toplam Gelir'}
            />
          </View>

          {selectedDonutCategoryId ? (
            <View
              style={[
                styles.drilldownBox,
                {
                  backgroundColor: theme.colors.elevated,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.md,
                },
              ]}
            >
              <View style={styles.drilldownHeader}>
                <Text style={[styles.drilldownTitle, { color: theme.colors.text }]}>
                  {categoryMap.get(selectedDonutCategoryId)?.name ?? 'Kategorisiz'} İşlemleri (
                  {selectedCategoryTxs.length})
                </Text>
                <Chip
                  label="Filtreyi Temizle"
                  color={theme.colors.accent}
                  selected
                  icon={<X size={13} color={theme.colors.accent} />}
                  onPress={() => setSelectedDonutCategoryId(null)}
                />
              </View>

              {selectedCategoryTxs.length === 0 ? (
                <Text style={[styles.emptyText, { color: theme.colors.muted }]}>
                  Bu kategoride işlem bulunamadı.
                </Text>
              ) : (
                selectedCategoryTxs.slice(0, 8).map((tx, idx) => (
                  <View
                    key={tx.id}
                    style={[
                      styles.drilldownRow,
                      idx < Math.min(selectedCategoryTxs.length, 8) - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: theme.colors.border,
                      },
                    ]}
                  >
                    <View style={styles.drilldownInfo}>
                      <Text
                        numberOfLines={1}
                        style={[styles.drilldownTxTitle, { color: theme.colors.text }]}
                      >
                        {tx.note?.trim() ||
                          categoryMap.get(selectedDonutCategoryId)?.name ||
                          'İşlem'}
                      </Text>
                      <Text style={[styles.drilldownTxSub, { color: theme.colors.muted }]}>
                        {formatShortDateTr(tx.date)} •{' '}
                        {accountMap.get(tx.accountId)?.name ?? 'Hesap'}
                      </Text>
                    </View>
                    <MoneyText
                      amount={tx.baseAmount}
                      currency={settings.baseCurrency}
                      privacyMode={settings.privacyMode}
                      color={
                        donutType === 'expense'
                          ? theme.colors.expense
                          : theme.colors.income
                      }
                      style={styles.drilldownAmount}
                    />
                  </View>
                ))
              )}
            </View>
          ) : null}
        </Card>

        {/* Chart 4 + Period Comparison Card */}
        <View style={[styles.chartsGrid, isWide && styles.chartsGridWide]}>
          <Card style={isWide ? styles.chartHalf : undefined}>
            <View style={styles.budgetHeaderRow}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
                Bütçe: Planlanan vs Gerçekleşen
              </Text>
              <Text style={[styles.monthTag, { color: theme.colors.muted }]}>
                {activeFiscalMonthKey}
              </Text>
            </View>
            <View style={styles.chartBody}>
              <BudgetProgressBars
                items={budgetItems}
                privacyMode={settings.privacyMode}
                onPressItem={() => router.push('/plan/budgets' as Href)}
              />
            </View>
          </Card>

          <Card style={isWide ? styles.chartHalf : undefined}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              Önceki Dönem Kıyaslaması
            </Text>
            <Text style={[styles.compareSub, { color: theme.colors.muted }]}>
              {formatRangeLabel(prevRange)} ile karşılaştırma
            </Text>

            <View style={styles.moversGroup}>
              <View style={styles.moverSectionHeader}>
                <TrendingUp size={15} color={theme.colors.expense} />
                <Text style={[styles.moverSectionTitle, { color: theme.colors.expense }]}>
                  En Çok Artan Giderler
                </Text>
              </View>
              {movers.topIncreased.length === 0 ? (
                <Text style={[styles.emptyText, { color: theme.colors.muted }]}>
                  Önceki döneme göre artan gider kategorisi yok.
                </Text>
              ) : (
                movers.topIncreased.map((item) => (
                  <View key={item.categoryId} style={styles.moverRow}>
                    <View style={styles.moverLeft}>
                      <View style={[styles.moverDot, { backgroundColor: item.color }]} />
                      <Text
                        numberOfLines={1}
                        style={[styles.moverName, { color: theme.colors.text }]}
                      >
                        {item.name}
                      </Text>
                    </View>
                    <View style={styles.moverRight}>
                      <MoneyText
                        amount={item.deltaAmount}
                        currency={settings.baseCurrency}
                        privacyMode={settings.privacyMode}
                        sign="always"
                        color={theme.colors.expense}
                        style={styles.moverDelta}
                      />
                      <Text
                        style={[
                          styles.moverPct,
                          TABULAR_NUMS_STYLE,
                          { color: theme.colors.expense },
                        ]}
                      >
                        +{formatPercent(item.deltaPct)}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            <View style={styles.moversGroup}>
              <View style={styles.moverSectionHeader}>
                <TrendingDown size={15} color={theme.colors.income} />
                <Text style={[styles.moverSectionTitle, { color: theme.colors.income }]}>
                  En Çok Azalan Giderler
                </Text>
              </View>
              {movers.topDecreased.length === 0 ? (
                <Text style={[styles.emptyText, { color: theme.colors.muted }]}>
                  Önceki döneme göre azalan gider kategorisi yok.
                </Text>
              ) : (
                movers.topDecreased.map((item) => (
                  <View key={item.categoryId} style={styles.moverRow}>
                    <View style={styles.moverLeft}>
                      <View style={[styles.moverDot, { backgroundColor: item.color }]} />
                      <Text
                        numberOfLines={1}
                        style={[styles.moverName, { color: theme.colors.text }]}
                      >
                        {item.name}
                      </Text>
                    </View>
                    <View style={styles.moverRight}>
                      <MoneyText
                        amount={item.deltaAmount}
                        currency={settings.baseCurrency}
                        privacyMode={settings.privacyMode}
                        sign="always"
                        color={theme.colors.income}
                        style={styles.moverDelta}
                      />
                      <Text
                        style={[
                          styles.moverPct,
                          TABULAR_NUMS_STYLE,
                          { color: theme.colors.income },
                        ]}
                      >
                        {formatPercent(item.deltaPct)}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </Card>
        </View>
      </ScrollView>

      <ShareReportModal
        visible={shareModalVisible}
        onClose={() => setShareModalVisible(false)}
        periodType={periodType}
        range={range}
        prevRange={prevRange}
        transactions={scopedTransactions}
        categories={categories}
        budgets={budgets}
        baseCurrency={settings.baseCurrency}
        monthStartDay={settings.monthStartDay}
        rates={ratesMap}
        accounts={accounts}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  shareBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  periodNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 10,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  navBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  rangeLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
  },
  customRangeBox: {
    marginTop: 10,
    gap: 6,
  },
  customInputsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  customInputCol: {
    flex: 1,
    gap: 4,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  dateInput: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  errorHint: {
    fontSize: 12,
    fontWeight: '600',
  },
  accountChipsRow: {
    gap: 8,
    marginTop: 10,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiGridWide: {
    flexWrap: 'nowrap',
  },
  kpiCard: {
    flexGrow: 1,
    flexBasis: '47%',
    gap: 6,
  },
  kpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  kpiTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  kpiSub: {
    fontSize: 11,
  },
  kpiSubBold: {
    fontSize: 11,
    fontWeight: '700',
  },
  deltaBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  deltaText: {
    fontSize: 11,
    fontWeight: '700',
  },
  chartsGrid: {
    gap: 14,
  },
  chartsGridWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  chartHalf: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  chartBody: {
    marginTop: 12,
  },
  donutHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  donutToggleWrap: {
    width: 170,
  },
  drilldownBox: {
    marginTop: 14,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  drilldownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  drilldownTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  drilldownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 8,
  },
  drilldownInfo: {
    flex: 1,
    gap: 2,
  },
  drilldownTxTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  drilldownTxSub: {
    fontSize: 11,
  },
  drilldownAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
  budgetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  monthTag: {
    fontSize: 12,
    fontWeight: '700',
  },
  compareSub: {
    fontSize: 12,
    marginTop: 4,
  },
  moversGroup: {
    marginTop: 14,
    gap: 8,
  },
  moverSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  moverSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  moverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 4,
  },
  moverLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  moverDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  moverName: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  moverRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  moverDelta: {
    fontSize: 13,
    fontWeight: '700',
  },
  moverPct: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 12,
    lineHeight: 18,
  },
});
