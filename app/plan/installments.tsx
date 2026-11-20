import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CreditCard, Plus, Trash2 } from 'lucide-react-native';
import { QuickAddModal } from '@/components/QuickAddModal';
import { Card } from '@/components/ui/Card';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { MoneyText } from '@/components/ui/MoneyText';
import { convertAmount, ratesListToMap } from '@/domain/currency';
import { addMoney } from '@/domain/money';
import { getFiscalMonthKey, getFiscalMonthRange, parseIsoDate, toIsoDate } from '@/domain/periods';
import type { InstallmentPlan } from '@/domain/types';
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
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));
  } catch {
    return isoDate;
  }
}

export default function InstallmentsScreen() {
  const theme = useTheme();
  const { isWide, contentMaxWidth } = useResponsiveLayout();

  const installmentPlans = useFinanceStore((s) => s.installmentPlans);
  const transactions = useFinanceStore((s) => s.transactions);
  const accounts = useFinanceStore((s) => s.accounts);
  const categories = useFinanceStore((s) => s.categories);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);
  const settings = useFinanceStore((s) => s.settings);
  const deleteInstallmentPlan = useFinanceStore((s) => s.deleteInstallmentPlan);

  const todayIso = getLocalTodayIso();
  const ratesMap = useMemo(() => ratesListToMap(exchangeRates), [exchangeRates]);

  const currentMonthKey = getFiscalMonthKey(todayIso, settings.monthStartDay);
  const currentMonthRange = useMemo(
    () => getFiscalMonthRange(currentMonthKey, settings.monthStartDay),
    [currentMonthKey, settings.monthStartDay],
  );

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const [quickAddVisible, setQuickAddVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InstallmentPlan | null>(null);

  const planCards = useMemo(() => {
    const activePlans = installmentPlans
      .filter((p) => p.deletedAt === null)
      .slice()
      .sort((a, b) => b.startDate.localeCompare(a.startDate));

    let totalRemainingBase = 0;
    let monthlyBurdenBase = 0;

    const items = activePlans.map((plan) => {
      const planTxs = transactions
        .filter((tx) => tx.deletedAt === null && tx.installmentPlanId === plan.id)
        .sort((a, b) => a.date.localeCompare(b.date));

      const paidTxs = planTxs.filter((tx) => tx.date <= todayIso);
      const remainingTxs = planTxs.filter((tx) => tx.date > todayIso);

      const paidCount = paidTxs.length;
      const totalCount = planTxs.length > 0 ? planTxs.length : plan.installmentCount;
      const remainingAmount = remainingTxs.reduce((sum, tx) => addMoney(sum, tx.amount), 0);
      const perInstallmentAmount =
        planTxs[0]?.amount ?? Math.round((plan.totalAmount / plan.installmentCount) * 100) / 100;

      totalRemainingBase = addMoney(
        totalRemainingBase,
        convertAmount(remainingAmount, plan.currency, settings.baseCurrency, ratesMap),
      );

      for (const tx of planTxs) {
        if (
          tx.date >= currentMonthRange.startDate &&
          tx.date <= currentMonthRange.endDate
        ) {
          monthlyBurdenBase = addMoney(
            monthlyBurdenBase,
            convertAmount(tx.amount, tx.currency, settings.baseCurrency, ratesMap),
          );
        }
      }

      const account = accountMap.get(plan.accountId);
      const category = categoryMap.get(plan.categoryId);
      const pct = totalCount > 0 ? Math.min(100, Math.round((paidCount / totalCount) * 100)) : 0;

      return {
        plan,
        paidCount,
        totalCount,
        remainingAmount,
        perInstallmentAmount,
        pct,
        accountName: account?.name ?? 'Hesap',
        accountColor: account?.color ?? theme.colors.accent,
        categoryName: category?.name ?? 'Kategori',
        categoryColor: category?.color ?? theme.colors.muted,
      };
    });

    return {
      items,
      totalRemainingBase,
      monthlyBurdenBase,
    };
  }, [
    installmentPlans,
    transactions,
    todayIso,
    settings.baseCurrency,
    ratesMap,
    currentMonthRange,
    accountMap,
    categoryMap,
    theme.colors.accent,
    theme.colors.muted,
  ]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isWide && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.kpiCard} padding={16}>
          <View style={styles.kpiRow}>
            <View style={styles.kpiCell}>
              <Text style={[styles.kpiLabel, { color: theme.colors.muted }]}>
                Aktif Taksit Planı
              </Text>
              <Text style={[styles.kpiValue, TABULAR_NUMS_STYLE, { color: theme.colors.text }]}>
                {planCards.items.length}
              </Text>
            </View>

            <View style={[styles.kpiDivider, { backgroundColor: theme.colors.border }]} />

            <View style={styles.kpiCell}>
              <Text style={[styles.kpiLabel, { color: theme.colors.muted }]}>
                Kalan Toplam Borç
              </Text>
              <MoneyText
                amount={planCards.totalRemainingBase}
                currency={settings.baseCurrency}
                privacyMode={settings.privacyMode}
                color={theme.colors.expense}
                style={styles.kpiValue}
              />
            </View>
          </View>

          <View style={[styles.burdenBox, { backgroundColor: theme.colors.elevated }]}>
            <Text style={[styles.kpiLabel, { color: theme.colors.muted }]}>
              Bu Ayki Taksit Yükü
            </Text>
            <MoneyText
              amount={planCards.monthlyBurdenBase}
              currency={settings.baseCurrency}
              privacyMode={settings.privacyMode}
              color={theme.colors.text}
              style={styles.burdenValue}
            />
          </View>
        </Card>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Taksit Planları ({planCards.items.length})
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setQuickAddVisible(true)}
            style={({ pressed }) => [
              styles.addBtn,
              { backgroundColor: theme.colors.accent, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Plus size={16} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Yeni Taksitli Harcama</Text>
          </Pressable>
        </View>

        {planCards.items.length === 0 ? (
          <Card>
            <EmptyState
              title="Aktif taksit planı bulunmuyor"
              description="Kredi kartı ile yaptığınız taksitli harcamaları ekleyerek aylık taksit yükünüzü ve kalan borcunuzu takip edebilirsiniz."
              actionLabel="Yeni Taksitli Harcama"
              onAction={() => setQuickAddVisible(true)}
              icon={<CreditCard size={24} color={theme.colors.muted} />}
            />
          </Card>
        ) : (
          <View style={styles.list}>
            {planCards.items.map((item) => (
              <Card key={item.plan.id} style={styles.planCard} padding={16}>
                <View style={styles.planTopRow}>
                  <View style={styles.planTitleWrap}>
                    <Text style={[styles.planTitle, { color: theme.colors.text }]}>
                      {item.plan.title}
                    </Text>
                    <Text style={[styles.planDate, { color: theme.colors.muted }]}>
                      Başlangıç: {formatShortTrDate(item.plan.startDate)}
                    </Text>
                  </View>

                  <View style={styles.topRightActions}>
                    <View
                      style={[
                        styles.countBadge,
                        { backgroundColor: theme.colors.accentSoft },
                      ]}
                    >
                      <Text
                        style={[
                          styles.countBadgeText,
                          TABULAR_NUMS_STYLE,
                          { color: theme.colors.accent },
                        ]}
                      >
                        {item.paidCount}/{item.totalCount}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Taksit planını sil"
                      onPress={() => setDeleteTarget(item.plan)}
                      style={[styles.deleteBtn, { backgroundColor: theme.colors.expenseSoft }]}
                    >
                      <Trash2 size={15} color={theme.colors.expense} />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.badgeRow}>
                  <View
                    style={[styles.metaBadge, { backgroundColor: `${item.accountColor}20` }]}
                  >
                    <Text style={[styles.metaBadgeText, { color: item.accountColor }]}>
                      {item.accountName}
                    </Text>
                  </View>
                  <View
                    style={[styles.metaBadge, { backgroundColor: `${item.categoryColor}20` }]}
                  >
                    <Text style={[styles.metaBadgeText, { color: item.categoryColor }]}>
                      {item.categoryName}
                    </Text>
                  </View>
                </View>

                <View style={[styles.track, { backgroundColor: theme.colors.elevated }]}>
                  <View
                    style={[
                      styles.fill,
                      {
                        width: `${item.pct}%`,
                        backgroundColor: theme.colors.accent,
                      },
                    ]}
                  />
                </View>

                <View style={styles.metricsRow}>
                  <View style={styles.metricCol}>
                    <Text style={[styles.metricLabel, { color: theme.colors.muted }]}>
                      Aylık Taksit
                    </Text>
                    <MoneyText
                      amount={item.perInstallmentAmount}
                      currency={item.plan.currency}
                      privacyMode={settings.privacyMode}
                      color={theme.colors.text}
                      style={styles.metricValue}
                    />
                  </View>

                  <View style={styles.metricCol}>
                    <Text style={[styles.metricLabel, { color: theme.colors.muted }]}>
                      Kalan Tutar
                    </Text>
                    <MoneyText
                      amount={item.remainingAmount}
                      currency={item.plan.currency}
                      privacyMode={settings.privacyMode}
                      color={
                        item.remainingAmount > 0 ? theme.colors.expense : theme.colors.income
                      }
                      style={styles.metricValue}
                    />
                  </View>

                  <View style={styles.metricCol}>
                    <Text style={[styles.metricLabel, { color: theme.colors.muted }]}>
                      Toplam Tutar
                    </Text>
                    <MoneyText
                      amount={item.plan.totalAmount}
                      currency={item.plan.currency}
                      privacyMode={settings.privacyMode}
                      color={theme.colors.muted}
                      style={styles.metricValue}
                    />
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      <QuickAddModal
        visible={quickAddVisible}
        onClose={() => setQuickAddVisible(false)}
        initialType="expense"
      />

      <ConfirmModal
        visible={deleteTarget !== null}
        title="Taksit Planını Sil"
        message={
          deleteTarget
            ? `"${deleteTarget.title}" taksit planını ve bağlı tüm taksit işlemlerini silmek istiyor musunuz?`
            : ''
        }
        confirmLabel="Sil"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteInstallmentPlan(deleteTarget.id);
          }
          setDeleteTarget(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 36,
    gap: 14,
  },
  kpiCard: {
    gap: 12,
  },
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  kpiCell: {
    flex: 1,
    gap: 4,
  },
  kpiDivider: {
    width: 1,
    height: 36,
    marginHorizontal: 14,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  burdenBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  burdenValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  list: {
    gap: 12,
  },
  planCard: {
    gap: 10,
  },
  planTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  planTitleWrap: {
    flex: 1,
    gap: 2,
  },
  planTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  planDate: {
    fontSize: 12,
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  metaBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  track: {
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  metricCol: {
    flex: 1,
    gap: 2,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
  },
});
