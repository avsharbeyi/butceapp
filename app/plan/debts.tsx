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
import { CheckCircle2, HandCoins, Pencil, Plus, Trash2, X } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { MoneyText } from '@/components/ui/MoneyText';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { convertAmount, ratesListToMap } from '@/domain/currency';
import { addMoney, formatPercent, roundMoney, subMoney } from '@/domain/money';
import { getLocalTodayIso, parseIsoDate } from '@/domain/periods';
import type { CurrencyCode, Debt } from '@/domain/types';
import { useFinanceStore } from '@/store/useFinanceStore';
import { TABULAR_NUMS_STYLE, useResponsiveLayout, useTheme } from '@/theme/theme';

type DebtDirection = 'owed_by_me' | 'owed_to_me';

const CURRENCIES: CurrencyCode[] = ['TRY', 'USD', 'EUR', 'GBP', 'XAU'];

const DIRECTION_TABS: Array<{ value: DebtDirection; label: string }> = [
  { value: 'owed_by_me', label: 'Borçlarım' },
  { value: 'owed_to_me', label: 'Alacaklarım' },
];

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

export default function DebtsScreen() {
  const theme = useTheme();
  const { isWide, contentMaxWidth } = useResponsiveLayout();

  const debts = useFinanceStore((s) => s.debts);
  const accounts = useFinanceStore((s) => s.accounts);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);
  const settings = useFinanceStore((s) => s.settings);
  const addDebt = useFinanceStore((s) => s.addDebt);
  const updateDebt = useFinanceStore((s) => s.updateDebt);
  const recordDebtPayment = useFinanceStore((s) => s.recordDebtPayment);
  const deleteDebt = useFinanceStore((s) => s.deleteDebt);

  const todayIso = getLocalTodayIso();
  const ratesMap = useMemo(() => ratesListToMap(exchangeRates), [exchangeRates]);

  const [tab, setTab] = useState<DebtDirection>('owed_by_me');

  const selectableAccounts = useMemo(
    () => accounts.filter((a) => a.deletedAt === null && !a.isArchived),
    [accounts],
  );

  const visibleDebts = useMemo(
    () =>
      debts
        .filter((d) => d.deletedAt === null && d.direction === tab)
        .slice()
        .sort((a, b) => Number(a.isSettled) - Number(b.isSettled)),
    [debts, tab],
  );

  const totals = useMemo(() => {
    let totalAll = 0;
    let totalPaid = 0;
    let totalRemaining = 0;

    for (const d of visibleDebts) {
      const remaining = Math.max(0, subMoney(d.totalAmount, d.paidAmount));
      totalAll = addMoney(
        totalAll,
        convertAmount(d.totalAmount, d.currency, settings.baseCurrency, ratesMap),
      );
      totalPaid = addMoney(
        totalPaid,
        convertAmount(d.paidAmount, d.currency, settings.baseCurrency, ratesMap),
      );
      totalRemaining = addMoney(
        totalRemaining,
        convertAmount(remaining, d.currency, settings.baseCurrency, ratesMap),
      );
    }

    return { totalAll, totalPaid, totalRemaining };
  }, [visibleDebts, settings.baseCurrency, ratesMap]);

  // Create / Edit Debt Modal
  const [formVisible, setFormVisible] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [personName, setPersonName] = useState('');
  const [direction, setDirection] = useState<DebtDirection>('owed_by_me');
  const [totalAmountStr, setTotalAmountStr] = useState('');
  const [paidAmountStr, setPaidAmountStr] = useState('0');
  const [currency, setCurrency] = useState<CurrencyCode>(settings.baseCurrency);
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Payment Modal
  const [payDebtTarget, setPayDebtTarget] = useState<Debt | null>(null);
  const [payAmountStr, setPayAmountStr] = useState('');
  const [payAccountId, setPayAccountId] = useState('');
  const [payNote, setPayNote] = useState('');
  const [payError, setPayError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Debt | null>(null);

  const openCreateModal = () => {
    setEditingDebt(null);
    setPersonName('');
    setDirection(tab);
    setTotalAmountStr('');
    setPaidAmountStr('0');
    setCurrency(settings.baseCurrency);
    setDueDate('');
    setNote('');
    setFormError(null);
    setFormVisible(true);
  };

  const openEditModal = (debt: Debt) => {
    setEditingDebt(debt);
    setPersonName(debt.personName);
    setDirection(debt.direction);
    setTotalAmountStr(String(roundMoney(debt.totalAmount)).replace('.', ','));
    setPaidAmountStr(String(roundMoney(debt.paidAmount)).replace('.', ','));
    setCurrency(debt.currency);
    setDueDate(debt.dueDate ?? '');
    setNote(debt.note ?? '');
    setFormError(null);
    setFormVisible(true);
  };

  const handleSaveDebt = () => {
    const trimmedPerson = personName.trim();
    if (!trimmedPerson) {
      setFormError('Lütfen kişi veya kurum adı girin.');
      return;
    }

    const parsedTotal = parsePositiveAmount(totalAmountStr);
    if (parsedTotal === null) {
      setFormError('Toplam tutar 0’dan büyük olmalıdır.');
      return;
    }

    const parsedPaid = parseNonNegativeAmount(paidAmountStr);
    if (parsedPaid === null || parsedPaid > parsedTotal) {
      setFormError('Ödenen tutar 0 ile toplam tutar arasında olmalıdır.');
      return;
    }

    const trimmedDue = dueDate.trim();
    if (trimmedDue) {
      try {
        parseIsoDate(trimmedDue);
      } catch {
        setFormError('Vade tarihi YYYY-AA-GG biçiminde geçerli bir tarih olmalıdır.');
        return;
      }
    }

    if (editingDebt) {
      updateDebt(editingDebt.id, {
        personName: trimmedPerson,
        direction,
        totalAmount: parsedTotal,
        paidAmount: parsedPaid,
        currency,
        dueDate: trimmedDue || null,
        note: note.trim() || undefined,
      });
    } else {
      addDebt({
        personName: trimmedPerson,
        direction,
        totalAmount: parsedTotal,
        paidAmount: parsedPaid,
        currency,
        dueDate: trimmedDue || null,
        note: note.trim() || undefined,
      });
    }

    setTab(direction);
    setFormVisible(false);
  };

  const openPaymentModal = (debt: Debt) => {
    const remaining = Math.max(0, subMoney(debt.totalAmount, debt.paidAmount));
    setPayDebtTarget(debt);
    setPayAmountStr(remaining > 0 ? String(remaining).replace('.', ',') : '');
    setPayAccountId(selectableAccounts[0]?.id ?? '');
    setPayNote('');
    setPayError(null);
  };

  const handleConfirmPayment = () => {
    if (!payDebtTarget) return;
    const parsedAmt = parsePositiveAmount(payAmountStr);
    if (parsedAmt === null) {
      setPayError('Lütfen 0’dan büyük bir tutar girin.');
      return;
    }

    recordDebtPayment({
      debtId: payDebtTarget.id,
      amount: parsedAmt,
      accountId: payAccountId || undefined,
      date: todayIso,
      note: payNote.trim() || undefined,
    });

    setPayDebtTarget(null);
  };

  const isOwedByMe = tab === 'owed_by_me';

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isWide && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <SegmentedControl
          options={DIRECTION_TABS}
          value={tab}
          onChange={setTab}
        />

        <Card style={styles.summaryCard} padding={16}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCell}>
              <Text style={[styles.summaryLabel, { color: theme.colors.muted }]}>
                {isOwedByMe ? 'Toplam Borç' : 'Toplam Alacak'}
              </Text>
              <MoneyText
                amount={totals.totalAll}
                currency={settings.baseCurrency}
                privacyMode={settings.privacyMode}
                color={theme.colors.text}
                style={styles.summaryValue}
              />
            </View>

            <View style={styles.summaryCell}>
              <Text style={[styles.summaryLabel, { color: theme.colors.muted }]}>
                Ödenen
              </Text>
              <MoneyText
                amount={totals.totalPaid}
                currency={settings.baseCurrency}
                privacyMode={settings.privacyMode}
                color={theme.colors.income}
                style={styles.summaryValue}
              />
            </View>

            <View style={styles.summaryCell}>
              <Text style={[styles.summaryLabel, { color: theme.colors.muted }]}>
                Kalan
              </Text>
              <MoneyText
                amount={totals.totalRemaining}
                currency={settings.baseCurrency}
                privacyMode={settings.privacyMode}
                color={isOwedByMe ? theme.colors.expense : theme.colors.income}
                style={styles.summaryValue}
              />
            </View>
          </View>
        </Card>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            {isOwedByMe ? 'Borç Kayıtları' : 'Alacak Kayıtları'} ({visibleDebts.length})
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
            <Text style={styles.addBtnText}>Yeni Kayıt</Text>
          </Pressable>
        </View>

        {visibleDebts.length === 0 ? (
          <Card>
            <EmptyState
              title={isOwedByMe ? 'Borç kaydı bulunmuyor' : 'Alacak kaydı bulunmuyor'}
              description={
                isOwedByMe
                  ? 'Kişi veya kurumlara olan borçlarınızı ekleyerek taksitli veya kısmi ödemelerinizi takip edebilirsiniz.'
                  : 'Başkalarından olan alacaklarınızı ekleyip tahsilat durumunu izleyebilirsiniz.'
              }
              actionLabel="Kayıt Ekle"
              onAction={openCreateModal}
              icon={<HandCoins size={24} color={theme.colors.muted} />}
            />
          </Card>
        ) : (
          <View style={styles.list}>
            {visibleDebts.map((debt) => {
              const remaining = Math.max(0, subMoney(debt.totalAmount, debt.paidAmount));
              const pct =
                debt.totalAmount > 0
                  ? Math.min(100, (debt.paidAmount / debt.totalAmount) * 100)
                  : 0;
              const accent = isOwedByMe ? theme.colors.expense : theme.colors.income;

              return (
                <Card key={debt.id} style={styles.debtCard} padding={16}>
                  <View style={styles.cardHeader}>
                    <View style={styles.titleWrap}>
                      <View style={styles.titleRow}>
                        <Text style={[styles.personName, { color: theme.colors.text }]}>
                          {debt.personName}
                        </Text>
                        {debt.isSettled ? (
                          <View
                            style={[
                              styles.settledBadge,
                              { backgroundColor: theme.colors.incomeSoft },
                            ]}
                          >
                            <CheckCircle2 size={12} color={theme.colors.income} />
                            <Text style={[styles.settledText, { color: theme.colors.income }]}>
                              Kapandı
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={[styles.metaLine, { color: theme.colors.muted }]}>
                        {debt.currency}
                        {debt.dueDate ? ` · Vade: ${formatShortTrDate(debt.dueDate)}` : ''}
                      </Text>
                      {debt.note ? (
                        <Text style={[styles.noteText, { color: theme.colors.muted }]}>
                          {debt.note}
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.cardActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Kaydı düzenle"
                        onPress={() => openEditModal(debt)}
                        style={[styles.iconBtn, { backgroundColor: theme.colors.elevated }]}
                      >
                        <Pencil size={15} color={theme.colors.text} />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Kaydı sil"
                        onPress={() => setDeleteTarget(debt)}
                        style={[styles.iconBtn, { backgroundColor: theme.colors.expenseSoft }]}
                      >
                        <Trash2 size={15} color={theme.colors.expense} />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.progressHeader}>
                    <Text style={[styles.progressLabel, { color: theme.colors.muted }]}>
                      Ödenen:{' '}
                      <MoneyText
                        amount={debt.paidAmount}
                        currency={debt.currency}
                        privacyMode={settings.privacyMode}
                        color={theme.colors.text}
                        style={styles.progressStrong}
                      />{' '}
                      / Toplam:{' '}
                      <MoneyText
                        amount={debt.totalAmount}
                        currency={debt.currency}
                        privacyMode={settings.privacyMode}
                        color={theme.colors.text}
                        style={styles.progressStrong}
                      />
                    </Text>
                    <Text style={[styles.pctText, TABULAR_NUMS_STYLE, { color: accent }]}>
                      {formatPercent(pct)}
                    </Text>
                  </View>

                  <View style={[styles.track, { backgroundColor: theme.colors.elevated }]}>
                    <View
                      style={[
                        styles.fill,
                        {
                          width: `${Math.min(100, Math.max(0, pct))}%`,
                          backgroundColor: debt.isSettled ? theme.colors.income : accent,
                        },
                      ]}
                    />
                  </View>

                  <View style={styles.footerRow}>
                    <Text style={[styles.remainingLabel, { color: theme.colors.muted }]}>
                      Kalan:{' '}
                      <MoneyText
                        amount={remaining}
                        currency={debt.currency}
                        privacyMode={settings.privacyMode}
                        color={remaining > 0 ? accent : theme.colors.income}
                        style={styles.remainingStrong}
                      />
                    </Text>

                    {!debt.isSettled ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => openPaymentModal(debt)}
                        style={({ pressed }) => [
                          styles.payBtn,
                          {
                            backgroundColor: theme.colors.accentSoft,
                            borderColor: theme.colors.accent,
                            opacity: pressed ? 0.8 : 1,
                          },
                        ]}
                      >
                        <Text style={[styles.payBtnText, { color: theme.colors.accent }]}>
                          Ödeme Kaydet
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Create / Edit Debt Modal */}
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
                {editingDebt ? 'Kaydı Düzenle' : 'Yeni Borç / Alacak'}
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
              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>Tür</Text>
              <SegmentedControl
                options={DIRECTION_TABS}
                value={direction}
                onChange={setDirection}
              />

              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>Kişi / Kurum</Text>
              <TextInput
                value={personName}
                onChangeText={setPersonName}
                placeholder="Örn. Ahmet Yılmaz"
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
                    Toplam Tutar
                  </Text>
                  <TextInput
                    value={totalAmountStr}
                    onChangeText={setTotalAmountStr}
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
                </View>

                <View style={styles.twoColCell}>
                  <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                    Ödenen Tutar
                  </Text>
                  <TextInput
                    value={paidAmountStr}
                    onChangeText={setPaidAmountStr}
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
                Vade Tarihi (İsteğe bağlı, YYYY-AA-GG)
              </Text>
              <TextInput
                value={dueDate}
                onChangeText={setDueDate}
                placeholder="Örn. 2026-12-30"
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
                Not (İsteğe bağlı)
              </Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Açıklama"
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

              {formError ? (
                <Text style={[styles.errorText, { color: theme.colors.expense }]}>{formError}</Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={handleSaveDebt}
                style={({ pressed }) => [
                  styles.saveBtn,
                  { backgroundColor: theme.colors.accent, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={styles.saveBtnText}>
                  {editingDebt ? 'Değişiklikleri Kaydet' : 'Kaydı Oluştur'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        visible={payDebtTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPayDebtTarget(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.modalBackdrop, { backgroundColor: theme.colors.overlay }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPayDebtTarget(null)} />
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                Ödeme Kaydet
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setPayDebtTarget(null)}
                style={[styles.closeBtn, { backgroundColor: theme.colors.elevated }]}
              >
                <X size={18} color={theme.colors.text} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
              {payDebtTarget ? (
                <>
                  <Text style={[styles.modalSubTitle, { color: theme.colors.muted }]}>
                    {payDebtTarget.personName} · Kalan:{' '}
                    <MoneyText
                      amount={Math.max(
                        0,
                        subMoney(payDebtTarget.totalAmount, payDebtTarget.paidAmount),
                      )}
                      currency={payDebtTarget.currency}
                      color={theme.colors.text}
                    />
                  </Text>

                  <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                    Ödeme Tutarı ({payDebtTarget.currency})
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

                  <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                    Bağlı Hesap (İsteğe bağlı)
                  </Text>
                  <View style={styles.chipRow}>
                    <Chip
                      label="Hesap Bağlantısı Yok"
                      selected={payAccountId === ''}
                      onPress={() => setPayAccountId('')}
                    />
                    {selectableAccounts.map((acc) => (
                      <Chip
                        key={acc.id}
                        label={`${acc.name} (${acc.currency})`}
                        selected={payAccountId === acc.id}
                        color={acc.color}
                        onPress={() => setPayAccountId(acc.id)}
                      />
                    ))}
                  </View>

                  <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                    Not (İsteğe bağlı)
                  </Text>
                  <TextInput
                    value={payNote}
                    onChangeText={setPayNote}
                    placeholder="Kısmi ödeme / tahsilat notu"
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
                    onPress={handleConfirmPayment}
                    style={({ pressed }) => [
                      styles.saveBtn,
                      { backgroundColor: theme.colors.accent, opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <Text style={styles.saveBtnText}>Ödemeyi Kaydet</Text>
                  </Pressable>
                </>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmModal
        visible={deleteTarget !== null}
        title="Kaydı Sil"
        message={
          deleteTarget
            ? `"${deleteTarget.personName}" kişisine ait borç/alacak kaydını silmek istediğinize emin misiniz?`
            : ''
        }
        confirmLabel="Sil"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteDebt(deleteTarget.id);
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
    gap: 8,
  },
  summaryCell: {
    flex: 1,
    gap: 4,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 15,
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
  debtCard: {
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleWrap: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  personName: {
    fontSize: 15,
    fontWeight: '800',
  },
  settledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  settledText: {
    fontSize: 11,
    fontWeight: '700',
  },
  metaLine: {
    fontSize: 12,
  },
  noteText: {
    fontSize: 12,
    fontStyle: 'italic',
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
  progressLabel: {
    fontSize: 12,
    flex: 1,
  },
  progressStrong: {
    fontSize: 12,
    fontWeight: '700',
  },
  pctText: {
    fontSize: 12,
    fontWeight: '800',
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
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 2,
  },
  remainingLabel: {
    fontSize: 12,
  },
  remainingStrong: {
    fontSize: 13,
    fontWeight: '800',
  },
  payBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  payBtnText: {
    fontSize: 12,
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
  modalSubTitle: {
    fontSize: 13,
    fontWeight: '600',
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
