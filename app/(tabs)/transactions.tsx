import React, { useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ArrowLeftRight,
  Camera,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QuickAddModal } from '@/components/QuickAddModal';
import { SpendingCalendar } from '@/components/charts/SpendingCalendar';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { MoneyText } from '@/components/ui/MoneyText';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import {
  computeCalendarDailySummary,
  filterReportTransactions,
} from '@/domain/analytics';
import { addMoney, subMoney } from '@/domain/money';
import { addDays, parseIsoDate, toIsoDate } from '@/domain/periods';
import type { Transaction, TransactionType } from '@/domain/types';
import { useFinanceStore } from '@/store/useFinanceStore';
import { useResponsiveLayout, useTheme } from '@/theme/theme';

type ViewMode = 'list' | 'calendar';
type TypeFilter = 'all' | TransactionType;

const VIEW_OPTIONS: Array<{ value: ViewMode; label: string }> = [
  { value: 'list', label: 'Liste' },
  { value: 'calendar', label: 'Takvim' },
];

const TYPE_FILTER_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: 'Tümü' },
  { value: 'expense', label: 'Gider' },
  { value: 'income', label: 'Gelir' },
  { value: 'transfer', label: 'Transfer' },
];

const ALL_DATES_RANGE = { startDate: '0000-01-01', endDate: '9999-12-31' };

