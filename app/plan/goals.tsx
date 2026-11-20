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
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Pencil,
  PiggyBank,
  Plus,
  Trash2,
  X,
} from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { MoneyText } from '@/components/ui/MoneyText';
import { convertAmount, ratesListToMap } from '@/domain/currency';
import { addMoney, formatPercent, roundMoney } from '@/domain/money';
import { getLocalTodayIso, parseIsoDate } from '@/domain/periods';
import type { CurrencyCode, SavingsGoal } from '@/domain/types';
import { useFinanceStore } from '@/store/useFinanceStore';
import { TABULAR_NUMS_STYLE, useResponsiveLayout, useTheme } from '@/theme/theme';

const CURRENCIES: CurrencyCode[] = ['TRY', 'USD', 'EUR', 'GBP', 'XAU'];

const COLOR_SWATCHES = [
  '#06B6D4',
  '#10B981',
  '#3B82F6',
  '#8B5CF6',
  '#F59E0B',
  '#EC4899',
  '#EF4444',
  '#14B8A6',
] as const;

function parsePositiveAmount(raw: string): number | null {
  const normalized = raw.trim().replace(/\s+/g, '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return roundMoney(parsed);
}

function parseNonNegativeAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const normalized = trimmed.replace(/\s+/g, '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return roundMoney(parsed);
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

export default function GoalsScreen() {
  const theme = useTheme();
  const { isWide, contentMaxWidth } = useResponsiveLayout();

  const savingsGoals = useFinanceStore((s) => s.savingsGoals);
  const accounts = useFinanceStore((s) => s.accounts);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);
  const settings = useFinanceStore((s) => s.settings);
  const addGoal = useFinanceStore((s) => s.addGoal);
  const updateGoal = useFinanceStore((s) => s.updateGoal);
  const contributeToGoal = useFinanceStore((s) => s.contributeToGoal);
  const deleteGoal = useFinanceStore((s) => s.deleteGoal);

  const todayIso = getLocalTodayIso();
  const ratesMap = useMemo(() => ratesListToMap(exchangeRates), [exchangeRates]);

  const activeGoals = useMemo(
    () =>
      savingsGoals
        .filter((g) => g.deletedAt === null)
        .slice()
        .sort((a, b) => Number(a.isCompleted) - Number(b.isCompleted)),
    [savingsGoals],
  );

  const selectableAccounts = useMemo(
    () =>
      accounts.filter(
        (a) => a.deletedAt === null && !a.isArchived && a.type !== 'credit_card',
      ),
    [accounts],
  );

  const summary = useMemo(() => {
    let totalSavedBase = 0;
    let totalTargetBase = 0;
    let completedCount = 0;

    for (const g of activeGoals) {
      totalSavedBase = addMoney(
        totalSavedBase,
        convertAmount(g.currentAmount, g.currency, settings.baseCurrency, ratesMap),
      );
      totalTargetBase = addMoney(
        totalTargetBase,
        convertAmount(g.targetAmount, g.currency, settings.baseCurrency, ratesMap),
      );
      if (g.isCompleted) {
        completedCount += 1;
      }
    }

    return { totalSavedBase, totalTargetBase, completedCount };
  }, [activeGoals, settings.baseCurrency, ratesMap]);

  // Create / Edit Goal modal state
  const [formVisible, setFormVisible] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [name, setName] = useState('');
  const [targetAmountStr, setTargetAmountStr] = useState('');
  const [currentAmountStr, setCurrentAmountStr] = useState('0');
  const [currency, setCurrency] = useState<CurrencyCode>(settings.baseCurrency);
  const [targetDate, setTargetDate] = useState('');
  const [color, setColor] = useState<string>(COLOR_SWATCHES[0]);
  const [formError, setFormError] = useState<string | null>(null);

  // Contribution (deposit / withdraw) modal state
  const [contribGoal, setContribGoal] = useState<SavingsGoal | null>(null);
  const [contribDirection, setContribDirection] = useState<'deposit' | 'withdraw'>('deposit');
  const [contribAmountStr, setContribAmountStr] = useState('');
  const [contribAccountId, setContribAccountId] = useState<string>('');
  const [contribNote, setContribNote] = useState('');
  const [contribError, setContribError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<SavingsGoal | null>(null);

  const openCreateModal = () => {
    setEditingGoal(null);
    setName('');
    setTargetAmountStr('');
    setCurrentAmountStr('0');
    setCurrency(settings.baseCurrency);
    setTargetDate('');
    setColor(COLOR_SWATCHES[0]);
    setFormError(null);
    setFormVisible(true);
  };

  const openEditModal = (goal: SavingsGoal) => {
    setEditingGoal(goal);
    setName(goal.name);
    setTargetAmountStr(String(roundMoney(goal.targetAmount)).replace('.', ','));
    setCurrentAmountStr(String(roundMoney(goal.currentAmount)).replace('.', ','));
    setCurrency(goal.currency);
    setTargetDate(goal.targetDate ?? '');
    setColor(goal.color);
    setFormError(null);
    setFormVisible(true);
  };

  const handleSaveGoal = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Lütfen bir hedef adı girin.');
      return;
    }

    const parsedTarget = parsePositiveAmount(targetAmountStr);
    if (parsedTarget === null) {
      setFormError('Hedef tutarı 0’dan büyük olmalıdır.');
      return;
    }

    const parsedCurrent = parseNonNegativeAmount(currentAmountStr);
    if (parsedCurrent === null) {
      setFormError('Mevcut birikim tutarı 0 veya pozitif bir sayı olmalıdır.');
      return;
    }

    const trimmedDate = targetDate.trim();
    if (trimmedDate) {
      try {
        parseIsoDate(trimmedDate);
      } catch {
        setFormError('Hedef tarihi YYYY-AA-GG biçiminde geçerli bir tarih olmalıdır.');
        return;
      }
    }

    if (editingGoal) {
      updateGoal(editingGoal.id, {
        name: trimmedName,
        targetAmount: parsedTarget,
        currentAmount: parsedCurrent,
        currency,
        targetDate: trimmedDate || null,
        color,
      });
    } else {
      addGoal({
        name: trimmedName,
        targetAmount: parsedTarget,
        currentAmount: parsedCurrent,
        currency,
        targetDate: trimmedDate || null,
        icon: 'piggy-bank',
        color,
      });
    }

    setFormVisible(false);
  };

  const openContribModal = (goal: SavingsGoal, direction: 'deposit' | 'withdraw') => {
    setContribGoal(goal);
    setContribDirection(direction);
    setContribAmountStr('');
    setContribAccountId(selectableAccounts[0]?.id ?? '');
    setContribNote('');
    setContribError(null);
  };

  const handleConfirmContrib = () => {
    if (!contribGoal) return;
    const parsedAmount = parsePositiveAmount(contribAmountStr);
    if (parsedAmount === null) {
      setContribError('Lütfen 0’dan büyük geçerli bir tutar girin.');
      return;
    }
    if (contribDirection === 'withdraw' && parsedAmount > contribGoal.currentAmount) {
      setContribError('Çekilecek tutar kumbaradaki mevcut birikimden büyük olamaz.');
      return;
    }

    contributeToGoal({
      goalId: contribGoal.id,
      amount: parsedAmount,
      accountId: contribAccountId || undefined,
      direction: contribDirection,
      date: todayIso,
      note: contribNote.trim() || undefined,
    });

    setContribGoal(null);
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
            <View style={styles.summaryCell}>
              <Text style={[styles.summaryLabel, { color: theme.colors.muted }]}>
                Toplam Kumbara Birikimi
              </Text>
              <MoneyText
                amount={summary.totalSavedBase}
                currency={settings.baseCurrency}
                privacyMode={settings.privacyMode}
                color={theme.colors.income}
                style={styles.summaryValue}
              />
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: theme.colors.border }]} />
            <View style={styles.summaryCell}>
              <Text style={[styles.summaryLabel, { color: theme.colors.muted }]}>
                Toplam Hedef
              </Text>
              <MoneyText
                amount={summary.totalTargetBase}
                currency={settings.baseCurrency}
                privacyMode={settings.privacyMode}
                color={theme.colors.text}
                style={styles.summaryValue}
              />
            </View>
          </View>
        </Card>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Hedeflerim ({activeGoals.length})
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
            <Text style={styles.addBtnText}>Yeni Hedef</Text>
          </Pressable>
        </View>

        {activeGoals.length === 0 ? (
          <Card>
            <EmptyState
              title="Henüz birikim hedefiniz yok"
              description="Acil durum fonu, tatil veya yeni bir cihaz için kumbara hedefi oluşturup düzenli birikim yapın."
              actionLabel="Hedef Oluştur"
              onAction={openCreateModal}
              icon={<PiggyBank size={24} color={theme.colors.muted} />}
            />
          </Card>
        ) : (
          <View style={styles.list}>
            {activeGoals.map((goal) => {
              const pct =
                goal.targetAmount > 0
                  ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100)
                  : 0;
              const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);

              return (
                <Card key={goal.id} style={styles.goalCard} padding={16}>
                  <View style={styles.goalHeader}>
                    <View style={styles.goalTitleRow}>
                      <View style={[styles.iconBox, { backgroundColor: `${goal.color}20` }]}>
                        <PiggyBank size={18} color={goal.color} />
                      </View>
                      <View style={styles.goalTitleWrap}>
                        <View style={styles.titleWithStatus}>
                          <Text style={[styles.goalTitle, { color: theme.colors.text }]}>
                            {goal.name}
                          </Text>
                          {goal.isCompleted ? (
                            <View
                              style={[
                                styles.doneBadge,
                                { backgroundColor: theme.colors.incomeSoft },
                              ]}
                            >
                              <CheckCircle2 size={12} color={theme.colors.income} />
                              <Text style={[styles.doneBadgeText, { color: theme.colors.income }]}>
                                Tamamlandı
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={[styles.goalMeta, { color: theme.colors.muted }]}>
                          {goal.currency}
                          {goal.targetDate
                            ? ` · Hedef Tarihi: ${formatShortTrDate(goal.targetDate)}`
                            : ''}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.cardActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Hedefi düzenle"
                        onPress={() => openEditModal(goal)}
                        style={[styles.iconBtn, { backgroundColor: theme.colors.elevated }]}
                      >
                        <Pencil size={15} color={theme.colors.text} />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Hedefi sil"
                        onPress={() => setDeleteTarget(goal)}
                        style={[styles.iconBtn, { backgroundColor: theme.colors.expenseSoft }]}
                      >
                        <Trash2 size={15} color={theme.colors.expense} />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.progressHeader}>
                    <Text style={[styles.progressSub, { color: theme.colors.muted }]}>
                      Biriken:{' '}
                      <MoneyText
                        amount={goal.currentAmount}
                        currency={goal.currency}
                        privacyMode={settings.privacyMode}
                        color={theme.colors.text}
                        style={styles.progressStrong}
                      />{' '}
                      / Hedef:{' '}
                      <MoneyText
                        amount={goal.targetAmount}
                        currency={goal.currency}
                        privacyMode={settings.privacyMode}
                        color={theme.colors.text}
                        style={styles.progressStrong}
                      />
                    </Text>
                    <View style={[styles.pctBadge, { backgroundColor: `${goal.color}20` }]}>
                      <Text style={[styles.pctText, TABULAR_NUMS_STYLE, { color: goal.color }]}>
                        {formatPercent(pct)}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.track, { backgroundColor: theme.colors.elevated }]}>
                    <View
                      style={[
                        styles.fill,
                        {
                          width: `${Math.min(100, Math.max(0, pct))}%`,
                          backgroundColor: goal.isCompleted ? theme.colors.income : goal.color,
                        },
                      ]}
                    />
                  </View>

                  {!goal.isCompleted ? (
                    <Text style={[styles.remainingText, { color: theme.colors.muted }]}>
                      Hedefe kalan:{' '}
                      <MoneyText
                        amount={remaining}
                        currency={goal.currency}
                        privacyMode={settings.privacyMode}
                        color={theme.colors.text}
                      />
                    </Text>
                  ) : null}

                  <View style={styles.goalButtonsRow}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => openContribModal(goal, 'deposit')}
                      style={({ pressed }) => [
                        styles.goalActionBtn,
                        {
                          backgroundColor: theme.colors.incomeSoft,
                          borderColor: theme.colors.income,
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}
                    >
                      <ArrowUpCircle size={15} color={theme.colors.income} />
                      <Text style={[styles.goalActionText, { color: theme.colors.income }]}>
                        Para Ekle
                      </Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      disabled={goal.currentAmount <= 0}
                      onPress={() => openContribModal(goal, 'withdraw')}
                      style={({ pressed }) => [
                        styles.goalActionBtn,
                        {
                          backgroundColor: theme.colors.elevated,
                          borderColor: theme.colors.border,
                          opacity: goal.currentAmount <= 0 ? 0.45 : pressed ? 0.8 : 1,
                        },
                      ]}
                    >
                      <ArrowDownCircle size={15} color={theme.colors.text} />
                      <Text style={[styles.goalActionText, { color: theme.colors.text }]}>
                        Para Çek
                      </Text>
                    </Pressable>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Create / Edit Goal Modal */}
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
              { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                {editingGoal ? 'Hedefi Düzenle' : 'Yeni Birikim Hedefi'}
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
              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>Hedef Adı</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Örn. Acil Durum Fonu, Yaz Tatili"
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

              <View style={styles.twoColRow}>
                <View style={styles.twoColCell}>
                  <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                    Hedef Tutar
                  </Text>
                  <TextInput
                    value={targetAmountStr}
                    onChangeText={setTargetAmountStr}
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
                </View>

                <View style={styles.twoColCell}>
                  <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                    Mevcut Birikim
                  </Text>
                  <TextInput
                    value={currentAmountStr}
                    onChangeText={setCurrentAmountStr}
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
                </View>
              </View>

              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                Hedef Tarihi (İsteğe bağlı, YYYY-AA-GG)
              </Text>
              <TextInput
                value={targetDate}
                onChangeText={setTargetDate}
                placeholder="Örn. 2027-06-01"
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
                onPress={handleSaveGoal}
                style={({ pressed }) => [
                  styles.saveBtn,
                  { backgroundColor: theme.colors.accent, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={styles.saveBtnText}>
                  {editingGoal ? 'Değişiklikleri Kaydet' : 'Hedefi Oluştur'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Deposit / Withdraw Contribution Modal */}
      <Modal
        visible={contribGoal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setContribGoal(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.modalBackdrop, { backgroundColor: theme.colors.overlay }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setContribGoal(null)} />
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                {contribDirection === 'deposit' ? 'Kumbaraya Para Ekle' : 'Kumbaradan Para Çek'}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setContribGoal(null)}
                style={[styles.closeBtn, { backgroundColor: theme.colors.elevated }]}
              >
                <X size={18} color={theme.colors.text} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
              {contribGoal ? (
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
                      Bir hesap seçerseniz kumbara hareketi &ldquo;Transfer&rdquo; olarak
                      kaydedilir; aylık gider veya gelir toplamınızı yapay olarak şişirmez.
                    </Text>
                  </View>

                  <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                    Tutar ({contribGoal.currency})
                  </Text>
                  <TextInput
                    value={contribAmountStr}
                    onChangeText={setContribAmountStr}
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

                  <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                    {contribDirection === 'deposit'
                      ? 'Kaynak Hesap (İsteğe bağlı)'
                      : 'Aktarılacak Hesap (İsteğe bağlı)'}
                  </Text>
                  <View style={styles.chipRow}>
                    <Chip
                      label="Hesap Bağlantısı Yok"
                      selected={contribAccountId === ''}
                      onPress={() => setContribAccountId('')}
                    />
                    {selectableAccounts.map((acc) => (
                      <Chip
                        key={acc.id}
                        label={`${acc.name} (${acc.currency})`}
                        selected={contribAccountId === acc.id}
                        color={acc.color}
                        onPress={() => setContribAccountId(acc.id)}
                      />
                    ))}
                  </View>

                  <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                    Not (İsteğe bağlı)
                  </Text>
                  <TextInput
                    value={contribNote}
                    onChangeText={setContribNote}
                    placeholder={
                      contribDirection === 'deposit'
                        ? `${contribGoal.name} birikimi`
                        : `${contribGoal.name} çekimi`
                    }
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

                  {contribError ? (
                    <Text style={[styles.errorText, { color: theme.colors.expense }]}>
                      {contribError}
                    </Text>
                  ) : null}

                  <Pressable
                    accessibilityRole="button"
                    onPress={handleConfirmContrib}
                    style={({ pressed }) => [
                      styles.saveBtn,
                      {
                        backgroundColor:
                          contribDirection === 'deposit'
                            ? theme.colors.income
                            : theme.colors.accent,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Text style={styles.saveBtnText}>
                      {contribDirection === 'deposit' ? 'Kumbaraya Aktar' : 'Çekimi Kaydet'}
                    </Text>
                  </Pressable>
                </>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmModal
        visible={deleteTarget !== null}
        title="Birikim Hedefini Sil"
        message={
          deleteTarget
            ? `"${deleteTarget.name}" birikim hedefini silmek istediğinize emin misiniz?`
            : ''
        }
        confirmLabel="Sil"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteGoal(deleteTarget.id);
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
  summaryCell: {
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
  goalCard: {
    gap: 10,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  goalTitleRow: {
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
  goalTitleWrap: {
    flex: 1,
    gap: 2,
  },
  titleWithStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  goalTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  doneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  doneBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  goalMeta: {
    fontSize: 12,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 6,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  progressSub: {
    fontSize: 12,
    flex: 1,
  },
  progressStrong: {
    fontSize: 12,
    fontWeight: '700',
  },
  pctBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pctText: {
    fontSize: 12,
    fontWeight: '800',
  },
  track: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
  remainingText: {
    fontSize: 12,
  },
  goalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  goalActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 9,
  },
  goalActionText: {
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
  twoColRow: {
    flexDirection: 'row',
    gap: 10,
  },
  twoColCell: {
    flex: 1,
    gap: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  errorText: {
    fontSize: 12,
    fontWeight: '600',
  },
  saveBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
