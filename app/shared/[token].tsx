import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  Calendar,
  Clock,
  FileQuestion,
  Lock,
  RefreshCw,
  ShieldOff,
  Sparkles,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BudgetProgressBars } from '@/components/charts/BudgetProgressBars';
import { CashFlowAreaChart } from '@/components/charts/CashFlowAreaChart';
import { CategoryDonutChart } from '@/components/charts/CategoryDonutChart';
import { IncomeExpenseBarChart } from '@/components/charts/IncomeExpenseBarChart';
import { Card } from '@/components/ui/Card';
import { MoneyText } from '@/components/ui/MoneyText';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { formatPercent } from '@/domain/money';
import { parseIsoDate } from '@/domain/periods';
import type { PeriodType, SharedReport, TransactionType } from '@/domain/types';
import { fetchPublicSharedReport } from '@/services/sharedReportService';
import { TABULAR_NUMS_STYLE, useResponsiveLayout, useTheme } from '@/theme/theme';

type ViewerState =
  | { status: 'loading' }
  | { status: 'ok'; report: SharedReport }
  | { status: 'revoked' | 'expired' | 'not_found' }
  | { status: 'error'; message: string };

const PERIOD_LABELS: Record<PeriodType, string> = {
  daily: 'Günlük',
  weekly: 'Haftalık',
  monthly: 'Aylık',
  yearly: 'Yıllık',
  custom: 'Özel',
};

const DONUT_TYPE_OPTIONS: Array<{ value: 'expense' | 'income'; label: string }> = [
  { value: 'expense', label: 'Gider' },
  { value: 'income', label: 'Gelir' },
];

const TX_TYPE_LABELS: Record<TransactionType, string> = {
  income: 'Gelir',
  expense: 'Gider',
  transfer: 'Transfer',
};

