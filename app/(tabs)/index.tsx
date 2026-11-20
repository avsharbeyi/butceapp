import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { type Href, useRouter } from 'expo-router';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CalendarClock,
  Check,
  ChevronRight,
  CreditCard,
  Eye,
  EyeOff,
  Landmark,
  Plus,
  Settings,
  Sparkles,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QuickAddModal } from '@/components/QuickAddModal';
import { BudgetProgressBars } from '@/components/charts/BudgetProgressBars';
import { Card } from '@/components/ui/Card';
import { MoneyText } from '@/components/ui/MoneyText';
import {
  computeBudgetProgress,
  computeEndOfMonthForecast,
  computePeriodKPIs,
} from '@/domain/analytics';
import { convertAmount, ratesListToMap } from '@/domain/currency';
import {
  computeAccountBalance,
  computeCreditCardSummary,
  computeNetWorth,
} from '@/domain/ledger';
import { addMoney, formatPercent, subMoney } from '@/domain/money';
import {
  addDays,
  getFiscalMonthKey,
  getFiscalMonthRange,
  getPreviousPeriodRange,
  parseIsoDate,
  toIsoDate,
} from '@/domain/periods';
import type { AccountType, Transaction } from '@/domain/types';
import { useFinanceStore } from '@/store/useFinanceStore';
import { TABULAR_NUMS_STYLE, useResponsiveLayout, useTheme } from '@/theme/theme';

function getLocalTodayIso(): string {
  const now = new Date();
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function formatShortTrDate(isoDate: string): string {
  try {
    const { year, month, day } = parseIsoDate(isoDate);
    return new Intl.DateTimeFormat('tr-TR', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));
  } catch {
    return isoDate;
  }
}

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Nakit',
  bank: 'Banka',
  credit_card: 'Kredi Kartı',
  investment: 'Yatırım',
};

function AccountTypeIcon({ type, color }: { type: AccountType; color: string }) {
  switch (type) {
    case 'cash':
      return <Wallet size={16} color={color} />;
    case 'bank':
      return <Landmark size={16} color={color} />;
    case 'credit_card':
      return <CreditCard size={16} color={color} />;
    case 'investment':
      return <TrendingUp size={16} color={color} />;
  }
}