function getLocalTodayIso(): string {
  const now = new Date();
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function formatDateHeader(isoDate: string, todayIso: string, yesterdayIso: string): string {
  try {
    const { year, month, day } = parseIsoDate(isoDate);
    const formatted = new Intl.DateTimeFormat('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));

    if (isoDate === todayIso) return `Bugün • ${formatted}`;
    if (isoDate === yesterdayIso) return `Dün • ${formatted}`;
    return formatted;
  } catch {
    return isoDate;
  }
}

function formatMonthYearTr(year: number, monthIndex0: number): string {
  return new Intl.DateTimeFormat('tr-TR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthIndex0, 1)));
}

export default function TransactionsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isWide, contentMaxWidth } = useResponsiveLayout();

  const transactions = useFinanceStore((s) => s.transactions);
  const accounts = useFinanceStore((s) => s.accounts);
  const categories = useFinanceStore((s) => s.categories);
  const installmentPlans = useFinanceStore((s) => s.installmentPlans);
  const settings = useFinanceStore((s) => s.settings);

  const todayIso = getLocalTodayIso();
  const yesterdayIso = addDays(todayIso, -1);
  const todayParts = parseIsoDate(todayIso);

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const [calYear, setCalYear] = useState(todayParts.year);
  const [calMonthIndex0, setCalMonthIndex0] = useState(todayParts.month - 1);
  const [selectedCalDate, setSelectedCalDate] = useState<string>(todayIso);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [receiptPreviewUri, setReceiptPreviewUri] = useState<string | null>(null);

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const planMap = useMemo(
    () => new Map(installmentPlans.map((p) => [p.id, p])),
    [installmentPlans],
  );

  const visibleAccounts = useMemo(
    () => accounts.filter((a) => a.deletedAt === null),
    [accounts],
  );

  const visibleCategories = useMemo(() => {
    return categories
      .filter((c) => {
        if (c.deletedAt !== null) return false;
        if (typeFilter === 'income' || typeFilter === 'expense') {
          return c.type === typeFilter;
        }
        return true;
      })
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories, typeFilter]);

  const activeFilterCount =
    (typeFilter !== 'all' ? 1 : 0) +
    (accountFilter !== 'all' ? 1 : 0) +
    (categoryFilter !== 'all' ? 1 : 0) +
    (searchQuery.trim().length > 0 ? 1 : 0);

  const resetFilters = () => {
    setTypeFilter('all');
    setAccountFilter('all');
    setCategoryFilter('all');
    setSearchQuery('');
  };

  const filteredTransactions = useMemo(() => {
    const filtered = filterReportTransactions(transactions, ALL_DATES_RANGE, {
      type: typeFilter === 'all' ? undefined : typeFilter,
      accountId: accountFilter === 'all' ? undefined : accountFilter,
      categoryId: categoryFilter === 'all' ? undefined : categoryFilter,
      search: searchQuery.trim() || undefined,
    });
    return filtered
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [transactions, typeFilter, accountFilter, categoryFilter, searchQuery]);

  const groupedByDate = useMemo(() => {
    const groups = new Map<string, { date: string; net: number; items: Transaction[] }>();
    for (const tx of filteredTransactions) {
      const existing = groups.get(tx.date);
      const delta =
        tx.type === 'income'
          ? tx.baseAmount
          : tx.type === 'expense'
            ? -tx.baseAmount
            : 0;
      if (existing) {
        existing.items.push(tx);
        existing.net =
          delta >= 0
            ? addMoney(existing.net, delta)
            : subMoney(existing.net, Math.abs(delta));
      } else {
        groups.set(tx.date, {
          date: tx.date,
          net: delta,
          items: [tx],
        });
      }
    }
    return Array.from(groups.values());
  }, [filteredTransactions]);

  const calendarSummary = useMemo(
    () => computeCalendarDailySummary(filteredTransactions, calYear, calMonthIndex0),
    [filteredTransactions, calYear, calMonthIndex0],
  );

  const selectedDayTransactions = useMemo(
    () => filteredTransactions.filter((t) => t.date === selectedCalDate),
    [filteredTransactions, selectedCalDate],
  );

  const shiftCalendarMonth = (delta: -1 | 1) => {
    const total = calYear * 12 + calMonthIndex0 + delta;
    const nextYear = Math.floor(total / 12);
    const nextMonth0 = ((total % 12) + 12) % 12;
    setCalYear(nextYear);
    setCalMonthIndex0(nextMonth0);
    setSelectedCalDate(toIsoDate(nextYear, nextMonth0 + 1, 1));
  };

  const openCreateModal = () => {
    setEditingTx(null);
    setModalVisible(true);
  };

  const openEditModal = (tx: Transaction) => {
    setEditingTx(tx);
    setModalVisible(true);
  };

  const renderTransactionRow = (tx: Transaction, isLast: boolean) => {
    const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
    const srcAcc = accountMap.get(tx.accountId);
    const dstAcc = tx.toAccountId ? accountMap.get(tx.toAccountId) : undefined;
    const plan = tx.installmentPlanId ? planMap.get(tx.installmentPlanId) : undefined;

    const dotColor =
      tx.type === 'transfer' ? theme.colors.accent : (cat?.color ?? theme.colors.muted);
    const primaryLabel =
      tx.type === 'transfer' ? 'Transfer' : (cat?.name ?? 'Kategorisiz');
    const accountLabel =
      tx.type === 'transfer'
        ? `${srcAcc?.name ?? 'Hesap'} → ${dstAcc?.name ?? 'Hedef'}`
        : (srcAcc?.name ?? 'Hesap');

    const amountColor =
      tx.type === 'income'
        ? theme.colors.income
        : tx.type === 'expense'
          ? theme.colors.expense
          : theme.colors.accent;
    const signedAmount = tx.type === 'expense' ? -tx.amount : tx.amount;

    const installmentLabel = tx.installmentNumber
      ? plan
        ? `${tx.installmentNumber}/${plan.installmentCount}`
        : `${tx.installmentNumber}. Taksit`
      : null;

    return (
      <Pressable
        key={tx.id}
        accessibilityRole="button"
        onPress={() => openEditModal(tx)}
        style={({ pressed }) => [
          styles.txRow,
          !isLast && {
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          },
          { opacity: pressed ? 0.72 : 1 },
        ]}
      >
        <View style={[styles.catBadge, { backgroundColor: `${dotColor}20` }]}>
          {tx.type === 'transfer' ? (
            <ArrowLeftRight size={15} color={dotColor} />
          ) : (
            <View style={[styles.catDot, { backgroundColor: dotColor }]} />
          )}
        </View>

        <View style={styles.txBody}>
          <View style={styles.txTopLine}>
            <Text numberOfLines={1} style={[styles.txCategory, { color: theme.colors.text }]}>
              {primaryLabel}
            </Text>

            {installmentLabel ? (
              <View
                style={[
                  styles.installmentBadge,
                  { backgroundColor: theme.colors.accentSoft },
                ]}
              >
                <Text style={[styles.installmentText, { color: theme.colors.accent }]}>
                  {installmentLabel}
                </Text>
              </View>
            ) : null}

            {tx.receiptUri ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fiş önizlemesi"
                onPress={(e) => {
                  e.stopPropagation();
                  setReceiptPreviewUri(tx.receiptUri ?? null);
                }}
                hitSlop={8}
                style={[styles.receiptBtn, { backgroundColor: theme.colors.elevated }]}
              >
                <Camera size={13} color={theme.colors.accent} />
              </Pressable>
            ) : null}
          </View>

          <Text numberOfLines={1} style={[styles.txAccount, { color: theme.colors.muted }]}>
            {accountLabel}
            {tx.note?.trim() ? ` • ${tx.note.trim()}` : ''}
          </Text>

          {tx.tags.length > 0 ? (
            <View style={styles.tagsRow}>
              {tx.tags.slice(0, 4).map((tag) => (
                <View
                  key={tag}
                  style={[
                    styles.tagPill,
                    { backgroundColor: theme.colors.elevated },
                  ]}
                >
                  <Text style={[styles.tagText, { color: theme.colors.muted }]}>
                    #{tag}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.txAmountCol}>
          <MoneyText
            amount={signedAmount}
            currency={tx.currency}
            privacyMode={settings.privacyMode}
            sign={tx.type === 'transfer' ? 'none' : 'always'}
            color={amountColor}
            style={styles.txAmount}
          />
          {tx.currency !== settings.baseCurrency ? (
            <MoneyText
              amount={tx.type === 'expense' ? -tx.baseAmount : tx.baseAmount}
              currency={settings.baseCurrency}
              privacyMode={settings.privacyMode}
              sign={tx.type === 'transfer' ? 'none' : 'always'}
              color={theme.colors.muted}
              style={styles.txBaseAmount}
            />
          ) : null}
        </View>
      </Pressable>
    );
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
          <Text style={[styles.pageTitle, { color: theme.colors.text }]}>İşlemler</Text>
          <Pressable
            accessibilityRole="button"
            onPress={openCreateModal}
            style={({ pressed }) => [
              styles.addBtn,
              {
                backgroundColor: theme.colors.accent,
                borderRadius: theme.radius.md,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Plus size={16} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Yeni İşlem</Text>
          </Pressable>
        </View>

        <SegmentedControl
          options={VIEW_OPTIONS}
          value={viewMode}
          onChange={setViewMode}
        />

        {/* Search + Filter Bar */}
        <View style={styles.searchRow}>
          <View
            style={[
              styles.searchInputWrap,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
              },
            ]}
          >
            <Search size={16} color={theme.colors.muted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Not veya etiket ara..."
              placeholderTextColor={theme.colors.muted}
              style={[styles.searchInput, { color: theme.colors.text }]}
            />
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                <X size={15} color={theme.colors.muted} />
              </Pressable>
            ) : null}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Filtreleri aç veya kapat"
            onPress={() => setFiltersOpen((prev) => !prev)}
            style={({ pressed }) => [
              styles.filterToggleBtn,
              {
                backgroundColor:
                  filtersOpen || activeFilterCount > 0
                    ? theme.colors.accentSoft
                    : theme.colors.card,
                borderColor:
                  filtersOpen || activeFilterCount > 0
                    ? theme.colors.accent
                    : theme.colors.border,
                borderRadius: theme.radius.md,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <SlidersHorizontal
              size={16}
              color={
                filtersOpen || activeFilterCount > 0
                  ? theme.colors.accent
                  : theme.colors.text
              }
            />
            <Text
              style={[
                styles.filterToggleText,
                {
                  color:
                    filtersOpen || activeFilterCount > 0
                      ? theme.colors.accent
                      : theme.colors.text,
                },
              ]}
            >
              Filtre{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Text>
          </Pressable>
        </View>

        {/* Quick type filter row + collapsible Account/Category chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {TYPE_FILTER_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              selected={typeFilter === opt.value}
              onPress={() => {
                setTypeFilter(opt.value);
                if (opt.value === 'transfer') {
                  setCategoryFilter('all');
                }
              }}
            />
          ))}

          {activeFilterCount > 0 ? (
            <Chip
              label="Temizle"
              color={theme.colors.expense}
              selected
              icon={<X size={13} color={theme.colors.expense} />}
              onPress={resetFilters}
            />
          ) : null}
        </ScrollView>

        {filtersOpen ? (
          <Card padding={12} style={styles.filterPanel}>
            <View style={styles.filterGroup}>
              <Text style={[styles.filterGroupLabel, { color: theme.colors.muted }]}>
                Hesap
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                <Chip
                  label="Tüm Hesaplar"
                  selected={accountFilter === 'all'}
                  onPress={() => setAccountFilter('all')}
                />
                {visibleAccounts.map((acc) => (
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
            </View>

            {typeFilter !== 'transfer' ? (
              <View style={styles.filterGroup}>
                <Text style={[styles.filterGroupLabel, { color: theme.colors.muted }]}>
                  Kategori
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  <Chip
                    label="Tüm Kategoriler"
                    selected={categoryFilter === 'all'}
                    onPress={() => setCategoryFilter('all')}
                  />
                  {visibleCategories.map((cat) => (
                    <Chip
                      key={cat.id}
                      label={cat.name}
                      selected={categoryFilter === cat.id}
                      color={cat.color}
                      onPress={() =>
                        setCategoryFilter((prev) => (prev === cat.id ? 'all' : cat.id))
                      }
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Liste Görünümü */}
        {viewMode === 'list' ? (
          groupedByDate.length === 0 ? (
            <Card>
              <EmptyState
                title="İşlem Bulunamadı"
                description={
                  activeFilterCount > 0
                    ? 'Seçili arama veya filtre kriterlerine uyan işlem yok.'
                    : 'Henüz kayıtlı işlem bulunmuyor. İlk işleminizi hemen ekleyebilirsiniz.'
                }
                actionLabel={activeFilterCount > 0 ? 'Filtreleri Temizle' : 'İlk İşlemi Ekle'}
                onAction={activeFilterCount > 0 ? resetFilters : openCreateModal}
              />
            </Card>
          ) : (
            <View style={styles.groupsList}>
              {groupedByDate.map((group) => (
                <Card key={group.date} padding={14}>
                  <View
                    style={[
                      styles.dayHeader,
                      { borderBottomColor: theme.colors.border },
                    ]}
                  >
                    <Text style={[styles.dayHeaderTitle, { color: theme.colors.text }]}>
                      {formatDateHeader(group.date, todayIso, yesterdayIso)}
                    </Text>
                    <MoneyText
                      amount={group.net}
                      currency={settings.baseCurrency}
                      privacyMode={settings.privacyMode}
                      sign="always"
                      color={
                        group.net > 0
                          ? theme.colors.income
                          : group.net < 0
                            ? theme.colors.expense
                            : theme.colors.muted
                      }
                      style={styles.dayHeaderNet}
                    />
                  </View>

                  <View>
                    {group.items.map((tx, idx) =>
                      renderTransactionRow(tx, idx === group.items.length - 1),
                    )}
                  </View>
                </Card>
              ))}
            </View>
          )
        ) : (
          /* Takvim Görünümü */
          <View style={styles.calendarWrap}>
            <Card>
              <View style={styles.monthSwitcher}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => shiftCalendarMonth(-1)}
                  style={({ pressed }) => [
                    styles.monthBtn,
                    {
                      backgroundColor: theme.colors.elevated,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radius.sm,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <ChevronLeft size={16} color={theme.colors.text} />
                  <Text style={[styles.monthBtnText, { color: theme.colors.text }]}>
                    Önceki Ay
                  </Text>
                </Pressable>

                <Text style={[styles.monthLabel, { color: theme.colors.text }]}>
                  {formatMonthYearTr(calYear, calMonthIndex0)}
                </Text>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => shiftCalendarMonth(1)}
                  style={({ pressed }) => [
                    styles.monthBtn,
                    {
                      backgroundColor: theme.colors.elevated,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radius.sm,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.monthBtnText, { color: theme.colors.text }]}>
                    Sonraki Ay
                  </Text>
                  <ChevronRight size={16} color={theme.colors.text} />
                </Pressable>
              </View>

              <SpendingCalendar
                year={calYear}
                monthIndex0={calMonthIndex0}
                summary={calendarSummary}
                currency={settings.baseCurrency}
                selectedDate={selectedCalDate}
                privacyMode={settings.privacyMode}
                onSelectDate={setSelectedCalDate}
              />
            </Card>

            <Card>
              <View
                style={[
                  styles.dayHeader,
                  { borderBottomColor: theme.colors.border },
                ]}
              >
                <Text style={[styles.dayHeaderTitle, { color: theme.colors.text }]}>
                  {formatDateHeader(selectedCalDate, todayIso, yesterdayIso)}
                </Text>
                {calendarSummary[selectedCalDate] ? (
                  <MoneyText
                    amount={calendarSummary[selectedCalDate].net}
                    currency={settings.baseCurrency}
                    privacyMode={settings.privacyMode}
                    sign="always"
                    color={
                      calendarSummary[selectedCalDate].net >= 0
                        ? theme.colors.income
                        : theme.colors.expense
                    }
                    style={styles.dayHeaderNet}
                  />
                ) : null}
              </View>

              {selectedDayTransactions.length === 0 ? (
                <Text style={[styles.emptyDayText, { color: theme.colors.muted }]}>
                  Seçili gün için kayıtlı işlem bulunmuyor.
                </Text>
              ) : (
                <View>
                  {selectedDayTransactions.map((tx, idx) =>
                    renderTransactionRow(
                      tx,
                      idx === selectedDayTransactions.length - 1,
                    ),
                  )}
                </View>
              )}
            </Card>
          </View>
        )}
      </ScrollView>

      <QuickAddModal
        visible={modalVisible}
        initialTransaction={editingTx}
        onClose={() => {
          setModalVisible(false);
          setEditingTx(null);
        }}
      />

      {/* Receipt Preview Modal */}
      <Modal
        visible={Boolean(receiptPreviewUri)}
        transparent
        animationType="fade"
        onRequestClose={() => setReceiptPreviewUri(null)}
      >
        <View style={[styles.receiptBackdrop, { backgroundColor: theme.colors.overlay }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setReceiptPreviewUri(null)}
          />
          <View
            style={[
              styles.receiptCard,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.xl,
              },
            ]}
          >
            <View style={styles.receiptHeader}>
              <Text style={[styles.receiptTitle, { color: theme.colors.text }]}>
                Fiş / Belge Önizleme
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Önizlemeyi kapat"
                onPress={() => setReceiptPreviewUri(null)}
                style={[styles.receiptCloseBtn, { backgroundColor: theme.colors.elevated }]}
              >
                <X size={18} color={theme.colors.text} />
              </Pressable>
            </View>
            {receiptPreviewUri ? (
              <Image
                source={{ uri: receiptPreviewUri }}
                resizeMode="contain"
                style={styles.receiptImage}
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 12,
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
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 8,
    minHeight: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 8,
  },
  filterToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    minHeight: 42,
  },
  filterToggleText: {
    fontSize: 13,
    fontWeight: '700',
  },
  chipRow: {
    gap: 8,
    paddingVertical: 2,
  },
  filterPanel: {
    gap: 10,
  },
  filterGroup: {
    gap: 6,
  },
  filterGroupLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  groupsList: {
    gap: 12,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    marginBottom: 4,
  },
  dayHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  dayHeaderNet: {
    fontSize: 13,
    fontWeight: '800',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
  },
  catBadge: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
  },
  txBody: {
    flex: 1,
    gap: 3,
  },
  txTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  txCategory: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  installmentBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  installmentText: {
    fontSize: 11,
    fontWeight: '700',
  },
  receiptBtn: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txAccount: {
    fontSize: 12,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 2,
  },
  tagPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  txAmountCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '800',
  },
  txBaseAmount: {
    fontSize: 11,
  },
  calendarWrap: {
    gap: 12,
  },
  monthSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  monthBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  monthBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  monthLabel: {
    fontSize: 15,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  emptyDayText: {
    paddingVertical: 14,
    fontSize: 13,
    textAlign: 'center',
  },
  receiptBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  receiptCard: {
    width: '100%',
    maxWidth: 460,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  receiptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  receiptTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  receiptCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptImage: {
    width: '100%',
    height: 360,
    borderRadius: 12,
  },
});