function formatShortDateTr(isoDateOrTimestamp: string): string {
  try {
    const datePart = isoDateOrTimestamp.slice(0, 10);
    const { year, month, day } = parseIsoDate(datePart);
    return new Intl.DateTimeFormat('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));
  } catch {
    return isoDateOrTimestamp;
  }
}

function formatRangeLabel(startDate: string, endDate: string): string {
  if (startDate === endDate) {
    return formatShortDateTr(startDate);
  }
  return `${formatShortDateTr(startDate)} – ${formatShortDateTr(endDate)}`;
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

export default function PublicSharedReportScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isWide, contentMaxWidth } = useResponsiveLayout();
  const params = useLocalSearchParams<{ token?: string | string[] }>();

  const rawToken = params.token;
  const token = Array.isArray(rawToken) ? (rawToken[0] ?? '') : (rawToken ?? '');

  const [viewerState, setViewerState] = useState<ViewerState>({ status: 'loading' });
  const [donutType, setDonutType] = useState<'expense' | 'income'>('expense');
  const [selectedDonutCategoryId, setSelectedDonutCategoryId] = useState<string | null>(null);

  const loadSharedReport = useCallback(async () => {
    setViewerState({ status: 'loading' });
    setSelectedDonutCategoryId(null);

    try {
      const result = await fetchPublicSharedReport(token);
      if (result.status === 'ok') {
        setViewerState({ status: 'ok', report: result.report });
      } else {
        setViewerState({ status: result.status });
      }
    } catch (err) {
      setViewerState({
        status: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Paylaşılan rapor yüklenirken beklenmeyen bir hata oluştu.',
      });
    }
  }, [token]);

  useEffect(() => {
    void loadSharedReport();
  }, [loadSharedReport]);

  const categoryColorByName = useMemo(() => {
    const map = new Map<string, string>();
    if (viewerState.status !== 'ok') {
      return map;
    }
    const snap = viewerState.report.snapshotJson;
    for (const item of snap.expenseBreakdown) {
      map.set(item.name, item.color);
    }
    for (const item of snap.incomeBreakdown) {
      if (!map.has(item.name)) {
        map.set(item.name, item.color);
      }
    }
    return map;
  }, [viewerState]);

  if (viewerState.status === 'loading') {
    return (
      <View
        style={[
          styles.centeredScreen,
          {
            backgroundColor: theme.colors.background,
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 24,
          },
        ]}
      >
        <Card style={styles.stateCard} padding={28}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <Text style={[styles.stateTitle, { color: theme.colors.text }]}>
            Rapor yükleniyor...
          </Text>
          <Text style={[styles.stateDescription, { color: theme.colors.muted }]}>
            Paylaşılan finansal özet hazırlanıyor.
          </Text>
        </Card>
      </View>
    );
  }

  if (viewerState.status !== 'ok') {
    const stateMeta =
      viewerState.status === 'revoked'
        ? {
            icon: <ShieldOff size={28} color={theme.colors.expense} />,
            iconBg: theme.colors.expenseSoft,
            title: 'Bu Paylaşım İptal Edildi',
            description:
              'Rapor sahibi bu paylaşım bağlantısına erişimi kapattı. Güncel bir rapor için sahibinden yeni bağlantı isteyebilirsiniz.',
          }
        : viewerState.status === 'expired'
          ? {
              icon: <Clock size={28} color={theme.colors.warning} />,
              iconBg: theme.colors.warningSoft,
              title: 'Bu Paylaşımın Süresi Doldu',
              description:
                'Bu rapor bağlantısının geçerlilik süresi sona erdi. Rapor sahibinden yeni bir paylaşım bağlantısı talep edebilirsiniz.',
            }
          : viewerState.status === 'error'
            ? {
                icon: <FileQuestion size={28} color={theme.colors.expense} />,
                iconBg: theme.colors.expenseSoft,
                title: 'Rapor Yüklenemedi',
                description: viewerState.message,
              }
            : {
                icon: <FileQuestion size={28} color={theme.colors.muted} />,
                iconBg: theme.colors.elevated,
                title: 'Rapor Bulunamadı',
                description:
                  'Paylaşım bağlantısı geçersiz, hatalı veya kaldırılmış olabilir. Lütfen bağlantıyı kontrol edin.',
              };

    return (
      <View
        style={[
          styles.centeredScreen,
          {
            backgroundColor: theme.colors.background,
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 24,
          },
        ]}
      >
        <Card style={styles.stateCard} padding={28}>
          <View style={[styles.stateIconCircle, { backgroundColor: stateMeta.iconBg }]}>
            {stateMeta.icon}
          </View>
          <Text style={[styles.stateTitle, { color: theme.colors.text }]}>
            {stateMeta.title}
          </Text>
          <Text style={[styles.stateDescription, { color: theme.colors.muted }]}>
            {stateMeta.description}
          </Text>
          {viewerState.status === 'error' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadSharedReport()}
              style={({ pressed }) => [
                styles.retryBtn,
                {
                  backgroundColor: theme.colors.accent,
                  borderRadius: theme.radius.md,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <RefreshCw size={15} color="#FFFFFF" />
              <Text style={styles.retryBtnText}>Tekrar Dene</Text>
            </Pressable>
          ) : null}
        </Card>
      </View>
    );
  }

  const { report } = viewerState;
  const snapshot = report.snapshotJson;
  const { kpis } = snapshot;
  const donutItems =
    donutType === 'expense' ? snapshot.expenseBreakdown : snapshot.incomeBreakdown;

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 36,
          },
          isWide && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner Header */}
        <Card
          style={[
            styles.bannerCard,
            {
              borderColor: theme.colors.accent,
            },
          ]}
          padding={18}
        >
          <View style={styles.bannerTopPillRow}>
            <View
              style={[
                styles.brandPill,
                { backgroundColor: theme.colors.accentSoft },
              ]}
            >
              <Sparkles size={13} color={theme.colors.accent} />
              <Text style={[styles.brandPillText, { color: theme.colors.accent }]}>
                Bütçe Pro • Salt-Okunur Paylaşılan Rapor
              </Text>
            </View>

            <View
              style={[
                styles.expiryPill,
                {
                  backgroundColor: theme.colors.elevated,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Clock size={12} color={theme.colors.muted} />
              <Text
                style={[
                  styles.expiryPillText,
                  TABULAR_NUMS_STYLE,
                  { color: theme.colors.muted },
                ]}
              >
                {report.expiresAt
                  ? `Son geçerlilik: ${formatShortDateTr(report.expiresAt)}`
                  : 'Süresiz'}
              </Text>
            </View>
          </View>

          <Text style={[styles.reportTitle, { color: theme.colors.text }]}>
            {report.title || snapshot.title}
          </Text>

          <View style={styles.bannerMetaRow}>
            <View
              style={[
                styles.rangeBadge,
                {
                  backgroundColor: theme.colors.elevated,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Calendar size={13} color={theme.colors.accent} />
              <Text
                style={[
                  styles.rangeBadgeText,
                  TABULAR_NUMS_STYLE,
                  { color: theme.colors.text },
                ]}
              >
                {PERIOD_LABELS[snapshot.periodType]} •{' '}
                {formatRangeLabel(snapshot.range.startDate, snapshot.range.endDate)}
              </Text>
            </View>

            <Text
              style={[
                styles.generatedText,
                TABULAR_NUMS_STYLE,
                { color: theme.colors.muted },
              ]}
            >
              Oluşturulma: {formatShortDateTr(snapshot.generatedAt)}
            </Text>
          </View>
        </Card>

        {/* KPI Özet Kartları */}
        <View style={[styles.kpiGrid, isWide && styles.kpiGridWide]}>
          <Card style={[styles.kpiCard, isWide && styles.kpiCardWide]} padding={14}>
            <View style={styles.kpiTopRow}>
              <Text style={[styles.kpiTitle, { color: theme.colors.muted }]}>
                Toplam Gelir
              </Text>
              <DeltaBadge pct={kpis.incomeDeltaPct} />
            </View>
            <MoneyText
              amount={kpis.totalIncome}
              currency={snapshot.baseCurrency}
              privacyMode={false}
              color={theme.colors.income}
              style={styles.kpiValue}
            />
          </Card>

          <Card style={[styles.kpiCard, isWide && styles.kpiCardWide]} padding={14}>
            <View style={styles.kpiTopRow}>
              <Text style={[styles.kpiTitle, { color: theme.colors.muted }]}>
                Toplam Gider
              </Text>
              <DeltaBadge pct={kpis.expenseDeltaPct} invertColor />
            </View>
            <MoneyText
              amount={kpis.totalExpense}
              currency={snapshot.baseCurrency}
              privacyMode={false}
              color={theme.colors.expense}
              style={styles.kpiValue}
            />
          </Card>

          <Card style={[styles.kpiCard, isWide && styles.kpiCardWide]} padding={14}>
            <View style={styles.kpiTopRow}>
              <Text style={[styles.kpiTitle, { color: theme.colors.muted }]}>
                Net Nakit Akışı
              </Text>
              <DeltaBadge pct={kpis.netDeltaPct} />
            </View>
            <MoneyText
              amount={kpis.netCashFlow}
              currency={snapshot.baseCurrency}
              privacyMode={false}
              sign="always"
              color={kpis.netCashFlow >= 0 ? theme.colors.income : theme.colors.expense}
              style={styles.kpiValue}
            />
          </Card>

          <Card style={[styles.kpiCard, isWide && styles.kpiCardWide]} padding={14}>
            <Text style={[styles.kpiTitle, { color: theme.colors.muted }]}>
              Tasarruf Oranı
            </Text>
            <Text
              style={[
                styles.kpiValue,
                TABULAR_NUMS_STYLE,
                {
                  color:
                    kpis.savingsRate >= 0 ? theme.colors.accent : theme.colors.expense,
                },
              ]}
            >
              {formatPercent(kpis.savingsRate)}
            </Text>
          </Card>

          <Card style={[styles.kpiCard, isWide && styles.kpiCardWide]} padding={14}>
            <Text style={[styles.kpiTitle, { color: theme.colors.muted }]}>
              Günlük Ortalama Harcama
            </Text>
            <MoneyText
              amount={kpis.dailyAverageExpense}
              currency={snapshot.baseCurrency}
              privacyMode={false}
              color={theme.colors.text}
              style={styles.kpiValue}
            />
          </Card>
        </View>

        {/* İnteraktif Grafikler (2-column desktop/tablet) */}
        <View style={[styles.chartsGrid, isWide && styles.chartsGridWide]}>
          <Card style={isWide ? styles.chartHalf : undefined}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              Gelir / Gider Karşılaştırması
            </Text>
            <View style={styles.chartBody}>
              <IncomeExpenseBarChart
                series={snapshot.incomeExpenseSeries}
                currency={snapshot.baseCurrency}
                privacyMode={false}
              />
            </View>
          </Card>

          <Card style={isWide ? styles.chartHalf : undefined}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              Kümülatif Nakit Akışı
            </Text>
            <View style={styles.chartBody}>
              <CashFlowAreaChart
                series={snapshot.cumulativeCashFlowSeries}
                currency={snapshot.baseCurrency}
                privacyMode={false}
              />
            </View>
          </Card>
        </View>

        {/* Kategori Donut + Bütçe İlerlemesi */}
        <View style={[styles.chartsGrid, isWide && styles.chartsGridWide]}>
          <Card
            style={
              isWide && snapshot.budgetProgress.length > 0 ? styles.chartHalf : undefined
            }
          >
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
                currency={snapshot.baseCurrency}
                privacyMode={false}
                selectedCategoryId={selectedDonutCategoryId}
                onSelectCategory={(catId) =>
                  setSelectedDonutCategoryId((prev) => (prev === catId ? null : catId))
                }
                centerLabel={donutType === 'expense' ? 'Toplam Gider' : 'Toplam Gelir'}
              />
            </View>
          </Card>

          {snapshot.budgetProgress.length > 0 ? (
            <Card style={isWide ? styles.chartHalf : undefined}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
                Bütçe Durumu
              </Text>
              <View style={styles.chartBody}>
                <BudgetProgressBars
                  items={snapshot.budgetProgress}
                  privacyMode={false}
                />
              </View>
            </Card>
          ) : null}
        </View>

        {/* İşlem Listesi veya Gizlilik Notu */}
        {!report.includeTransactions ? (
          <Card elevated padding={14}>
            <View style={styles.privacyNoteRow}>
              <Lock size={16} color={theme.colors.muted} />
              <Text style={[styles.privacyNoteText, { color: theme.colors.muted }]}>
                Rapor sahibi yalnızca özet ve grafikleri paylaştı.
              </Text>
            </View>
          </Card>
        ) : snapshot.transactions.length > 0 ? (
          <Card>
            <View style={styles.txHeaderRow}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
                İşlem Listesi
              </Text>
              <Text
                style={[
                  styles.txCountText,
                  TABULAR_NUMS_STYLE,
                  { color: theme.colors.muted },
                ]}
              >
                {snapshot.transactions.length} işlem
              </Text>
            </View>

            <View style={styles.txList}>
              {snapshot.transactions.map((tx, idx) => {
                const isIncome = tx.type === 'income';
                const isExpense = tx.type === 'expense';
                const dotColor =
                  categoryColorByName.get(tx.categoryName) ??
                  (isIncome
                    ? theme.colors.income
                    : isExpense
                      ? theme.colors.expense
                      : theme.colors.accent);
                const amountColor = isIncome
                  ? theme.colors.income
                  : isExpense
                    ? theme.colors.expense
                    : theme.colors.text;

                return (
                  <View
                    key={tx.id}
                    style={[
                      styles.txRow,
                      idx < snapshot.transactions.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: theme.colors.border,
                      },
                    ]}
                  >
                    <View style={styles.txLeft}>
                      <View style={[styles.txDot, { backgroundColor: dotColor }]} />
                      <View style={styles.txInfo}>
                        <Text
                          numberOfLines={1}
                          style={[styles.txCategory, { color: theme.colors.text }]}
                        >
                          {tx.categoryName}
                        </Text>
                        <Text
                          style={[
                            styles.txDate,
                            TABULAR_NUMS_STYLE,
                            { color: theme.colors.muted },
                          ]}
                        >
                          {formatShortDateTr(tx.date)} • {TX_TYPE_LABELS[tx.type]}
                        </Text>
                        {report.includeNotes && tx.note ? (
                          <Text
                            numberOfLines={2}
                            style={[styles.txNote, { color: theme.colors.muted }]}
                          >
                            {tx.note}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    <MoneyText
                      amount={isExpense ? -Math.abs(tx.baseAmount) : tx.baseAmount}
                      currency={snapshot.baseCurrency}
                      privacyMode={false}
                      sign={isIncome ? 'always' : 'auto'}
                      color={amountColor}
                      style={styles.txAmount}
                    />
                  </View>
                );
              })}
            </View>
          </Card>
        ) : (
          <Card elevated padding={14}>
            <Text style={[styles.privacyNoteText, { color: theme.colors.muted }]}>
              Bu dönem için paylaşılan işlem kaydı bulunmuyor.
            </Text>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centeredScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  stateCard: {
    width: '100%',
    maxWidth: 440,
    alignItems: 'center',
    gap: 12,
  },
  stateIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  stateDescription: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 6,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 14,
  },
  bannerCard: {
    gap: 10,
  },
  bannerTopPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  brandPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  expiryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  expiryPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  reportTitle: {
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
  },
  bannerMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  rangeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  rangeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  generatedText: {
    fontSize: 12,
    fontWeight: '500',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiGridWide: {
    gap: 12,
  },
  kpiCard: {
    width: '48.4%',
    gap: 6,
  },
  kpiCardWide: {
    width: '18.9%',
    minWidth: 170,
    flexGrow: 1,
  },
  kpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  kpiTitle: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
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
    alignItems: 'stretch',
  },
  chartHalf: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
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
    minWidth: 150,
  },
  privacyNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  privacyNoteText: {
    fontSize: 13,
    fontWeight: '600',
  },
  txHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  txCountText: {
    fontSize: 12,
    fontWeight: '600',
  },
  txList: {
    gap: 2,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
  },
  txLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  txDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  txInfo: {
    flex: 1,
    gap: 2,
  },
  txCategory: {
    fontSize: 14,
    fontWeight: '700',
  },
  txDate: {
    fontSize: 12,
  },
  txNote: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
});
