import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Calendar,
  Camera,
  ChevronDown,
  ChevronUp,
  Delete,
  Minus,
  PiggyBank,
  Plus,
  Trash2,
  X,
} from 'lucide-react-native';
import {
  buildQuickAddSavePlan,
  getGoalTransferDirection,
} from '@/components/quickAddHelpers';
import { Chip } from '@/components/ui/Chip';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { MoneyText } from '@/components/ui/MoneyText';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { convertAmount, ratesListToMap } from '@/domain/currency';
import { getCurrencySymbol, roundMoney } from '@/domain/money';
import { addDays, getLocalTodayIso, parseIsoDate } from '@/domain/periods';
import { advanceRuleDate } from '@/domain/recurring';
import type { CurrencyCode, Frequency, Transaction, TransactionType } from '@/domain/types';
import { useFinanceStore } from '@/store/useFinanceStore';
import { TABULAR_NUMS_STYLE, useResponsiveLayout, useTheme } from '@/theme/theme';

export interface QuickAddModalProps {
  visible: boolean;
  onClose: () => void;
  initialType?: TransactionType;
  initialTransaction?: Transaction | null;
  defaultAccountId?: string;
}

const CURRENCIES: CurrencyCode[] = ['TRY', 'USD', 'EUR', 'GBP', 'XAU'];

const TYPE_OPTIONS: Array<{ value: TransactionType; label: string }> = [
  { value: 'expense', label: 'Gider' },
  { value: 'income', label: 'Gelir' },
  { value: 'transfer', label: 'Transfer' },
];

const INSTALLMENT_PRESETS = [1, 2, 3, 6, 9, 12, 18, 24] as const;

const FREQUENCY_OPTIONS: Array<{ value: Frequency; label: string }> = [
  { value: 'daily', label: 'Günlük' },
  { value: 'weekly', label: 'Haftalık' },
  { value: 'monthly', label: 'Aylık' },
  { value: 'yearly', label: 'Yıllık' },
];

const NUMPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  [',', '0', 'BACK'],
] as const;

function amountToInputString(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    return '';
  }
  const rounded = roundMoney(amount);
  const fixed = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return fixed.replace('.', ',');
}

