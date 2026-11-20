import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Landmark,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { MoneyText } from '@/components/ui/MoneyText';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { convertAmount, ratesListToMap } from '@/domain/currency';
import { computeAccountBalance, computeCreditCardSummary } from '@/domain/ledger';
import { addMoney, roundMoney } from '@/domain/money';
import { parseIsoDate, toIsoDate } from '@/domain/periods';
import type { Account, AccountType, CurrencyCode } from '@/domain/types';
import { useFinanceStore } from '@/store/useFinanceStore';
import { TABULAR_NUMS_STYLE, useResponsiveLayout, useTheme } from '@/theme/theme';

const CURRENCIES: CurrencyCode[] = ['TRY', 'USD', 'EUR', 'GBP', 'XAU'];

const ACCOUNT_TYPES: Array<{ value: AccountType; label: string }> = [
  { value: 'cash', label: 'Nakit' },
  { value: 'bank', label: 'Banka' },
  { value: 'credit_card', label: 'Kredi Kartı' },
  { value: 'investment', label: 'Yatırım' },
];

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Nakit',
  bank: 'Banka',
  credit_card: 'Kredi Kartı',
  investment: 'Yatırım',
};

const ACCOUNT_ICON_BY_TYPE: Record<AccountType, string> = {
  cash: 'wallet',
  bank: 'landmark',
  credit_card: 'credit-card',
  investment: 'trending-up',
};

const COLOR_SWATCHES = [
  '#3B82F6',
  '#10B981',
  '#8B5CF6',
  '#F59E0B',
  '#EF4444',
  '#06B6D4',
  '#EC4899',
  '#14B8A6',
] as const;

