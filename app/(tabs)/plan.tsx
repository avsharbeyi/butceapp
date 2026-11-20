import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type Href, useRouter } from 'expo-router';
import {
  ChevronRight,
  Coins,
  CreditCard,
  HandCoins,
  PiggyBank,
  Repeat,
  Settings,
  Share2,
  Target,
  Wallet,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '@/components/ui/Card';
import { ratesListToMap } from '@/domain/currency';
import { formatMoney } from '@/domain/money';
import { getFiscalMonthKey, toIsoDate } from '@/domain/periods';
import { useFinanceStore } from '@/store/useFinanceStore';
import { TABULAR_NUMS_STYLE, useResponsiveLayout, useTheme } from '@/theme/theme';

interface HubItem {
  id: string;
  route: string;
  title: string;
  subtitle: string;
  badge?: string;
  accentColor: string;
  renderIcon: (color: string) => React.ReactNode;
}

function getLocalTodayIso(): string {
  const now = new Date();
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export default function PlanHubScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isWide, contentMaxWidth } = useResponsiveLayout();

  const accounts = useFinanceStore((s) => s.accounts);
  const budgets = useFinanceStore((s) => s.budgets);
  const installmentPlans = useFinanceStore((s) => s.installmentPlans);
  const recurringRules = useFinanceStore((s) => s.recurringRules);
  const savingsGoals = useFinanceStore((s) => s.savingsGoals);
  const debts = useFinanceStore((s) => s.debts);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);
  const settings = useFinanceStore((s) => s.settings);
  const syncStatus = useFinanceStore((s) => s.syncStatus);

  const todayIso = getLocalTodayIso();
  const currentMonthKey = getFiscalMonthKey(todayIso, settings.monthStartDay);

  const activeAccountsCount = useMemo(
    () => accounts.filter((a) => a.deletedAt === null && !a.isArchived).length,
    [accounts],
  );

  const activeMonthlyBudgetsCount = useMemo(
    () =>
      budgets.filter(
        (b) => b.deletedAt === null && b.month === currentMonthKey,
      ).length,
    [budgets, currentMonthKey],
  );

  const activePlansCount = useMemo(
    () => installmentPlans.filter((p) => p.deletedAt === null).length,
    [installmentPlans],
  );

  const activeRulesCount = useMemo(
    () => recurringRules.filter((r) => r.deletedAt === null && r.isActive).length,
    [recurringRules],
  );

  const activeGoalsCount = useMemo(
    () => savingsGoals.filter((g) => g.deletedAt === null && !g.isCompleted).length,
    [savingsGoals],
  );

  const openDebtsCount = useMemo(
    () => debts.filter((d) => d.deletedAt === null && !d.isSettled).length,
    [debts],
  );

  const usdPreview = useMemo(() => {
    const ratesMap = ratesListToMap(exchangeRates);
    return `1 $ = ${formatMoney(ratesMap.USD, 'TRY', false)}`;
  }, [exchangeRates]);

  const syncLabel =
    syncStatus === 'synced'
      ? 'Bulut Bağlı'
      : syncStatus === 'syncing'
        ? 'Eşitleniyor'
        : syncStatus === 'offline'
          ? 'Çevrimdışı'
          : 'Yerel';

  const hubItems: HubItem[] = [
    {
      id: 'accounts',
      route: '/plan/accounts',
      title: 'Hesaplarım & Kredi Kartları',
      subtitle: 'Nakit, banka, yatırım hesapları ve kart limitleri',
      badge: `${activeAccountsCount} hesap`,
      accentColor: '#3B82F6',
      renderIcon: (color) => <Wallet size={20} color={color} />,
    },
    {
      id: 'budgets',
      route: '/plan/budgets',
      title: 'Bütçe Limitleri',
      subtitle: 'Aylık genel ve kategori bazlı harcama limitleri',
      badge: `${activeMonthlyBudgetsCount} limit`,
      accentColor: '#10B981',
      renderIcon: (color) => <Target size={20} color={color} />,
    },
    {
      id: 'installments',
      route: '/plan/installments',
      title: 'Taksitlerim',
      subtitle: 'Kredi kartı taksit planları ve aylık dağılım',
      badge: `${activePlansCount} plan`,
      accentColor: '#8B5CF6',
      renderIcon: (color) => <CreditCard size={20} color={color} />,
    },
    {
      id: 'recurring',
      route: '/plan/recurring',
      title: 'Düzenli Ödemeler & Abonelikler',
      subtitle: 'Maaş, kira, fatura ve abonelik kuralları',
      badge: `${activeRulesCount} kural`,
      accentColor: '#F59E0B',
      renderIcon: (color) => <Repeat size={20} color={color} />,
    },
    {
      id: 'goals',
      route: '/plan/goals',
      title: 'Birikim Hedefleri / Kumbara',
      subtitle: 'Hedef takibi, para yatırma ve çekme',
      badge: `${activeGoalsCount} hedef`,
      accentColor: '#06B6D4',
      renderIcon: (color) => <PiggyBank size={20} color={color} />,
    },
    {
      id: 'debts',
      route: '/plan/debts',
      title: 'Borç & Alacak Defteri',
      subtitle: 'Kişisel borçlar, alacaklar ve tahsilat geçmişi',
      badge: `${openDebtsCount} açık`,
      accentColor: '#EF4444',
      renderIcon: (color) => <HandCoins size={20} color={color} />,
    },
    {
      id: 'shared-reports',
      route: '/plan/shared-reports',
      title: 'Paylaşılan Raporlarım',
      subtitle: 'Oluşturulan canlı rapor bağlantıları ve iptal yönetimi',
      accentColor: '#6366F1',
      renderIcon: (color) => <Share2 size={20} color={color} />,
    },
    {
      id: 'rates',
      route: '/plan/rates',
      title: 'Döviz & Altın Kurları',
      subtitle: 'Canlı kurlar ve manuel kur sabitleme',
      badge: usdPreview,
      accentColor: '#14B8A6',
      renderIcon: (color) => <Coins size={20} color={color} />,
    },
    {
      id: 'settings',
      route: '/plan/settings',
      title: 'Ayarlar & Bulut Senkronizasyonu',
      subtitle: 'Tema, gizlilik, PIN kilidi, yedekleme ve hesap',
      badge: syncLabel,
      accentColor: '#64748B',
      renderIcon: (color) => <Settings size={20} color={color} />,
    },
  ];

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
        <View style={styles.headerBlock}>
          <Text style={[styles.pageTitle, { color: theme.colors.text }]}>
            Planla & Yönet
          </Text>
          <Text style={[styles.pageSubtitle, { color: theme.colors.muted }]}>
            Hesaplarınızı, bütçelerinizi, hedeflerinizi ve güvenlik ayarlarınızı buradan
            yönetebilirsiniz.
          </Text>
        </View>

        <View style={[styles.grid, isWide && styles.gridWide]}>
          {hubItems.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => router.push(item.route as Href)}
              style={({ pressed }) => [
                isWide ? styles.gridItemWide : styles.gridItemMobile,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Card style={styles.hubCard} padding={16}>
                <View style={styles.cardTopRow}>
                  <View
                    style={[
                      styles.iconCircle,
                      { backgroundColor: `${item.accentColor}20` },
                    ]}
                  >
                    {item.renderIcon(item.accentColor)}
                  </View>

                  <View style={styles.cardRightTop}>
                    {item.badge ? (
                      <View
                        style={[
                          styles.badgePill,
                          { backgroundColor: theme.colors.elevated },
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            TABULAR_NUMS_STYLE,
                            { color: theme.colors.text },
                          ]}
                        >
                          {item.badge}
                        </Text>
                      </View>
                    ) : null}
                    <ChevronRight size={18} color={theme.colors.muted} />
                  </View>
                </View>

                <Text style={[styles.itemTitle, { color: theme.colors.text }]}>
                  {item.title}
                </Text>
                <Text style={[styles.itemSubtitle, { color: theme.colors.muted }]}>
                  {item.subtitle}
                </Text>
              </Card>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 16,
  },
  headerBlock: {
    gap: 4,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  pageSubtitle: {
    fontSize: 13,
    lineHeight: 19,
  },
  grid: {
    gap: 12,
  },
  gridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItemMobile: {
    width: '100%',
  },
  gridItemWide: {
    width: '48.8%',
  },
  hubCard: {
    gap: 8,
    height: '100%',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardRightTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgePill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  itemSubtitle: {
    fontSize: 12,
    lineHeight: 17,
  },
});