function parseAmountInput(raw: string): number {
  const normalized = raw.replace(/\s+/g, '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return roundMoney(parsed);
}

export function QuickAddModal({
  visible,
  onClose,
  initialType = 'expense',
  initialTransaction = null,
  defaultAccountId,
}: QuickAddModalProps) {
  const theme = useTheme();
  const { isWide } = useResponsiveLayout();

  const accounts = useFinanceStore((s) => s.accounts);
  const categories = useFinanceStore((s) => s.categories);
  const savingsGoals = useFinanceStore((s) => s.savingsGoals);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);
  const baseCurrency = useFinanceStore((s) => s.settings.baseCurrency);
  const addTransaction = useFinanceStore((s) => s.addTransaction);
  const updateTransaction = useFinanceStore((s) => s.updateTransaction);
  const deleteTransaction = useFinanceStore((s) => s.deleteTransaction);
  const addInstallmentPlan = useFinanceStore((s) => s.addInstallmentPlan);
  const addRecurringRule = useFinanceStore((s) => s.addRecurringRule);

  const ratesMap = useMemo(() => ratesListToMap(exchangeRates), [exchangeRates]);
  const isEditing = Boolean(initialTransaction);
  const goalDirection = isEditing ? getGoalTransferDirection(initialTransaction) : null;
  const isGoalTransfer = goalDirection !== null;
  const isGoalDeposit = goalDirection === 'deposit';
  const isGoalWithdraw = goalDirection === 'withdraw';

  const linkedGoal = useMemo(
    () =>
      initialTransaction?.goalId
        ? (savingsGoals.find((g) => g.id === initialTransaction.goalId) ?? null)
        : null,
    [initialTransaction?.goalId, savingsGoals],
  );

  const selectableAccounts = useMemo(
    () =>
      accounts.filter(
        (acc) =>
          acc.deletedAt === null &&
          (!acc.isArchived ||
            acc.id === initialTransaction?.accountId ||
            acc.id === initialTransaction?.toAccountId),
      ),
    [accounts, initialTransaction],
  );

  const [txType, setTxType] = useState<TransactionType>(initialType);
  const [amountStr, setAmountStr] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(baseCurrency);
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [toAmountStr, setToAmountStr] = useState('');
  const [toAmountTouched, setToAmountTouched] = useState(false);
  const [categoryId, setCategoryId] = useState<string>('');
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [date, setDate] = useState(() => getLocalTodayIso());
  const [note, setNote] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [installmentCount, setInstallmentCount] = useState(1);
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<Frequency>('monthly');
  const [recurringAutoCreate, setRecurringAutoCreate] = useState(true);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);

  const filteredCategories = useMemo(() => {
    if (txType === 'transfer') {
      return [];
    }
    return categories
      .filter((c) => c.deletedAt === null && c.type === txType)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories, txType]);

  const selectableAccountsRef = useRef(selectableAccounts);
  selectableAccountsRef.current = selectableAccounts;
  const ratesMapRef = useRef(ratesMap);
  ratesMapRef.current = ratesMap;
  const linkedGoalRef = useRef(linkedGoal);
  linkedGoalRef.current = linkedGoal;

  useEffect(() => {
    if (!visible) {
      return;
    }

    setErrorMsg(null);
    setConfirmDeleteVisible(false);

    if (initialTransaction) {
      const initGoalDir = getGoalTransferDirection(initialTransaction);
      const currentGoal = linkedGoalRef.current;
      const initTargetAcc = selectableAccountsRef.current.find(
        (a) => a.id === initialTransaction.toAccountId,
      );
      const targetCurr =
        initGoalDir === 'deposit' ? currentGoal?.currency : initTargetAcc?.currency;
      const expectedAuto =
        targetCurr != null
          ? convertAmount(
              initialTransaction.amount,
              initialTransaction.currency,
              targetCurr,
              ratesMapRef.current,
            )
          : null;
      const hasCustomToAmount =
        initialTransaction.toAmount != null &&
        expectedAuto != null &&
        initialTransaction.toAmount !== expectedAuto;

      setTxType(initialTransaction.type);
      setAmountStr(amountToInputString(initialTransaction.amount));
      setCurrency(initialTransaction.currency);
      setAccountId(initialTransaction.accountId);
      setToAccountId(initialTransaction.toAccountId ?? '');
      setToAmountStr(
        hasCustomToAmount && initialTransaction.toAmount != null
          ? amountToInputString(initialTransaction.toAmount)
          : '',
      );
      setToAmountTouched(hasCustomToAmount);
      setCategoryId(initialTransaction.categoryId ?? '');
      setDate(initialTransaction.date);
      setNote(initialTransaction.note ?? '');
      setTagsText(initialTransaction.tags.join(', '));
      setReceiptUri(initialTransaction.receiptUri ?? null);
      setInstallmentCount(1);
      setRecurringEnabled(false);
      setDetailsExpanded(
        Boolean(
          initialTransaction.note ||
            initialTransaction.tags.length > 0 ||
            initialTransaction.receiptUri,
        ),
      );
      return;
    }

    const currentAccounts = selectableAccountsRef.current;
    const firstAcc =
      currentAccounts.find((a) => a.id === defaultAccountId) ?? currentAccounts[0];
    const secondAcc = currentAccounts.find((a) => a.id !== firstAcc?.id);

    setTxType(initialType);
    setAmountStr('');
    setCurrency(firstAcc?.currency ?? baseCurrency);
    setAccountId(firstAcc?.id ?? '');
    setToAccountId(secondAcc?.id ?? '');
    setToAmountStr('');
    setToAmountTouched(false);
    setCategoryId('');
    setDate(getLocalTodayIso());
    setNote('');
    setTagsText('');
    setInstallmentCount(1);
    setRecurringEnabled(false);
    setRecurringFrequency('monthly');
    setRecurringAutoCreate(true);
    setReceiptUri(null);
    setDetailsExpanded(false);
  }, [visible, initialTransaction, initialType, defaultAccountId, baseCurrency]);

  useEffect(() => {
    if (txType === 'transfer') {
      if (categoryId !== '') {
        setCategoryId('');
      }
      return;
    }

    const matchesCurrent = filteredCategories.some((c) => c.id === categoryId);
    if (!matchesCurrent) {
      setCategoryId(filteredCategories[0]?.id ?? '');
    }
  }, [txType, filteredCategories, categoryId]);

  const numericAmount = useMemo(() => parseAmountInput(amountStr), [amountStr]);

  const sourceAccount = useMemo(
    () => selectableAccounts.find((a) => a.id === accountId) ?? null,
    [selectableAccounts, accountId],
  );
  const targetAccount = useMemo(
    () => selectableAccounts.find((a) => a.id === toAccountId) ?? null,
    [selectableAccounts, toAccountId],
  );

  const estimatedBaseAmount = useMemo(() => {
    if (numericAmount <= 0 || currency === baseCurrency) {
      return null;
    }
    return convertAmount(numericAmount, currency, baseCurrency, ratesMap);
  }, [numericAmount, currency, baseCurrency, ratesMap]);

  const suggestedTargetAmount = useMemo(() => {
    if (txType !== 'transfer' || numericAmount <= 0) {
      return 0;
    }
    if (isGoalDeposit) {
      if (!linkedGoal || linkedGoal.currency === currency) {
        return 0;
      }
      return convertAmount(numericAmount, currency, linkedGoal.currency, ratesMap);
    }
    if (!targetAccount) {
      return 0;
    }
    return convertAmount(numericAmount, currency, targetAccount.currency, ratesMap);
  }, [txType, numericAmount, currency, targetAccount, isGoalDeposit, linkedGoal, ratesMap]);

  const handleSelectType = (nextType: TransactionType) => {
    setTxType(nextType);
    setErrorMsg(null);
    if (nextType !== 'expense') {
      setInstallmentCount(1);
    }
    if (nextType === 'transfer') {
      setRecurringEnabled(false);
    }
  };

  const handleNumpadPress = (key: string) => {
    setErrorMsg(null);
    if (key === 'BACK') {
      setAmountStr((prev) => prev.slice(0, -1));
      return;
    }
    if (key === ',') {
      setAmountStr((prev) => {
        if (prev.includes(',')) return prev;
        return prev === '' ? '0,' : `${prev},`;
      });
      return;
    }
    setAmountStr((prev) => {
      if (prev === '0') {
        return key;
      }
      const commaIdx = prev.indexOf(',');
      if (commaIdx >= 0 && prev.length - commaIdx > 2) {
        return prev;
      }
      if (prev.length >= 12) {
        return prev;
      }
      return `${prev}${key}`;
    });
  };

  const handlePickReceipt = async () => {
    setErrorMsg(null);
    try {
      const ImagePicker = await import('expo-image-picker');
      if (Platform.OS !== 'web') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          setErrorMsg('Fiş seçmek için galeri erişim izni gerekiyor.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setReceiptUri(result.assets[0].uri);
      }
    } catch {
      setErrorMsg('Fiş fotoğrafı seçilirken bir hata oluştu.');
    }
  };

  const handleSave = () => {
    setErrorMsg(null);

    try {
      parseIsoDate(date.trim());
    } catch {
      setErrorMsg('Lütfen YYYY-AA-GG biçiminde geçerli bir tarih girin.');
      return;
    }

    const cleanDate = date.trim();
    const cleanNote = note.trim();
    const parsedTags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const toAmountOverride =
      toAmountTouched && toAmountStr.trim() ? parseAmountInput(toAmountStr) : null;

    const savePlan = buildQuickAddSavePlan({
      isEditing,
      initialTransaction,
      linkedGoal,
      txType,
      numericAmount,
      currency,
      accountId,
      toAccountId,
      targetAccountCurrency: targetAccount?.currency ?? null,
      toAmountOverride,
      categoryId,
      cleanDate,
      cleanNote,
      parsedTags,
      receiptUri,
      ratesMap,
    });

    if (!savePlan.ok) {
      setErrorMsg(savePlan.error);
      return;
    }

    if (savePlan.mode === 'update') {
      updateTransaction(savePlan.id, savePlan.patch);
      onClose();
      return;
    }

    if (txType === 'expense' && installmentCount >= 2) {
      const catName =
        filteredCategories.find((c) => c.id === categoryId)?.name ?? 'Taksitli Harcama';
      addInstallmentPlan({
        title: cleanNote || catName,
        accountId,
        categoryId,
        totalAmount: numericAmount,
        currency,
        installmentCount,
        startDate: cleanDate,
        note: cleanNote || undefined,
      });
      onClose();
      return;
    }

    let recurringRuleId: string | null = null;
    if (recurringEnabled && (txType === 'income' || txType === 'expense')) {
      const catName =
        filteredCategories.find((c) => c.id === categoryId)?.name ?? 'Düzenli İşlem';
      const anchorDay = parseIsoDate(cleanDate).day;
      const rule = addRecurringRule({
        title: cleanNote || catName,
        type: txType,
        amount: numericAmount,
        currency,
        accountId,
        categoryId,
        frequency: recurringFrequency,
        nextRunDate: advanceRuleDate(cleanDate, recurringFrequency, anchorDay),
        autoCreate: recurringAutoCreate,
        remindDaysBefore: 2,
        isActive: true,
      });
      recurringRuleId = rule.id;
    }

    addTransaction({
      ...savePlan.txInput,
      tags: recurringRuleId
        ? Array.from(new Set([...savePlan.txInput.tags, 'tekrar']))
        : savePlan.txInput.tags,
      recurringRuleId,
    });

    onClose();
  };

  const handleConfirmDelete = () => {
    if (initialTransaction) {
      deleteTransaction(initialTransaction.id);
    }
    setConfirmDeleteVisible(false);
    onClose();
  };

  const todayIso = getLocalTodayIso();
  const yesterdayIso = addDays(todayIso, -1);

  const typeAccent =
    txType === 'income'
      ? theme.colors.income
      : txType === 'expense'
        ? theme.colors.expense
        : theme.colors.accent;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[
          styles.backdrop,
          {
            backgroundColor: theme.colors.overlay,
            justifyContent: isWide ? 'center' : 'flex-end',
          },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              borderRadius: isWide ? theme.radius.xl : 0,
              borderTopLeftRadius: theme.radius.xl,
              borderTopRightRadius: theme.radius.xl,
              maxWidth: isWide ? 580 : '100%',
              maxHeight: isWide ? '92%' : '94%',
            },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
              {isEditing ? 'İşlemi Düzenle' : 'Hızlı İşlem Ekle'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Kapat"
              onPress={onClose}
              hitSlop={10}
              style={[styles.closeBtn, { backgroundColor: theme.colors.elevated }]}
            >
              <X size={18} color={theme.colors.text} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {isGoalTransfer ? (
              <View
                style={[
                  styles.goalBadge,
                  {
                    backgroundColor: theme.colors.accentSoft,
                    borderColor: theme.colors.accent,
                    borderRadius: theme.radius.md,
                  },
                ]}
              >
                <PiggyBank size={18} color={theme.colors.accent} />
                <View style={styles.goalBadgeTextWrap}>
                  <Text style={[styles.goalBadgeTitle, { color: theme.colors.text }]}>
                    Kumbara: {linkedGoal?.name ?? 'Birikim Hedefi'}
                  </Text>
                  <Text style={[styles.goalBadgeSub, { color: theme.colors.muted }]}>
                    {isGoalDeposit ? 'Hesaptan Kumbaraya Aktarım' : 'Kumbaradan Hesaba Çekim'}
                  </Text>
                </View>
              </View>
            ) : (
              <SegmentedControl
                options={TYPE_OPTIONS}
                value={txType}
                onChange={handleSelectType}
              />
            )}

            <View
              style={[
                styles.amountCard,
                {
                  backgroundColor: theme.colors.elevated,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.lg,
                },
              ]}
            >
              <View style={styles.amountDisplayRow}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.amountDisplay,
                    TABULAR_NUMS_STYLE,
                    { color: amountStr ? typeAccent : theme.colors.muted },
                  ]}
                >
                  {amountStr || '0,00'} {getCurrencySymbol(currency)}
                </Text>
                {amountStr ? (
                  <Pressable onPress={() => setAmountStr('')} hitSlop={8}>
                    <Text style={[styles.clearText, { color: theme.colors.muted }]}>
                      Temizle
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {estimatedBaseAmount !== null ? (
                <Text style={[styles.convertedHint, { color: theme.colors.muted }]}>
                  Yaklaşık:{' '}
                  <MoneyText
                    amount={estimatedBaseAmount}
                    currency={baseCurrency}
                    privacyMode={false}
                    color={theme.colors.muted}
                  />
                </Text>
              ) : null}

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {CURRENCIES.map((code) => (
                  <Chip
                    key={code}
                    label={`${code} (${getCurrencySymbol(code)})`}
                    selected={currency === code}
                    color={typeAccent}
                    onPress={() => setCurrency(code)}
                  />
                ))}
              </ScrollView>
            </View>

            <View style={styles.numpadGrid}>
              {NUMPAD_ROWS.map((row, rIdx) => (
                <View key={rIdx} style={styles.numpadRow}>
                  {row.map((key) => {
                    const isBack = key === 'BACK';
                    return (
                      <Pressable
                        key={key}
                        accessibilityRole="button"
                        accessibilityLabel={isBack ? 'Geri sil' : key}
                        onPress={() => handleNumpadPress(key)}
                        style={({ pressed }) => [
                          styles.numpadKey,
                          {
                            backgroundColor: isBack
                              ? theme.colors.elevated
                              : theme.colors.background,
                            borderColor: theme.colors.border,
                            borderRadius: theme.radius.md,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}
                      >
                        {isBack ? (
                          <Delete size={20} color={theme.colors.text} />
                        ) : (
                          <Text
                            style={[
                              styles.numpadKeyText,
                              TABULAR_NUMS_STYLE,
                              { color: theme.colors.text },
                            ]}
                          >
                            {key}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>

            {!isGoalWithdraw ? (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: theme.colors.muted }]}>
                  {txType === 'transfer' ? 'Kaynak Hesap' : 'Hesap'}
                </Text>
                {selectableAccounts.length === 0 ? (
                  <Text style={[styles.helperText, { color: theme.colors.warning }]}>
                    Aktif hesap bulunamadı. Önce bir hesap oluşturun.
                  </Text>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipRow}
                  >
                    {selectableAccounts.map((acc) => (
                      <Chip
                        key={acc.id}
                        label={`${acc.name} (${acc.currency})`}
                        selected={accountId === acc.id}
                        color={acc.color}
                        onPress={() => {
                          setAccountId(acc.id);
                          if (!isEditing) {
                            setCurrency(acc.currency);
                          }
                        }}
                      />
                    ))}
                  </ScrollView>
                )}

                {isGoalDeposit && linkedGoal && linkedGoal.currency !== currency ? (
                  <View style={styles.targetAmountBox}>
                    <Text style={[styles.sectionLabel, { color: theme.colors.muted }]}>
                      Hedef Kumbara Tutarı ({linkedGoal.currency})
                    </Text>
                    <TextInput
                      value={toAmountStr}
                      onChangeText={(val) => {
                        setToAmountStr(val);
                        setToAmountTouched(val.trim().length > 0);
                      }}
                      keyboardType="decimal-pad"
                      placeholder={
                        suggestedTargetAmount > 0
                          ? `Otomatik: ${amountToInputString(suggestedTargetAmount)}`
                          : 'Kumbara tutarı'
                      }
                      placeholderTextColor={theme.colors.muted}
                      style={[
                        styles.input,
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
                ) : null}
              </View>
            ) : null}

            {txType === 'transfer' ? (
              !isGoalDeposit ? (
                <View style={styles.section}>
                  <Text style={[styles.sectionLabel, { color: theme.colors.muted }]}>
                    Hedef Hesap
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipRow}
                  >
                    {selectableAccounts
                      .filter((a) => isGoalWithdraw || a.id !== accountId)
                      .map((acc) => (
                        <Chip
                          key={acc.id}
                          label={`${acc.name} (${acc.currency})`}
                          selected={toAccountId === acc.id}
                          color={acc.color}
                          onPress={() => setToAccountId(acc.id)}
                        />
                      ))}
                  </ScrollView>

                  {targetAccount && (sourceAccount || isGoalWithdraw) ? (
                    <View style={styles.targetAmountBox}>
                      <Text style={[styles.sectionLabel, { color: theme.colors.muted }]}>
                        Hedef Hesaba Geçen Tutar ({targetAccount.currency})
                      </Text>
                      <TextInput
                        value={toAmountStr}
                        onChangeText={(val) => {
                          setToAmountStr(val);
                          setToAmountTouched(val.trim().length > 0);
                        }}
                        keyboardType="decimal-pad"
                        placeholder={
                          suggestedTargetAmount > 0
                            ? `Otomatik: ${amountToInputString(suggestedTargetAmount)}`
                            : 'Hedef tutar'
                        }
                        placeholderTextColor={theme.colors.muted}
                        style={[
                          styles.input,
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
                  ) : null}
                </View>
              ) : null
            ) : (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: theme.colors.muted }]}>
                  Kategori
                </Text>
                <View style={styles.wrapChips}>
                  {filteredCategories.map((cat) => (
                    <Chip
                      key={cat.id}
                      label={cat.name}
                      selected={categoryId === cat.id}
                      color={cat.color}
                      onPress={() => setCategoryId(cat.id)}
                    />
                  ))}
                </View>
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              onPress={() => setDetailsExpanded((prev) => !prev)}
              style={[
                styles.detailsToggle,
                {
                  backgroundColor: theme.colors.elevated,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.md,
                },
              ]}
            >
              <View style={styles.detailsToggleLeft}>
                <Calendar size={16} color={theme.colors.accent} />
                <Text style={[styles.detailsToggleText, { color: theme.colors.text }]}>
                  Detaylar (Tarih, Not, Taksit, Tekrar, Fiş)
                </Text>
              </View>
              {detailsExpanded ? (
                <ChevronUp size={18} color={theme.colors.muted} />
              ) : (
                <ChevronDown size={18} color={theme.colors.muted} />
              )}
            </Pressable>

            {detailsExpanded ? (
              <View
                style={[
                  styles.detailsPanel,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.elevated,
                    borderRadius: theme.radius.md,
                  },
                ]}
              >
                <View style={styles.section}>
                  <View style={styles.dateHeaderRow}>
                    <Text style={[styles.sectionLabel, { color: theme.colors.muted }]}>
                      Tarih (YYYY-AA-GG)
                    </Text>
                    <View style={styles.quickDateRow}>
                      <Chip
                        label="Bugün"
                        selected={date === todayIso}
                        onPress={() => setDate(todayIso)}
                      />
                      <Chip
                        label="Dün"
                        selected={date === yesterdayIso}
                        onPress={() => setDate(yesterdayIso)}
                      />
                    </View>
                  </View>
                  <TextInput
                    value={date}
                    onChangeText={setDate}
                    placeholder="2026-11-20"
                    placeholderTextColor={theme.colors.muted}
                    style={[
                      styles.input,
                      TABULAR_NUMS_STYLE,
                      {
                        backgroundColor: theme.colors.card,
                        borderColor: theme.colors.border,
                        color: theme.colors.text,
                        borderRadius: theme.radius.md,
                      },
                    ]}
                  />
                </View>

                <View style={styles.section}>
                  <Text style={[styles.sectionLabel, { color: theme.colors.muted }]}>
                    Not
                  </Text>
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder="Örn: Haftalık market alışverişi"
                    placeholderTextColor={theme.colors.muted}
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.colors.card,
                        borderColor: theme.colors.border,
                        color: theme.colors.text,
                        borderRadius: theme.radius.md,
                      },
                    ]}
                  />
                </View>

                <View style={styles.section}>
                  <Text style={[styles.sectionLabel, { color: theme.colors.muted }]}>
                    Etiketler (virgülle ayırın)
                  </Text>
                  <TextInput
                    value={tagsText}
                    onChangeText={setTagsText}
                    placeholder="market, mutfak, zorunlu"
                    placeholderTextColor={theme.colors.muted}
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.colors.card,
                        borderColor: theme.colors.border,
                        color: theme.colors.text,
                        borderRadius: theme.radius.md,
                      },
                    ]}
                  />
                </View>

                {!isEditing && txType === 'expense' ? (
                  <View style={styles.section}>
                    <View style={styles.installmentHeader}>
                      <Text style={[styles.sectionLabel, { color: theme.colors.muted }]}>
                        Taksit Seçeneği (2–24 ay)
                      </Text>
                      <View style={styles.stepperRow}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Taksit azalt"
                          disabled={installmentCount <= 1}
                          onPress={() =>
                            setInstallmentCount((prev) => Math.max(1, prev - 1))
                          }
                          style={[
                            styles.stepperBtn,
                            {
                              backgroundColor: theme.colors.card,
                              borderColor: theme.colors.border,
                              opacity: installmentCount <= 1 ? 0.45 : 1,
                            },
                          ]}
                        >
                          <Minus size={13} color={theme.colors.text} />
                        </Pressable>
                        <Text
                          style={[
                            styles.installmentSummary,
                            TABULAR_NUMS_STYLE,
                            { color: theme.colors.accent },
                          ]}
                        >
                          {installmentCount === 1
                            ? 'Tek çekim'
                            : `${installmentCount} ay taksit`}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Taksit artır"
                          disabled={installmentCount >= 24}
                          onPress={() => {
                            setInstallmentCount((prev) => Math.min(24, prev + 1));
                            setRecurringEnabled(false);
                          }}
                          style={[
                            styles.stepperBtn,
                            {
                              backgroundColor: theme.colors.card,
                              borderColor: theme.colors.border,
                              opacity: installmentCount >= 24 ? 0.45 : 1,
                            },
                          ]}
                        >
                          <Plus size={13} color={theme.colors.text} />
                        </Pressable>
                      </View>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chipRow}
                    >
                      {INSTALLMENT_PRESETS.map((count) => (
                        <Chip
                          key={count}
                          label={count === 1 ? 'Tek çekim' : `${count} Taksit`}
                          selected={installmentCount === count}
                          onPress={() => {
                            setInstallmentCount(count);
                            if (count >= 2) {
                              setRecurringEnabled(false);
                            }
                          }}
                        />
                      ))}
                    </ScrollView>
                    {installmentCount >= 2 && numericAmount > 0 ? (
                      <Text style={[styles.helperText, { color: theme.colors.muted }]}>
                        Aylık yaklaşık:{' '}
                        <MoneyText
                          amount={roundMoney(numericAmount / installmentCount)}
                          currency={currency}
                          privacyMode={false}
                          color={theme.colors.text}
                        />
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                {!isEditing && txType !== 'transfer' && installmentCount === 1 ? (
                  <View style={styles.section}>
                    <View style={styles.switchRow}>
                      <View style={styles.switchLabelWrap}>
                        <Text style={[styles.switchTitle, { color: theme.colors.text }]}>
                          Düzenli Tekrar
                        </Text>
                        <Text style={[styles.helperText, { color: theme.colors.muted }]}>
                          Belirlenen periyotta otomatik veya onaylı tekrar oluşturur
                        </Text>
                      </View>
                      <Switch
                        value={recurringEnabled}
                        onValueChange={setRecurringEnabled}
                        trackColor={{
                          false: theme.colors.border,
                          true: theme.colors.accent,
                        }}
                      />
                    </View>

                    {recurringEnabled ? (
                      <View style={styles.recurringBox}>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.chipRow}
                        >
                          {FREQUENCY_OPTIONS.map((opt) => (
                            <Chip
                              key={opt.value}
                              label={opt.label}
                              selected={recurringFrequency === opt.value}
                              onPress={() => setRecurringFrequency(opt.value)}
                            />
                          ))}
                        </ScrollView>
                        <View style={styles.switchRow}>
                          <Text style={[styles.helperText, { color: theme.colors.text }]}>
                            Vadesi gelince otomatik kaydet
                          </Text>
                          <Switch
                            value={recurringAutoCreate}
                            onValueChange={setRecurringAutoCreate}
                            trackColor={{
                              false: theme.colors.border,
                              true: theme.colors.income,
                            }}
                          />
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <View style={styles.section}>
                  <Text style={[styles.sectionLabel, { color: theme.colors.muted }]}>
                    Fiş Fotoğrafı
                  </Text>
                  {receiptUri ? (
                    <View style={styles.receiptPreviewRow}>
                      <Image source={{ uri: receiptUri }} style={styles.receiptThumb} />
                      <View style={styles.receiptActions}>
                        <Chip
                          label="Değiştir"
                          icon={<Camera size={14} color={theme.colors.accent} />}
                          onPress={() => void handlePickReceipt()}
                        />
                        <Chip
                          label="Kaldır"
                          color={theme.colors.expense}
                          icon={<Trash2 size={14} color={theme.colors.expense} />}
                          onPress={() => setReceiptUri(null)}
                        />
                      </View>
                    </View>
                  ) : (
                    <Chip
                      label="Fiş Fotoğrafı Ekle"
                      icon={<Camera size={14} color={theme.colors.accent} />}
                      onPress={() => void handlePickReceipt()}
                    />
                  )}
                </View>
              </View>
            ) : null}

            {errorMsg ? (
              <Text style={[styles.errorText, { color: theme.colors.expense }]}>
                {errorMsg}
              </Text>
            ) : null}

            <View style={styles.footerActions}>
              {isEditing ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setConfirmDeleteVisible(true)}
                  style={({ pressed }) => [
                    styles.deleteButton,
                    {
                      backgroundColor: theme.colors.expenseSoft,
                      borderColor: theme.colors.expense,
                      borderRadius: theme.radius.md,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Trash2 size={16} color={theme.colors.expense} />
                  <Text style={[styles.deleteButtonText, { color: theme.colors.expense }]}>
                    Sil
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={handleSave}
                style={({ pressed }) => [
                  styles.saveButton,
                  {
                    backgroundColor: typeAccent,
                    borderRadius: theme.radius.md,
                    opacity: pressed ? 0.88 : 1,
                  },
                ]}
              >
                <Text style={styles.saveButtonText}>
                  {isEditing
                    ? 'Değişiklikleri Kaydet'
                    : installmentCount >= 2
                      ? `${installmentCount} Taksit Olarak Kaydet`
                      : 'İşlemi Kaydet'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <ConfirmModal
        visible={confirmDeleteVisible}
        title="İşlemi Sil"
        message="Bu işlemi silmek istediğinize emin misiniz? Hesap bakiyeleri otomatik olarak güncellenecektir."
        confirmLabel="Sil"
        cancelLabel="Vazgeç"
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteVisible(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
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
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  goalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  goalBadgeTextWrap: {
    flex: 1,
    gap: 2,
  },
  goalBadgeTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  goalBadgeSub: {
    fontSize: 12,
  },
  amountCard: {
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  amountDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  amountDisplay: {
    fontSize: 28,
    fontWeight: '800',
    flex: 1,
  },
  clearText: {
    fontSize: 12,
    fontWeight: '600',
  },
  convertedHint: {
    fontSize: 12,
  },
  numpadGrid: {
    gap: 6,
  },
  numpadRow: {
    flexDirection: 'row',
    gap: 6,
  },
  numpadKey: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numpadKeyText: {
    fontSize: 18,
    fontWeight: '700',
  },
  section: {
    gap: 6,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  wrapChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  targetAmountBox: {
    marginTop: 6,
    gap: 6,
  },
  input: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  detailsToggle: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailsToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  detailsToggleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  detailsPanel: {
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  dateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  quickDateRow: {
    flexDirection: 'row',
    gap: 6,
  },
  installmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  installmentSummary: {
    fontSize: 12,
    fontWeight: '700',
    minWidth: 74,
    textAlign: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  switchLabelWrap: {
    flex: 1,
    gap: 2,
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  recurringBox: {
    marginTop: 8,
    gap: 10,
  },
  helperText: {
    fontSize: 12,
  },
  receiptPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  receiptThumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
  },
  receiptActions: {
    flexDirection: 'row',
    gap: 8,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  footerActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  saveButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