function getLocalTodayIso(): string {
  const now = new Date();
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function parseDecimalInput(raw: string, allowZero = false, allowNegative = false): number | null {
  const normalized = raw.trim().replace(/\s+/g, '').replace(',', '.');
  if (!normalized) {
    return allowZero ? 0 : null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (!allowNegative && parsed < 0) {
    return null;
  }
  if (!allowZero && parsed <= 0) {
    return null;
  }
  return roundMoney(parsed);
}

function formatInputDecimal(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  if (value === 0) return '0';
  return String(roundMoney(value)).replace('.', ',');
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

function AccountTypeIcon({ type, color }: { type: AccountType; color: string }) {
  switch (type) {
    case 'cash':
      return <Wallet size={18} color={color} />;
    case 'bank':
      return <Landmark size={18} color={color} />;
    case 'credit_card':
      return <CreditCard size={18} color={color} />;
    case 'investment':
      return <TrendingUp size={18} color={color} />;
  }
}

export default function AccountsScreen() {
  const theme = useTheme();
  const { isWide, contentMaxWidth } = useResponsiveLayout();

  const accounts = useFinanceStore((s) => s.accounts);
  const transactions = useFinanceStore((s) => s.transactions);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);
  const settings = useFinanceStore((s) => s.settings);
  const addAccount = useFinanceStore((s) => s.addAccount);
  const updateAccount = useFinanceStore((s) => s.updateAccount);
  const archiveAccount = useFinanceStore((s) => s.archiveAccount);
  const deleteAccount = useFinanceStore((s) => s.deleteAccount);
  const addTransaction = useFinanceStore((s) => s.addTransaction);

  const todayIso = getLocalTodayIso();
  const ratesMap = useMemo(() => ratesListToMap(exchangeRates), [exchangeRates]);

  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.deletedAt === null && !a.isArchived),
    [accounts],
  );
  const archivedAccounts = useMemo(
    () => accounts.filter((a) => a.deletedAt === null && a.isArchived),
    [accounts],
  );

  const nonCardAccounts = useMemo(
    () => activeAccounts.filter((a) => a.type !== 'credit_card'),
    [activeAccounts],
  );

  const summary = useMemo(() => {
    let totalAssets = 0;
    let totalCardDebt = 0;

    for (const acc of activeAccounts) {
      if (acc.type === 'credit_card') {
        const card = computeCreditCardSummary(acc, transactions, todayIso);
        totalCardDebt = addMoney(
          totalCardDebt,
          convertAmount(card.totalDebt, acc.currency, settings.baseCurrency, ratesMap),
        );
      } else {
        const bal = computeAccountBalance(acc, transactions, todayIso);
        totalAssets = addMoney(
          totalAssets,
          convertAmount(bal, acc.currency, settings.baseCurrency, ratesMap),
        );
      }
    }

    return { totalAssets, totalCardDebt };
  }, [activeAccounts, transactions, todayIso, settings.baseCurrency, ratesMap]);

  const [archivedExpanded, setArchivedExpanded] = useState(false);

  // Account Create / Edit modal state
  const [formVisible, setFormVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [name, setName] = useState('');
  const [accType, setAccType] = useState<AccountType>('bank');
  const [currency, setCurrency] = useState<CurrencyCode>(settings.baseCurrency);
  const [initialBalanceStr, setInitialBalanceStr] = useState('0');
  const [creditLimitStr, setCreditLimitStr] = useState('');
  const [statementDayStr, setStatementDayStr] = useState('15');
  const [dueDayStr, setDueDayStr] = useState('25');
  const [color, setColor] = useState<string>(COLOR_SWATCHES[0]);
  const [formError, setFormError] = useState<string | null>(null);

  // Pay Credit Card modal state
  const [payCardTarget, setPayCardTarget] = useState<Account | null>(null);
  const [paySourceId, setPaySourceId] = useState('');
  const [payAmountStr, setPayAmountStr] = useState('');
  const [payNote, setPayNote] = useState('');
  const [payError, setPayError] = useState<string | null>(null);

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);

  const openCreateModal = () => {
    setEditingAccount(null);
    setName('');
    setAccType('bank');
    setCurrency(settings.baseCurrency);
    setInitialBalanceStr('0');
    setCreditLimitStr('');
    setStatementDayStr('15');
    setDueDayStr('25');
    setColor(COLOR_SWATCHES[0]);
    setFormError(null);
    setFormVisible(true);
  };

  const openEditModal = (account: Account) => {
    setEditingAccount(account);
    setName(account.name);
    setAccType(account.type);
    setCurrency(account.currency);
    setInitialBalanceStr(formatInputDecimal(account.initialBalance));
    setCreditLimitStr(
      account.creditLimit != null ? formatInputDecimal(account.creditLimit) : '',
    );
    setStatementDayStr(account.statementDay != null ? String(account.statementDay) : '15');
    setDueDayStr(account.dueDay != null ? String(account.dueDay) : '25');
    setColor(account.color);
    setFormError(null);
    setFormVisible(true);
  };

  const handleSaveAccount = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Lütfen bir hesap adı girin.');
      return;
    }

    const parsedInitial = parseDecimalInput(
      initialBalanceStr,
      true,
      accType !== 'credit_card',
    );
    if (parsedInitial === null) {
      setFormError(
        accType === 'credit_card'
          ? 'Başlangıç borcu 0 veya pozitif bir sayı olmalıdır.'
          : 'Başlangıç bakiyesi geçerli bir sayı olmalıdır.',
      );
      return;
    }

    let parsedLimit: number | null = null;
    let parsedStatementDay: number | null = null;
    let parsedDueDay: number | null = null;

    if (accType === 'credit_card') {
      const limitVal = parseDecimalInput(creditLimitStr, false, false);
      if (limitVal === null) {
        setFormError('Kredi kartı için 0’dan büyük bir kart limiti girin.');
        return;
      }
      const stDay = Number.parseInt(statementDayStr.trim(), 10);
      const duDay = Number.parseInt(dueDayStr.trim(), 10);
      if (!Number.isInteger(stDay) || stDay < 1 || stDay > 31) {
        setFormError('Hesap kesim günü 1 ile 31 arasında olmalıdır.');
        return;
      }
      if (!Number.isInteger(duDay) || duDay < 1 || duDay > 31) {
        setFormError('Son ödeme günü 1 ile 31 arasında olmalıdır.');
        return;
      }
      parsedLimit = limitVal;
      parsedStatementDay = stDay;
      parsedDueDay = duDay;
    }

    const icon = ACCOUNT_ICON_BY_TYPE[accType];

    if (editingAccount) {
      updateAccount(editingAccount.id, {
        name: trimmedName,
        type: accType,
        currency,
        initialBalance: parsedInitial,
        creditLimit: parsedLimit,
        statementDay: parsedStatementDay,
        dueDay: parsedDueDay,
        color,
        icon,
      });
    } else {
      addAccount({
        name: trimmedName,
        type: accType,
        currency,
        initialBalance: parsedInitial,
        creditLimit: parsedLimit,
        statementDay: parsedStatementDay,
        dueDay: parsedDueDay,
        color,
        icon,
        isArchived: false,
      });
    }

    setFormVisible(false);
  };

  const openPayCardModal = (card: Account) => {
    const cardSummary = computeCreditCardSummary(card, transactions, todayIso);
    const defaultAmt =
      cardSummary.statementDue > 0 ? cardSummary.statementDue : cardSummary.totalDebt;

    setPayCardTarget(card);
    setPaySourceId(nonCardAccounts[0]?.id ?? '');
    setPayAmountStr(defaultAmt > 0 ? formatInputDecimal(defaultAmt) : '');
    setPayNote(`${card.name} kart borcu ödemesi`);
    setPayError(null);
  };

  const paySourceAccount = useMemo(
    () => nonCardAccounts.find((a) => a.id === paySourceId) ?? null,
    [nonCardAccounts, paySourceId],
  );

  const payCardSummary = useMemo(() => {
    if (!payCardTarget) return null;
    return computeCreditCardSummary(payCardTarget, transactions, todayIso);
  }, [payCardTarget, transactions, todayIso]);

  const parsedPayAmount = useMemo(() => parseDecimalInput(payAmountStr, false, false), [payAmountStr]);

  const convertedCardCredit = useMemo(() => {
    if (!payCardTarget || !paySourceAccount || parsedPayAmount === null) {
      return null;
    }
    if (paySourceAccount.currency === payCardTarget.currency) {
      return parsedPayAmount;
    }
    return convertAmount(
      parsedPayAmount,
      paySourceAccount.currency,
      payCardTarget.currency,
      ratesMap,
    );
  }, [payCardTarget, paySourceAccount, parsedPayAmount, ratesMap]);

  const handleConfirmCardPayment = () => {
    if (!payCardTarget) return;
    if (!paySourceAccount) {
      setPayError('Ödeme yapmak için önce bir Nakit veya Banka hesabı seçin.');
      return;
    }
    if (parsedPayAmount === null || parsedPayAmount <= 0) {
      setPayError('Lütfen 0’dan büyük bir ödeme tutarı girin.');
      return;
    }

    const toAmount =
      paySourceAccount.currency === payCardTarget.currency
        ? parsedPayAmount
        : convertAmount(
            parsedPayAmount,
            paySourceAccount.currency,
            payCardTarget.currency,
            ratesMap,
          );

    addTransaction({
      type: 'transfer',
      amount: parsedPayAmount,
      currency: paySourceAccount.currency,
      accountId: paySourceAccount.id,
      toAccountId: payCardTarget.id,
      toAmount,
      categoryId: null,
      date: todayIso,
      note: payNote.trim() || `${payCardTarget.name} kart borcu ödemesi`,
      tags: ['kart-odeme'],
    });

    setPayCardTarget(null);
  };

  const renderAccountCard = (acc: Account) => {
    const balance = computeAccountBalance(acc, transactions, todayIso);
    const isCard = acc.type === 'credit_card';
    const cardSummary = isCard ? computeCreditCardSummary(acc, transactions, todayIso) : null;
    const limit = acc.creditLimit ?? 0;
    const limitUsagePct =
      cardSummary && limit > 0 ? Math.min(100, Math.round((cardSummary.totalDebt / limit) * 100)) : 0;

    return (
      <Card key={acc.id} style={styles.accountCard} padding={16}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <View style={[styles.iconBox, { backgroundColor: `${acc.color}20` }]}>
              <AccountTypeIcon type={acc.type} color={acc.color} />
            </View>
            <View style={styles.cardTitleText}>
              <Text style={[styles.accountName, { color: theme.colors.text }]} numberOfLines={1}>
                {acc.name}
              </Text>
              <Text style={[styles.accountMeta, { color: theme.colors.muted }]}>
                {ACCOUNT_TYPE_LABELS[acc.type]} · {acc.currency}
                {acc.isArchived ? ' · Arşivlendi' : ''}
              </Text>
            </View>
          </View>

          <View style={styles.cardActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Hesabı düzenle"
              onPress={() => openEditModal(acc)}
              style={[styles.iconActionBtn, { backgroundColor: theme.colors.elevated }]}
            >
              <Pencil size={15} color={theme.colors.text} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={acc.isArchived ? 'Arşivden çıkar' : 'Arşivle'}
              onPress={() => archiveAccount(acc.id, !acc.isArchived)}
              style={[styles.iconActionBtn, { backgroundColor: theme.colors.elevated }]}
            >
              {acc.isArchived ? (
                <ArchiveRestore size={15} color={theme.colors.accent} />
              ) : (
                <Archive size={15} color={theme.colors.muted} />
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Hesabı sil"
              onPress={() => setDeleteTarget(acc)}
              style={[styles.iconActionBtn, { backgroundColor: theme.colors.expenseSoft }]}
            >
              <Trash2 size={15} color={theme.colors.expense} />
            </Pressable>
          </View>
        </View>

        {isCard && cardSummary ? (
          <View style={styles.cardBody}>
            <View style={styles.cardMetricsGrid}>
              <View style={styles.metricCell}>
                <Text style={[styles.metricLabel, { color: theme.colors.muted }]}>
                  Toplam Borç
                </Text>
                <MoneyText
                  amount={cardSummary.totalDebt}
                  currency={acc.currency}
                  privacyMode={settings.privacyMode}
                  color={cardSummary.totalDebt > 0 ? theme.colors.expense : theme.colors.text}
                  style={styles.metricValue}
                />
              </View>

              <View style={styles.metricCell}>
                <Text style={[styles.metricLabel, { color: theme.colors.muted }]}>
                  Kullanılabilir Limit
                </Text>
                <MoneyText
                  amount={cardSummary.availableLimit}
                  currency={acc.currency}
                  privacyMode={settings.privacyMode}
                  color={theme.colors.income}
                  style={styles.metricValue}
                />
              </View>

              <View style={styles.metricCell}>
                <Text style={[styles.metricLabel, { color: theme.colors.muted }]}>
                  Ekstre Borcu
                </Text>
                <MoneyText
                  amount={cardSummary.statementDue}
                  currency={acc.currency}
                  privacyMode={settings.privacyMode}
                  color={theme.colors.text}
                  style={styles.metricValue}
                />
              </View>

              <View style={styles.metricCell}>
                <Text style={[styles.metricLabel, { color: theme.colors.muted }]}>
                  Son Ödeme
                </Text>
                <Text style={[styles.metricValue, TABULAR_NUMS_STYLE, { color: theme.colors.text }]}>
                  {formatShortTrDate(cardSummary.nextDueDate)}
                </Text>
              </View>
            </View>

            <View style={styles.limitWrap}>
              <View style={styles.limitHeader}>
                <Text style={[styles.limitHint, { color: theme.colors.muted }]}>
                  Limit Kullanımı (%{limitUsagePct})
                </Text>
                <MoneyText
                  amount={limit}
                  currency={acc.currency}
                  privacyMode={settings.privacyMode}
                  color={theme.colors.muted}
                  style={styles.limitHint}
                />
              </View>
              <View style={[styles.track, { backgroundColor: theme.colors.elevated }]}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${limitUsagePct}%`,
                      backgroundColor:
                        limitUsagePct >= 85
                          ? theme.colors.expense
                          : limitUsagePct >= 60
                            ? theme.colors.warning
                            : acc.color,
                    },
                  ]}
                />
              </View>
            </View>

            {!acc.isArchived ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => openPayCardModal(acc)}
                style={({ pressed }) => [
                  styles.payCardBtn,
                  {
                    backgroundColor: theme.colors.accentSoft,
                    borderColor: theme.colors.accent,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <CreditCard size={15} color={theme.colors.accent} />
                <Text style={[styles.payCardBtnText, { color: theme.colors.accent }]}>
                  Kart Borcu Öde
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.balanceRow}>
            <Text style={[styles.metricLabel, { color: theme.colors.muted }]}>Güncel Bakiye</Text>
            <MoneyText
              amount={balance}
              currency={acc.currency}
              privacyMode={settings.privacyMode}
              color={balance < 0 ? theme.colors.expense : theme.colors.text}
              style={styles.balanceBig}
            />
          </View>
        )}
      </Card>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isWide && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.summaryCard} padding={16}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCol}>
              <Text style={[styles.summaryLabel, { color: theme.colors.muted }]}>
                Toplam Varlık
              </Text>
              <MoneyText
                amount={summary.totalAssets}
                currency={settings.baseCurrency}
                privacyMode={settings.privacyMode}
                color={theme.colors.income}
                style={styles.summaryValue}
              />
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: theme.colors.border }]} />
            <View style={styles.summaryCol}>
              <Text style={[styles.summaryLabel, { color: theme.colors.muted }]}>
                Toplam Kart Borcu
              </Text>
              <MoneyText
                amount={summary.totalCardDebt}
                currency={settings.baseCurrency}
                privacyMode={settings.privacyMode}
                color={theme.colors.expense}
                style={styles.summaryValue}
              />
            </View>
          </View>
        </Card>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Aktif Hesaplar ({activeAccounts.length})
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={openCreateModal}
            style={({ pressed }) => [
              styles.addBtn,
              { backgroundColor: theme.colors.accent, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Plus size={16} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Yeni Hesap</Text>
          </Pressable>
        </View>

        {activeAccounts.length === 0 ? (
          <Card>
            <EmptyState
              title="Henüz aktif hesabınız yok"
              description="Gelir ve giderlerinizi takip etmek için nakit, banka veya kredi kartı hesabı ekleyin."
              actionLabel="Hesap Ekle"
              onAction={openCreateModal}
              icon={<Wallet size={24} color={theme.colors.muted} />}
            />
          </Card>
        ) : (
          <View style={styles.list}>{activeAccounts.map(renderAccountCard)}</View>
        )}

        {archivedAccounts.length > 0 ? (
          <View style={styles.archivedSection}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setArchivedExpanded((prev) => !prev)}
              style={[
                styles.archivedToggle,
                { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
              ]}
            >
              <Text style={[styles.archivedToggleText, { color: theme.colors.muted }]}>
                Arşivlenen Hesaplar ({archivedAccounts.length})
              </Text>
              {archivedExpanded ? (
                <ChevronUp size={18} color={theme.colors.muted} />
              ) : (
                <ChevronDown size={18} color={theme.colors.muted} />
              )}
            </Pressable>

            {archivedExpanded ? (
              <View style={styles.list}>{archivedAccounts.map(renderAccountCard)}</View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {/* Create / Edit Account Modal */}
      <Modal
        visible={formVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFormVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.modalBackdrop, { backgroundColor: theme.colors.overlay }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setFormVisible(false)} />
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                {editingAccount ? 'Hesabı Düzenle' : 'Yeni Hesap Ekle'}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setFormVisible(false)}
                style={[styles.closeBtn, { backgroundColor: theme.colors.elevated }]}
              >
                <X size={18} color={theme.colors.text} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>Hesap Türü</Text>
              <SegmentedControl
                options={ACCOUNT_TYPES}
                value={accType}
                onChange={(val) => {
                  setAccType(val);
                  setFormError(null);
                }}
              />

              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>Hesap Adı</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Örn. Garanti Vadesiz, Bonus Kart"
                placeholderTextColor={theme.colors.muted}
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.elevated,
                    borderColor: theme.colors.border,
                    color: theme.colors.text,
                  },
                ]}
              />

              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>Para Birimi</Text>
              <View style={styles.chipRow}>
                {CURRENCIES.map((code) => (
                  <Chip
                    key={code}
                    label={code}
                    selected={currency === code}
                    onPress={() => setCurrency(code)}
                  />
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                {accType === 'credit_card' ? 'Başlangıç Borcu' : 'Başlangıç Bakiyesi'}
              </Text>
              <TextInput
                value={initialBalanceStr}
                onChangeText={setInitialBalanceStr}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={theme.colors.muted}
                style={[
                  styles.input,
                  TABULAR_NUMS_STYLE,
                  {
                    backgroundColor: theme.colors.elevated,
                    borderColor: theme.colors.border,
                    color: theme.colors.text,
                  },
                ]}
              />

              {accType === 'credit_card' ? (
                <>
                  <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                    Kart Limiti ({currency})
                  </Text>
                  <TextInput
                    value={creditLimitStr}
                    onChangeText={setCreditLimitStr}
                    keyboardType="decimal-pad"
                    placeholder="Örn. 50000"
                    placeholderTextColor={theme.colors.muted}
                    style={[
                      styles.input,
                      TABULAR_NUMS_STYLE,
                      {
                        backgroundColor: theme.colors.elevated,
                        borderColor: theme.colors.border,
                        color: theme.colors.text,
                      },
                    ]}
                  />

                  <View style={styles.twoColRow}>
                    <View style={styles.twoColCell}>
                      <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                        Kesim Günü (1–31)
                      </Text>
                      <TextInput
                        value={statementDayStr}
                        onChangeText={setStatementDayStr}
                        keyboardType="number-pad"
                        placeholder="15"
                        placeholderTextColor={theme.colors.muted}
                        style={[
                          styles.input,
                          TABULAR_NUMS_STYLE,
                          {
                            backgroundColor: theme.colors.elevated,
                            borderColor: theme.colors.border,
                            color: theme.colors.text,
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.twoColCell}>
                      <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                        Son Ödeme (1–31)
                      </Text>
                      <TextInput
                        value={dueDayStr}
                        onChangeText={setDueDayStr}
                        keyboardType="number-pad"
                        placeholder="25"
                        placeholderTextColor={theme.colors.muted}
                        style={[
                          styles.input,
                          TABULAR_NUMS_STYLE,
                          {
                            backgroundColor: theme.colors.elevated,
                            borderColor: theme.colors.border,
                            color: theme.colors.text,
                          },
                        ]}
                      />
                    </View>
                  </View>
                </>
              ) : null}

              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>Renk</Text>
              <View style={styles.swatchRow}>
                {COLOR_SWATCHES.map((hex) => {
                  const selected = color === hex;
                  return (
                    <Pressable
                      key={hex}
                      accessibilityRole="button"
                      onPress={() => setColor(hex)}
                      style={[
                        styles.swatch,
                        {
                          backgroundColor: hex,
                          borderColor: selected ? theme.colors.text : 'transparent',
                          borderWidth: selected ? 3 : 0,
                        },
                      ]}
                    />
                  );
                })}
              </View>

              {formError ? (
                <Text style={[styles.errorText, { color: theme.colors.expense }]}>{formError}</Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={handleSaveAccount}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: theme.colors.accent, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={styles.primaryBtnText}>
                  {editingAccount ? 'Değişiklikleri Kaydet' : 'Hesabı Oluştur'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Pay Credit Card Debt Modal (strictly type: 'transfer') */}
      <Modal
        visible={payCardTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPayCardTarget(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.modalBackdrop, { backgroundColor: theme.colors.overlay }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPayCardTarget(null)} />
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                Kart Borcu Öde
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setPayCardTarget(null)}
                style={[styles.closeBtn, { backgroundColor: theme.colors.elevated }]}
              >
                <X size={18} color={theme.colors.text} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
              {payCardTarget && payCardSummary ? (
                <>
                  <View
                    style={[
                      styles.infoBanner,
                      {
                        backgroundColor: theme.colors.accentSoft,
                        borderColor: theme.colors.accent,
                      },
                    ]}
                  >
                    <Text style={[styles.infoBannerText, { color: theme.colors.text }]}>
                      {payCardTarget.name} kartına yapılan ödeme, hesabınızdan karta Transfer olarak
                      kaydedilir ve aylık gider toplamınızı şişirmez.
                    </Text>
                  </View>

                  <View style={styles.quickFillRow}>
                    {payCardSummary.statementDue > 0 ? (
                      <Chip
                        label={`Ekstre: ${formatInputDecimal(payCardSummary.statementDue)} ${payCardTarget.currency}`}
                        onPress={() => setPayAmountStr(formatInputDecimal(payCardSummary.statementDue))}
                      />
                    ) : null}
                    {payCardSummary.totalDebt > 0 ? (
                      <Chip
                        label={`Toplam: ${formatInputDecimal(payCardSummary.totalDebt)} ${payCardTarget.currency}`}
                        onPress={() => setPayAmountStr(formatInputDecimal(payCardSummary.totalDebt))}
                      />
                    ) : null}
                  </View>

                  <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                    Ödeme Yapılacak Hesap
                  </Text>
                  {nonCardAccounts.length === 0 ? (
                    <Text style={[styles.errorText, { color: theme.colors.expense }]}>
                      Ödeme yapabilmek için önce aktif bir Nakit veya Banka hesabı ekleyin.
                    </Text>
                  ) : (
                    <View style={styles.chipRow}>
                      {nonCardAccounts.map((src) => (
                        <Chip
                          key={src.id}
                          label={`${src.name} (${src.currency})`}
                          selected={paySourceId === src.id}
                          color={src.color}
                          onPress={() => setPaySourceId(src.id)}
                        />
                      ))}
                    </View>
                  )}

                  <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                    Ödeme Tutarı ({paySourceAccount?.currency ?? payCardTarget.currency})
                  </Text>
                  <TextInput
                    value={payAmountStr}
                    onChangeText={setPayAmountStr}
                    keyboardType="decimal-pad"
                    placeholder="0,00"
                    placeholderTextColor={theme.colors.muted}
                    style={[
                      styles.input,
                      TABULAR_NUMS_STYLE,
                      {
                        backgroundColor: theme.colors.elevated,
                        borderColor: theme.colors.border,
                        color: theme.colors.text,
                      },
                    ]}
                  />

                  {paySourceAccount &&
                  paySourceAccount.currency !== payCardTarget.currency &&
                  convertedCardCredit !== null ? (
                    <Text style={[styles.conversionHint, { color: theme.colors.muted }]}>
                      Karta işlenecek tahmini tutar:{' '}
                      <MoneyText
                        amount={convertedCardCredit}
                        currency={payCardTarget.currency}
                        color={theme.colors.text}
                      />
                    </Text>
                  ) : null}

                  <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>Not</Text>
                  <TextInput
                    value={payNote}
                    onChangeText={setPayNote}
                    placeholder="Kart borcu ödemesi"
                    placeholderTextColor={theme.colors.muted}
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.colors.elevated,
                        borderColor: theme.colors.border,
                        color: theme.colors.text,
                      },
                    ]}
                  />

                  {payError ? (
                    <Text style={[styles.errorText, { color: theme.colors.expense }]}>
                      {payError}
                    </Text>
                  ) : null}

                  <Pressable
                    accessibilityRole="button"
                    disabled={nonCardAccounts.length === 0}
                    onPress={handleConfirmCardPayment}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      {
                        backgroundColor: theme.colors.accent,
                        opacity: nonCardAccounts.length === 0 ? 0.5 : pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Text style={styles.primaryBtnText}>Transferi Kaydet</Text>
                  </Pressable>
                </>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmModal
        visible={deleteTarget !== null}
        title="Hesabı Sil"
        message={
          deleteTarget
            ? `"${deleteTarget.name}" hesabını silmek istediğinize emin misiniz? Geçmiş işlemleriniz korunur ancak hesap listeden kaldırılır.`
            : ''
        }
        confirmLabel="Sil"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteAccount(deleteTarget.id);
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
  summaryCard: {
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryCol: {
    flex: 1,
    gap: 4,
  },
  summaryDivider: {
    width: 1,
    height: 36,
    marginHorizontal: 14,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  list: {
    gap: 12,
  },
  accountCard: {
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleText: {
    flex: 1,
    gap: 2,
  },
  accountName: {
    fontSize: 15,
    fontWeight: '800',
  },
  accountMeta: {
    fontSize: 12,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balanceBig: {
    fontSize: 19,
    fontWeight: '800',
  },
  cardBody: {
    gap: 12,
  },
  cardMetricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCell: {
    width: '47%',
    gap: 2,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  limitWrap: {
    gap: 6,
  },
  limitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  limitHint: {
    fontSize: 11,
    fontWeight: '600',
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
  payCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
  },
  payCardBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  archivedSection: {
    gap: 10,
    marginTop: 6,
  },
  archivedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  archivedToggleText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  modalSheet: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    gap: 10,
    paddingBottom: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 10,
  },
  twoColCell: {
    flex: 1,
    gap: 6,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 4,
  },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  infoBanner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  infoBannerText: {
    fontSize: 12,
    lineHeight: 18,
  },
  quickFillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  conversionHint: {
    fontSize: 12,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