export default function DashboardScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isWide, contentMaxWidth } = useResponsiveLayout();

  const accounts = useFinanceStore((s) => s.accounts);
  const categories = useFinanceStore((s) => s.categories);
  const transactions = useFinanceStore((s) => s.transactions);
  const budgets = useFinanceStore((s) => s.budgets);
  const savingsGoals = useFinanceStore((s) => s.savingsGoals);
  const debts = useFinanceStore((s) => s.debts);
  const recurringRules = useFinanceStore((s) => s.recurringRules);
  const pendingApprovals = useFinanceStore((s) => s.pendingApprovals);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);
  const settings = useFinanceStore((s) => s.settings);
  const syncStatus = useFinanceStore((s) => s.syncStatus);
  const updateSettings = useFinanceStore((s) => s.updateSettings);
  const loadDemoData = useFinanceStore((s) => s.loadDemoData);
  const approvePendingRecurring = useFinanceStore((s) => s.approvePendingRecurring);
  const dismissPendingRecurring = useFinanceStore((s) => s.dismissPendingRecurring);

  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  const todayIso = getLocalTodayIso();
  const ratesMap = useMemo(() => ratesListToMap(exchangeRates), [exchangeRates]);

  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.deletedAt === null && !a.isArchived),
    [accounts],
  );

  const isDemoMode = useMemo(
    () =>
      accounts.some((a) => a.deletedAt === null && a.isDemo) ||
      transactions.some((t) => t.deletedAt === null && t.isDemo),
    [accounts, transactions],
  );

  const syncBadge = useMemo(() => {
    if (syncStatus === 'syncing') {
      return { label: 'Eşitleniyor', color: theme.colors.accent, bg: theme.colors.accentSoft };
    }
    if (syncStatus === 'synced') {
      return { label: 'Bulut Bağlı', color: theme.colors.income, bg: theme.colors.incomeSoft };
    }
    if (syncStatus === 'offline') {
      return { label: 'Çevrimdışı', color: theme.colors.warning, bg: theme.colors.warningSoft };
    }
    if (syncStatus === 'error') {
      return { label: 'Eşitleme Hatası', color: theme.colors.expense, bg: theme.colors.expenseSoft };
    }
    if (isDemoMode) {
      return { label: 'Yerel Demo Modu', color: theme.colors.accent, bg: theme.colors.accentSoft };
    }
    return { label: 'Yerel Mod', color: theme.colors.muted, bg: theme.colors.elevated };
  }, [syncStatus, isDemoMode, theme.colors]);

  const netWorthSummary = useMemo(
    () =>
      computeNetWorth({
        accounts,
        goals: savingsGoals,
        debts,
        transactions,
        rates: ratesMap,
        baseCurrency: settings.baseCurrency,
        asOfDate: todayIso,
      }),
    [accounts, savingsGoals, debts, transactions, ratesMap, settings.baseCurrency, todayIso],
  );

  const currentFiscalMonthKey = useMemo(
    () => getFiscalMonthKey(todayIso, settings.monthStartDay),
    [todayIso, settings.monthStartDay],
  );

  const currentMonthRange = useMemo(
    () => getFiscalMonthRange(currentFiscalMonthKey, settings.monthStartDay),
    [currentFiscalMonthKey, settings.monthStartDay],
  );

  const prevMonthRange = useMemo(
    () => getPreviousPeriodRange('monthly', currentMonthRange, settings.monthStartDay),
    [currentMonthRange, settings.monthStartDay],
  );

  const monthlyKpis = useMemo(
    () => computePeriodKPIs(transactions, currentMonthRange, prevMonthRange),
    [transactions, currentMonthRange, prevMonthRange],
  );

  const budgetProgress = useMemo(
    () =>
      computeBudgetProgress(
        budgets,
        transactions,
        categories,
        currentFiscalMonthKey,
        settings.monthStartDay,
        ratesMap,
      ),
    [budgets, transactions, categories, currentFiscalMonthKey, settings.monthStartDay, ratesMap],
  );

  const generalBudgetSummary = useMemo(() => {
    const explicitGeneral = budgetProgress.find((b) => b.budget.categoryId === null);
    if (explicitGeneral) {
      return {
        label: explicitGeneral.categoryName,
        spent: explicitGeneral.spent,
        limit: explicitGeneral.limit,
        pct: explicitGeneral.pct,
        currency: explicitGeneral.budget.currency,
      };
    }

    const categoryItems = budgetProgress.filter((b) => b.budget.categoryId !== null);
    if (categoryItems.length === 0) {
      return null;
    }

    const totalLimit = categoryItems.reduce(
      (sum, item) =>
        addMoney(
          sum,
          convertAmount(item.limit, item.budget.currency, settings.baseCurrency, ratesMap),
        ),
      0,
    );
    const totalSpent = categoryItems.reduce(
      (sum, item) =>
        addMoney(
          sum,
          convertAmount(item.spent, item.budget.currency, settings.baseCurrency, ratesMap),
        ),
      0,
    );
    const pct = totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 1000) / 10 : 0;
    return {
      label: 'Kategori Bütçeleri Toplamı',
      spent: totalSpent,
      limit: totalLimit,
      pct,
      currency: settings.baseCurrency,
    };
  }, [budgetProgress, settings.baseCurrency, ratesMap]);

  const topCategoryBudgets = useMemo(
    () =>
      budgetProgress
        .filter((b) => b.budget.categoryId !== null)
        .slice()
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 3),
    [budgetProgress],
  );

  const eomForecast = useMemo(
    () => computeEndOfMonthForecast(transactions, currentMonthRange, todayIso),
    [transactions, currentMonthRange, todayIso],
  );

  const upcoming7Days = useMemo(() => {
    const endIso = addDays(todayIso, 7);
    const items: Array<{
      id: string;
      kind: 'recurring' | 'card' | 'debt';
      title: string;
      subtitle: string;
      date: string;
      amount: number;
      currency: typeof settings.baseCurrency;
      isIncome: boolean;
      route: string;
    }> = [];

    for (const rule of recurringRules) {
      if (
        rule.deletedAt === null &&
        rule.isActive &&
        rule.nextRunDate >= todayIso &&
        rule.nextRunDate <= endIso
      ) {
        items.push({
          id: `rec-${rule.id}`,
          kind: 'recurring',
          title: rule.title,
          subtitle: 'Düzenli işlem',
          date: rule.nextRunDate,
          amount: rule.amount,
          currency: rule.currency,
          isIncome: rule.type === 'income',
          route: '/plan/recurring',
        });
      }
    }

    for (const acc of activeAccounts) {
      if (acc.type !== 'credit_card') continue;
      const cc = computeCreditCardSummary(acc, transactions, todayIso);
      if (cc.nextDueDate >= todayIso && cc.nextDueDate <= endIso && cc.totalDebt > 0) {
        items.push({
          id: `cc-${acc.id}`,
          kind: 'card',
          title: acc.name,
          subtitle: 'Kredi kartı son ödeme',
          date: cc.nextDueDate,
          amount: cc.statementDue > 0 ? cc.statementDue : cc.totalDebt,
          currency: acc.currency,
          isIncome: false,
          route: '/plan/accounts',
        });
      }
    }

    for (const debt of debts) {
      if (
        debt.deletedAt === null &&
        !debt.isSettled &&
        debt.dueDate &&
        debt.dueDate >= todayIso &&
        debt.dueDate <= endIso
      ) {
        const remaining = Math.max(0, subMoney(debt.totalAmount, debt.paidAmount));
        if (remaining > 0) {
          items.push({
            id: `debt-${debt.id}`,
            kind: 'debt',
            title: debt.personName,
            subtitle: debt.direction === 'owed_to_me' ? 'Alacak vadesi' : 'Borç vadesi',
            date: debt.dueDate,
            amount: remaining,
            currency: debt.currency,
            isIncome: debt.direction === 'owed_to_me',
            route: '/plan/debts',
          });
        }
      }
    }

    return items.sort((a, b) => a.date.localeCompare(b.date));
  }, [recurringRules, activeAccounts, transactions, debts, todayIso, settings.baseCurrency]);

  const recentTransactions = useMemo(
    () =>
      transactions
        .filter((t) => t.deletedAt === null)
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5),
    [transactions],
  );

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

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
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={[styles.appTitle, { color: theme.colors.text }]}>Bütçe Pro</Text>
            <View style={[styles.syncBadge, { backgroundColor: syncBadge.bg }]}>
              <View style={[styles.syncDot, { backgroundColor: syncBadge.color }]} />
              <Text style={[styles.syncBadgeText, { color: syncBadge.color }]}>
                {syncBadge.label}
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={settings.privacyMode ? 'Gizlilik modunu kapat' : 'Gizlilik modunu aç'}
              onPress={() => updateSettings({ privacyMode: !settings.privacyMode })}
              style={({ pressed }) => [
                styles.iconBtn,
                {
                  backgroundColor: settings.privacyMode
                    ? theme.colors.accentSoft
                    : theme.colors.card,
                  borderColor: settings.privacyMode
                    ? theme.colors.accent
                    : theme.colors.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              {settings.privacyMode ? (
                <EyeOff size={18} color={theme.colors.accent} />
              ) : (
                <Eye size={18} color={theme.colors.text} />
              )}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ayarlar"
              onPress={() => router.push('/plan/settings' as Href)}
              style={({ pressed }) => [
                styles.iconBtn,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <Settings size={18} color={theme.colors.text} />
            </Pressable>
          </View>
        </View>

        {/* Empty first-run onboarding */}
        {activeAccounts.length === 0 ? (
          <Card
            style={{
              borderColor: theme.colors.accent,
              backgroundColor: theme.colors.card,
            }}
          >
            <View style={styles.onboardingBox}>
              <View style={[styles.onboardingIcon, { backgroundColor: theme.colors.accentSoft }]}>
                <Sparkles size={22} color={theme.colors.accent} />
              </View>
              <Text style={[styles.onboardingTitle, { color: theme.colors.text }]}>
                Bütçe Pro’ya Hoş Geldiniz
              </Text>
              <Text style={[styles.onboardingDesc, { color: theme.colors.muted }]}>
                Tüm hesaplarınızı, kredi kartlarınızı, bütçelerinizi ve nakit akışınızı tek
                yerden takip etmek için örnek verilerle keşfe çıkın veya ilk hesabınızı ekleyin.
              </Text>
              <View style={styles.onboardingActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => loadDemoData(getLocalTodayIso())}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    {
                      backgroundColor: theme.colors.accent,
                      borderRadius: theme.radius.md,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Sparkles size={16} color="#FFFFFF" />
                  <Text style={styles.primaryBtnText}>Örnek Veriyle Dene</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/plan/accounts' as Href)}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    {
                      backgroundColor: theme.colors.elevated,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radius.md,
                      opacity: pressed ? 0.78 : 1,
                    },
                  ]}
                >
                  <Plus size={16} color={theme.colors.text} />
                  <Text style={[styles.secondaryBtnText, { color: theme.colors.text }]}>
                    İlk Hesabını Ekle
                  </Text>
                </Pressable>
              </View>
            </View>
          </Card>
        ) : null}

        {/* Toplam Net Varlık Kartı (2A) */}
        <Card>
          <View style={styles.netWorthHeader}>
            <View>
              <Text style={[styles.cardEyebrow, { color: theme.colors.muted }]}>
                TOPLAM NET VARLIK
              </Text>
              <MoneyText
                amount={netWorthSummary.netWorth}
                currency={settings.baseCurrency}
                privacyMode={settings.privacyMode}
                style={styles.heroAmount}
              />
            </View>
            <View style={[styles.formulaPill, { backgroundColor: theme.colors.elevated }]}>
              <Text style={[styles.formulaText, { color: theme.colors.muted }]}>
                Varlıklar − Kart Borcu
              </Text>
            </View>
          </View>

          <View style={styles.netWorthSplitRow}>
            <Text style={[styles.splitMeta, { color: theme.colors.muted }]}>
              Varlık + Kumbara:{' '}
              <MoneyText
                amount={addMoney(netWorthSummary.totalAssets, netWorthSummary.totalGoals)}
                currency={settings.baseCurrency}
                privacyMode={settings.privacyMode}
                color={theme.colors.text}
                style={styles.splitMetaBold}
              />
            </Text>
            <Text style={[styles.splitMeta, { color: theme.colors.muted }]}>
              Kart Borcu:{' '}
              <MoneyText
                amount={netWorthSummary.totalCardDebt}
                currency={settings.baseCurrency}
                privacyMode={settings.privacyMode}
                color={
                  netWorthSummary.totalCardDebt > 0
                    ? theme.colors.expense
                    : theme.colors.muted
                }
                style={styles.splitMetaBold}
              />
            </Text>
          </View>

          {/* Monthly Income / Expense / Net Flow pills */}
          <View style={styles.kpiPillsRow}>
            <View
              style={[
                styles.kpiPill,
                {
                  backgroundColor: theme.colors.incomeSoft,
                  borderRadius: theme.radius.md,
                },
              ]}
            >
              <Text style={[styles.kpiPillLabel, { color: theme.colors.income }]}>
                Aylık Gelir
              </Text>
              <MoneyText
                amount={monthlyKpis.totalIncome}
                currency={settings.baseCurrency}
                privacyMode={settings.privacyMode}
                color={theme.colors.income}
                style={styles.kpiPillValue}
              />
            </View>

            <View
              style={[
                styles.kpiPill,
                {
                  backgroundColor: theme.colors.expenseSoft,
                  borderRadius: theme.radius.md,
                },
              ]}
            >
              <Text style={[styles.kpiPillLabel, { color: theme.colors.expense }]}>
                Aylık Gider
              </Text>
              <MoneyText
                amount={monthlyKpis.totalExpense}
                currency={settings.baseCurrency}
                privacyMode={settings.privacyMode}
                color={theme.colors.expense}
                style={styles.kpiPillValue}
              />
            </View>

            <View
              style={[
                styles.kpiPill,
                {
                  backgroundColor: theme.colors.elevated,
                  borderRadius: theme.radius.md,
                },
              ]}
            >
              <Text style={[styles.kpiPillLabel, { color: theme.colors.muted }]}>
                Net Akış
              </Text>
              <MoneyText
                amount={monthlyKpis.netCashFlow}
                currency={settings.baseCurrency}
                privacyMode={settings.privacyMode}
                sign="always"
                color={
                  monthlyKpis.netCashFlow >= 0
                    ? theme.colors.income
                    : theme.colors.expense
                }
                style={styles.kpiPillValue}
              />
            </View>
          </View>

          {/* Separate Borç / Alacak Özeti Row */}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/plan/debts' as Href)}
            style={({ pressed }) => [
              styles.debtSummaryBox,
              {
                backgroundColor: theme.colors.elevated,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <View style={styles.debtHeaderRow}>
              <Text style={[styles.debtSectionTitle, { color: theme.colors.text }]}>
                Borç / Alacak Özeti
              </Text>
              <ChevronRight size={15} color={theme.colors.muted} />
            </View>
            <View style={styles.debtCols}>
              <View style={styles.debtCol}>
                <Text style={[styles.debtColLabel, { color: theme.colors.muted }]}>
                  Alacaklarım
                </Text>
                <MoneyText
                  amount={netWorthSummary.owedToMe}
                  currency={settings.baseCurrency}
                  privacyMode={settings.privacyMode}
                  color={theme.colors.income}
                  style={styles.debtColValue}
                />
              </View>
              <View style={styles.debtCol}>
                <Text style={[styles.debtColLabel, { color: theme.colors.muted }]}>
                  Borçlarım
                </Text>
                <MoneyText
                  amount={netWorthSummary.owedByMe}
                  currency={settings.baseCurrency}
                  privacyMode={settings.privacyMode}
                  color={theme.colors.expense}
                  style={styles.debtColValue}
                />
              </View>
              <View style={styles.debtCol}>
                <Text style={[styles.debtColLabel, { color: theme.colors.muted }]}>
                  Net Durum
                </Text>
                <MoneyText
                  amount={netWorthSummary.netDebtPosition}
                  currency={settings.baseCurrency}
                  privacyMode={settings.privacyMode}
                  sign="always"
                  color={
                    netWorthSummary.netDebtPosition >= 0
                      ? theme.colors.income
                      : theme.colors.expense
                  }
                  style={styles.debtColValue}
                />
              </View>
            </View>
          </Pressable>
        </Card>

        {/* Hesaplarım Yatay Şeridi */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Hesaplarım
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/plan/accounts' as Href)}
              style={styles.linkBtn}
            >
              <Text style={[styles.linkBtnText, { color: theme.colors.accent }]}>
                Yönet
              </Text>
              <ChevronRight size={15} color={theme.colors.accent} />
            </Pressable>
          </View>

          {activeAccounts.length === 0 ? (
            <Card>
              <Text style={[styles.emptyInlineText, { color: theme.colors.muted }]}>
                Henüz aktif hesap bulunmuyor.
              </Text>
            </Card>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.accountsStrip}
            >
              {activeAccounts.map((acc) => {
                const isCard = acc.type === 'credit_card';
                const cardSummary = isCard
                  ? computeCreditCardSummary(acc, transactions, todayIso)
                  : null;
                const balance = computeAccountBalance(acc, transactions, todayIso);
                const limit = acc.creditLimit ?? 0;
                const usedPct =
                  isCard && cardSummary && limit > 0
                    ? Math.min(100, Math.max(0, (cardSummary.totalDebt / limit) * 100))
                    : 0;

                return (
                  <Pressable
                    key={acc.id}
                    accessibilityRole="button"
                    onPress={() => router.push('/plan/accounts' as Href)}
                    style={({ pressed }) => [{ opacity: pressed ? 0.82 : 1 }]}
                  >
                    <Card style={styles.accountCard} padding={14}>
                      <View style={styles.accountTopRow}>
                        <View
                          style={[
                            styles.accountIconCircle,
                            { backgroundColor: `${acc.color}20` },
                          ]}
                        >
                          <AccountTypeIcon type={acc.type} color={acc.color} />
                        </View>
                        <Text
                          style={[styles.accountTypeBadge, { color: theme.colors.muted }]}
                        >
                          {ACCOUNT_TYPE_LABELS[acc.type]}
                        </Text>
                      </View>

                      <Text
                        numberOfLines={1}
                        style={[styles.accountName, { color: theme.colors.text }]}
                      >
                        {acc.name}
                      </Text>

                      <MoneyText
                        amount={balance}
                        currency={acc.currency}
                        privacyMode={settings.privacyMode}
                        color={
                          isCard && balance < 0
                            ? theme.colors.expense
                            : theme.colors.text
                        }
                        style={styles.accountBalance}
                      />

                      {isCard && cardSummary ? (
                        <View style={styles.cardLimitBox}>
                          <View
                            style={[
                              styles.limitTrack,
                              {
                                backgroundColor: theme.colors.elevated,
                                borderRadius: theme.radius.pill,
                              },
                            ]}
                          >
                            <View
                              style={[
                                styles.limitFill,
                                {
                                  width: `${usedPct}%`,
                                  backgroundColor:
                                    usedPct >= 85
                                      ? theme.colors.expense
                                      : theme.colors.accent,
                                  borderRadius: theme.radius.pill,
                                },
                              ]}
                            />
                          </View>
                          <Text
                            numberOfLines={1}
                            style={[styles.limitHint, { color: theme.colors.muted }]}
                          >
                            Kullanılabilir:{' '}
                            <MoneyText
                              amount={cardSummary.availableLimit}
                              currency={acc.currency}
                              privacyMode={settings.privacyMode}
                              color={theme.colors.muted}
                              style={styles.limitHint}
                            />
                          </Text>
                        </View>
                      ) : null}
                    </Card>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* Two-column responsive container on wide screens */}
        <View style={[styles.gridWrap, isWide && styles.gridWrapWide]}>
          {/* Aylık Bütçe Nabzı */}
          <View style={isWide ? styles.gridHalf : undefined}>
            <Card>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  Aylık Bütçe Nabzı
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/plan/budgets' as Href)}
                  style={styles.linkBtn}
                >
                  <Text style={[styles.linkBtnText, { color: theme.colors.accent }]}>
                    Bütçeler
                  </Text>
                  <ChevronRight size={15} color={theme.colors.accent} />
                </Pressable>
              </View>

              {generalBudgetSummary ? (
                <View
                  style={[
                    styles.generalBudgetBox,
                    {
                      backgroundColor: theme.colors.elevated,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radius.md,
                    },
                  ]}
                >
                  <View style={styles.generalBudgetTop}>
                    <Text style={[styles.generalBudgetTitle, { color: theme.colors.text }]}>
                      {generalBudgetSummary.label}
                    </Text>
                    <Text
                      style={[
                        styles.generalBudgetPct,
                        TABULAR_NUMS_STYLE,
                        {
                          color:
                            generalBudgetSummary.pct >= 100
                              ? theme.colors.expense
                              : generalBudgetSummary.pct >= 80
                                ? theme.colors.warning
                                : theme.colors.income,
                        },
                      ]}
                    >
                      {formatPercent(generalBudgetSummary.pct)}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.generalTrack,
                      {
                        backgroundColor: theme.colors.card,
                        borderRadius: theme.radius.pill,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.generalFill,
                        {
                          width: `${Math.min(100, Math.max(0, generalBudgetSummary.pct))}%`,
                          backgroundColor:
                            generalBudgetSummary.pct >= 100
                              ? theme.colors.expense
                              : generalBudgetSummary.pct >= 80
                                ? theme.colors.warning
                                : theme.colors.income,
                          borderRadius: theme.radius.pill,
                        },
                      ]}
                    />
                  </View>

                  <View style={styles.generalAmountsRow}>
                    <MoneyText
                      amount={generalBudgetSummary.spent}
                      currency={generalBudgetSummary.currency}
                      privacyMode={settings.privacyMode}
                      style={styles.generalAmountText}
                    />
                    <Text style={[styles.generalLimitText, { color: theme.colors.muted }]}>
                      / Limit:{' '}
                      <MoneyText
                        amount={generalBudgetSummary.limit}
                        currency={generalBudgetSummary.currency}
                        privacyMode={settings.privacyMode}
                        color={theme.colors.muted}
                        style={styles.generalLimitText}
                      />
                    </Text>
                  </View>
                </View>
              ) : null}

              <View
                style={[
                  styles.forecastRow,
                  {
                    backgroundColor: theme.colors.accentSoft,
                    borderRadius: theme.radius.md,
                  },
                ]}
              >
                <Text style={[styles.forecastText, { color: theme.colors.text }]}>
                  Bu hızla ay sonu tahmini harcama:{' '}
                  <MoneyText
                    amount={eomForecast.projectedTotal}
                    currency={settings.baseCurrency}
                    privacyMode={settings.privacyMode}
                    color={theme.colors.accent}
                    style={styles.forecastAmount}
                  />
                </Text>
              </View>

              {topCategoryBudgets.length > 0 ? (
                <View style={styles.budgetListWrap}>
                  <BudgetProgressBars
                    items={topCategoryBudgets}
                    privacyMode={settings.privacyMode}
                    onPressItem={() => router.push('/plan/budgets' as Href)}
                  />
                </View>
              ) : !generalBudgetSummary ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/plan/budgets' as Href)}
                  style={[
                    styles.emptyPromptBtn,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.elevated,
                      borderRadius: theme.radius.md,
                    },
                  ]}
                >
                  <Text style={[styles.emptyPromptText, { color: theme.colors.accent }]}>
                    Kategori bütçe limiti belirle →
                  </Text>
                </Pressable>
              ) : null}
            </Card>
          </View>

          {/* Yaklaşan Ödemeler & Onay Bekleyenler */}
          <View style={isWide ? styles.gridHalf : undefined}>
            <Card>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  Yaklaşan Ödemeler & Onaylar
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/plan/recurring' as Href)}
                  style={styles.linkBtn}
                >
                  <Text style={[styles.linkBtnText, { color: theme.colors.accent }]}>
                    Tümü
                  </Text>
                  <ChevronRight size={15} color={theme.colors.accent} />
                </Pressable>
              </View>

              {pendingApprovals.length > 0 ? (
                <View style={styles.pendingSection}>
                  <Text style={[styles.subLabel, { color: theme.colors.warning }]}>
                    ONAY BEKLEYEN DÜZENLİ İŞLEMLER
                  </Text>
                  {pendingApprovals.map((item) => (
                    <View
                      key={`${item.rule.id}-${item.dueDate}`}
                      style={[
                        styles.pendingRow,
                        {
                          backgroundColor: theme.colors.warningSoft,
                          borderColor: theme.colors.warning,
                          borderRadius: theme.radius.md,
                        },
                      ]}
                    >
                      <View style={styles.pendingInfo}>
                        <Text
                          numberOfLines={1}
                          style={[styles.pendingTitle, { color: theme.colors.text }]}
                        >
                          {item.rule.title}
                        </Text>
                        <Text style={[styles.pendingMeta, { color: theme.colors.muted }]}>
                          Vade: {formatShortTrDate(item.dueDate)} •{' '}
                          <MoneyText
                            amount={item.rule.amount}
                            currency={item.rule.currency}
                            privacyMode={settings.privacyMode}
                            color={theme.colors.text}
                            style={styles.pendingMeta}
                          />
                        </Text>
                      </View>

                      <View style={styles.pendingActions}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() =>
                            approvePendingRecurring(item.rule.id, item.dueDate)
                          }
                          style={({ pressed }) => [
                            styles.approveBtn,
                            {
                              backgroundColor: theme.colors.income,
                              borderRadius: theme.radius.sm,
                              opacity: pressed ? 0.8 : 1,
                            },
                          ]}
                        >
                          <Check size={14} color="#FFFFFF" />
                          <Text style={styles.approveBtnText}>Onayla</Text>
                        </Pressable>

                        <Pressable
                          accessibilityRole="button"
                          onPress={() =>
                            dismissPendingRecurring(item.rule.id, item.dueDate)
                          }
                          style={({ pressed }) => [
                            styles.skipBtn,
                            {
                              backgroundColor: theme.colors.card,
                              borderColor: theme.colors.border,
                              borderRadius: theme.radius.sm,
                              opacity: pressed ? 0.78 : 1,
                            },
                          ]}
                        >
                          <X size={14} color={theme.colors.muted} />
                          <Text style={[styles.skipBtnText, { color: theme.colors.muted }]}>
                            Atla
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              {upcoming7Days.length > 0 ? (
                <View style={styles.upcomingList}>
                  {upcoming7Days.map((item) => (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      onPress={() => router.push(item.route as Href)}
                      style={({ pressed }) => [
                        styles.upcomingRow,
                        {
                          borderBottomColor: theme.colors.border,
                          opacity: pressed ? 0.75 : 1,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.upcomingIconWrap,
                          { backgroundColor: theme.colors.elevated },
                        ]}
                      >
                        <CalendarClock size={16} color={theme.colors.accent} />
                      </View>
                      <View style={styles.upcomingInfo}>
                        <Text
                          numberOfLines={1}
                          style={[styles.upcomingTitle, { color: theme.colors.text }]}
                        >
                          {item.title}
                        </Text>
                        <Text style={[styles.upcomingSub, { color: theme.colors.muted }]}>
                          {item.subtitle} • {formatShortTrDate(item.date)}
                        </Text>
                      </View>
                      <MoneyText
                        amount={item.amount}
                        currency={item.currency}
                        privacyMode={settings.privacyMode}
                        color={
                          item.isIncome ? theme.colors.income : theme.colors.expense
                        }
                        style={styles.upcomingAmount}
                      />
                    </Pressable>
                  ))}
                </View>
              ) : pendingApprovals.length === 0 ? (
                <Text style={[styles.emptyInlineText, { color: theme.colors.muted }]}>
                  Önümüzdeki 7 gün içinde yaklaşan ödeme veya onay bekleyen işlem yok.
                </Text>
              ) : null}
            </Card>
          </View>
        </View>

        {/* Son İşlemler */}
        <Card>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Son İşlemler
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(tabs)/transactions' as Href)}
              style={styles.linkBtn}
            >
              <Text style={[styles.linkBtnText, { color: theme.colors.accent }]}>
                Tümünü Gör
              </Text>
              <ChevronRight size={15} color={theme.colors.accent} />
            </Pressable>
          </View>

          {recentTransactions.length === 0 ? (
            <Text style={[styles.emptyInlineText, { color: theme.colors.muted }]}>
              Henüz kayıtlı işlem bulunmuyor. Alt menüdeki + düğmesiyle ilk işleminizi ekleyin.
            </Text>
          ) : (
            <View style={styles.recentList}>
              {recentTransactions.map((tx, idx) => {
                const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
                const srcAcc = accountMap.get(tx.accountId);
                const dstAcc = tx.toAccountId ? accountMap.get(tx.toAccountId) : undefined;
                const isLast = idx === recentTransactions.length - 1;

                const title =
                  tx.type === 'transfer'
                    ? `${srcAcc?.name ?? 'Hesap'} → ${dstAcc?.name ?? 'Hedef'}`
                    : (tx.note?.trim() || cat?.name || 'İşlem');

                const subtitle =
                  tx.type === 'transfer'
                    ? `Transfer • ${formatShortTrDate(tx.date)}`
                    : `${cat?.name ?? 'Kategorisiz'} • ${srcAcc?.name ?? 'Hesap'} • ${formatShortTrDate(tx.date)}`;

                const badgeColor =
                  tx.type === 'income'
                    ? theme.colors.income
                    : tx.type === 'expense'
                      ? theme.colors.expense
                      : theme.colors.accent;
                const badgeSoft =
                  tx.type === 'income'
                    ? theme.colors.incomeSoft
                    : tx.type === 'expense'
                      ? theme.colors.expenseSoft
                      : theme.colors.accentSoft;

                const signedAmount = tx.type === 'expense' ? -tx.amount : tx.amount;

                return (
                  <Pressable
                    key={tx.id}
                    accessibilityRole="button"
                    onPress={() => setEditingTx(tx)}
                    style={({ pressed }) => [
                      styles.txRow,
                      !isLast && {
                        borderBottomWidth: 1,
                        borderBottomColor: theme.colors.border,
                      },
                      { opacity: pressed ? 0.72 : 1 },
                    ]}
                  >
                    <View style={[styles.txIconCircle, { backgroundColor: badgeSoft }]}>
                      {tx.type === 'income' ? (
                        <ArrowDownLeft size={16} color={badgeColor} />
                      ) : tx.type === 'expense' ? (
                        <ArrowUpRight size={16} color={badgeColor} />
                      ) : (
                        <ArrowLeftRight size={16} color={badgeColor} />
                      )}
                    </View>

                    <View style={styles.txInfo}>
                      <Text
                        numberOfLines={1}
                        style={[styles.txTitle, { color: theme.colors.text }]}
                      >
                        {title}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[styles.txSub, { color: theme.colors.muted }]}
                      >
                        {subtitle}
                      </Text>
                    </View>

                    <MoneyText
                      amount={signedAmount}
                      currency={tx.currency}
                      privacyMode={settings.privacyMode}
                      sign={tx.type === 'transfer' ? 'none' : 'always'}
                      color={
                        tx.type === 'transfer' ? theme.colors.accent : badgeColor
                      }
                      style={styles.txAmount}
                    />
                  </Pressable>
                );
              })}
            </View>
          )}
        </Card>
      </ScrollView>

      <QuickAddModal
        visible={Boolean(editingTx)}
        initialTransaction={editingTx}
        onClose={() => setEditingTx(null)}
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    flex: 1,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  syncDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  syncBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardingBox: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  onboardingIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardingTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  onboardingDesc: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 460,
  },
  onboardingActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginTop: 4,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  netWorthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    flexWrap: 'wrap',
  },
  cardEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  heroAmount: {
    fontSize: 30,
    fontWeight: '800',
    marginTop: 4,
  },
  formulaPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  formulaText: {
    fontSize: 11,
    fontWeight: '600',
  },
  netWorthSplitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 8,
  },
  splitMeta: {
    fontSize: 12,
  },
  splitMetaBold: {
    fontSize: 12,
    fontWeight: '700',
  },
  kpiPillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  kpiPill: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 3,
  },
  kpiPillLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  kpiPillValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  debtSummaryBox: {
    marginTop: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  debtHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  debtSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  debtCols: {
    flexDirection: 'row',
    gap: 8,
  },
  debtCol: {
    flex: 1,
    gap: 2,
  },
  debtColLabel: {
    fontSize: 11,
  },
  debtColValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  sectionBlock: {
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  linkBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  accountsStrip: {
    gap: 10,
    paddingRight: 8,
  },
  accountCard: {
    width: 190,
    gap: 6,
  },
  accountTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  accountIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountTypeBadge: {
    fontSize: 11,
    fontWeight: '600',
  },
  accountName: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  accountBalance: {
    fontSize: 17,
    fontWeight: '800',
  },
  cardLimitBox: {
    marginTop: 4,
    gap: 4,
  },
  limitTrack: {
    height: 5,
    overflow: 'hidden',
  },
  limitFill: {
    height: '100%',
  },
  limitHint: {
    fontSize: 11,
  },
  gridWrap: {
    gap: 14,
  },
  gridWrapWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  gridHalf: {
    flex: 1,
  },
  generalBudgetBox: {
    marginTop: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  generalBudgetTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  generalBudgetTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  generalBudgetPct: {
    fontSize: 13,
    fontWeight: '800',
  },
  generalTrack: {
    height: 8,
    overflow: 'hidden',
  },
  generalFill: {
    height: '100%',
  },
  generalAmountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  generalAmountText: {
    fontSize: 12,
    fontWeight: '700',
  },
  generalLimitText: {
    fontSize: 12,
  },
  forecastRow: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  forecastText: {
    fontSize: 12,
    lineHeight: 18,
  },
  forecastAmount: {
    fontSize: 13,
    fontWeight: '800',
  },
  budgetListWrap: {
    marginTop: 12,
  },
  emptyPromptBtn: {
    marginTop: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyPromptText: {
    fontSize: 13,
    fontWeight: '700',
  },
  pendingSection: {
    marginTop: 12,
    gap: 8,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  pendingRow: {
    borderWidth: 1,
    padding: 10,
    gap: 8,
  },
  pendingInfo: {
    gap: 2,
  },
  pendingTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  pendingMeta: {
    fontSize: 12,
  },
  pendingActions: {
    flexDirection: 'row',
    gap: 8,
  },
  approveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  approveBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  skipBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  upcomingList: {
    marginTop: 8,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  upcomingIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upcomingInfo: {
    flex: 1,
    gap: 2,
  },
  upcomingTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  upcomingSub: {
    fontSize: 12,
  },
  upcomingAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptyInlineText: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
  },
  recentList: {
    marginTop: 8,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
  },
  txIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txInfo: {
    flex: 1,
    gap: 2,
  },
  txTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  txSub: {
    fontSize: 12,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '800',
  },
});
