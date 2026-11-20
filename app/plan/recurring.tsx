import React, { useMemo, useState } from 'react';
import {
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
import { Pencil, Plus, Repeat, Trash2, X } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { MoneyText } from '@/components/ui/MoneyText';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { roundMoney } from '@/domain/money';
import { getLocalTodayIso, parseIsoDate } from '@/domain/periods';
import type { CurrencyCode, Frequency, RecurringRule } from '@/domain/types';
import { useFinanceStore } from '@/store/useFinanceStore';
import { TABULAR_NUMS_STYLE, useResponsiveLayout, useTheme } from '@/theme/theme';

const CURRENCIES: CurrencyCode[] = ['TRY', 'USD', 'EUR', 'GBP', 'XAU'];

const TYPE_OPTIONS: Array<{ value: 'expense' | 'income'; label: string }> = [
  { value: 'expense', label: 'Gider' },
  { value: 'income', label: 'Gelir' },
];

const FREQUENCY_OPTIONS: Array<{ value: Frequency; label: string }> = [
  { value: 'daily', label: 'Günlük' },
  { value: 'weekly', label: 'Haftalık' },
  { value: 'monthly', label: 'Aylık' },
  { value: 'yearly', label: 'Yıllık' },
];

const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: 'Günlük',
  weekly: 'Haftalık',
  monthly: 'Aylık',
  yearly: 'Yıllık',
};

function parsePositiveAmount(raw: string): number | null {
  const normalized = raw.trim().replace(/\s+/g, '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
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

export default function RecurringRulesScreen() {
  const theme = useTheme();
  const { isWide, contentMaxWidth } = useResponsiveLayout();

  const recurringRules = useFinanceStore((s) => s.recurringRules);
  const accounts = useFinanceStore((s) => s.accounts);
  const categories = useFinanceStore((s) => s.categories);
  const settings = useFinanceStore((s) => s.settings);
  const addRecurringRule = useFinanceStore((s) => s.addRecurringRule);
  const updateRecurringRule = useFinanceStore((s) => s.updateRecurringRule);
  const deleteRecurringRule = useFinanceStore((s) => s.deleteRecurringRule);

  const todayIso = getLocalTodayIso();

  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.deletedAt === null && !a.isArchived),
    [accounts],
  );
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const rules = useMemo(
    () =>
      recurringRules
        .filter((r) => r.deletedAt === null)
        .slice()
        .sort((a, b) => {
          if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
          return a.nextRunDate.localeCompare(b.nextRunDate);
        }),
    [recurringRules],
  );

  // Create / Edit Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null);
  const [title, setTitle] = useState('');
  const [ruleType, setRuleType] = useState<'income' | 'expense'>('expense');
  const [amountStr, setAmountStr] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(settings.baseCurrency);
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [nextRunDate, setNextRunDate] = useState(todayIso);
  const [autoCreate, setAutoCreate] = useState(true);
  const [remindDaysStr, setRemindDaysStr] = useState('1');
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<RecurringRule | null>(null);

  const filteredCategories = useMemo(
    () =>
      categories
        .filter((c) => c.deletedAt === null && c.type === ruleType)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [categories, ruleType],
  );

  const openCreateModal = () => {
    const firstAcc = activeAccounts[0];
    const firstExpenseCat = categories.find((c) => c.deletedAt === null && c.type === 'expense');
    setEditingRule(null);
    setTitle('');
    setRuleType('expense');
    setAmountStr('');
    setCurrency(firstAcc?.currency ?? settings.baseCurrency);
    setAccountId(firstAcc?.id ?? '');
    setCategoryId(firstExpenseCat?.id ?? '');
    setFrequency('monthly');
    setNextRunDate(todayIso);
    setAutoCreate(true);
    setRemindDaysStr('1');
    setFormError(null);
    setModalVisible(true);
  };

  const openEditModal = (rule: RecurringRule) => {
    setEditingRule(rule);
    setTitle(rule.title);
    setRuleType(rule.type);
    setAmountStr(String(roundMoney(rule.amount)).replace('.', ','));
    setCurrency(rule.currency);
    setAccountId(rule.accountId);
    setCategoryId(rule.categoryId);
    setFrequency(rule.frequency);
    setNextRunDate(rule.nextRunDate);
    setAutoCreate(rule.autoCreate);
    setRemindDaysStr(String(rule.remindDaysBefore));
    setFormError(null);
    setModalVisible(true);
  };

  const handleTypeChange = (nextType: 'income' | 'expense') => {
    setRuleType(nextType);
    const matching = categories
      .filter((c) => c.deletedAt === null && c.type === nextType)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (!matching.some((c) => c.id === categoryId)) {
      setCategoryId(matching[0]?.id ?? '');
    }
  };

  const handleSave = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError('Lütfen kural başlığı girin.');
      return;
    }

    const parsedAmount = parsePositiveAmount(amountStr);
    if (parsedAmount === null) {
      setFormError('Lütfen 0’dan büyük geçerli bir tutar girin.');
      return;
    }

    if (!accountId) {
      setFormError('Lütfen bir hesap seçin.');
      return;
    }
    if (!categoryId) {
      setFormError('Lütfen bir kategori seçin.');
      return;
    }

    try {
      parseIsoDate(nextRunDate.trim());
    } catch {
      setFormError('Tarih YYYY-AA-GG biçiminde geçerli bir tarih olmalıdır.');
      return;
    }

    const parsedRemind = Number.parseInt(remindDaysStr.trim() || '0', 10);
    if (!Number.isInteger(parsedRemind) || parsedRemind < 0 || parsedRemind > 60) {
      setFormError('Hatırlatma gün sayısı 0 ile 60 arasında olmalıdır.');
      return;
    }

    if (editingRule) {
      updateRecurringRule(editingRule.id, {
        title: trimmedTitle,
        type: ruleType,
        amount: parsedAmount,
        currency,
        accountId,
        categoryId,
        frequency,
        nextRunDate: nextRunDate.trim(),
        autoCreate,
        remindDaysBefore: parsedRemind,
      });
    } else {
      addRecurringRule({
        title: trimmedTitle,
        type: ruleType,
        amount: parsedAmount,
        currency,
        accountId,
        categoryId,
        frequency,
        nextRunDate: nextRunDate.trim(),
        autoCreate,
        remindDaysBefore: parsedRemind,
        isActive: true,
      });
    }

    setModalVisible(false);
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
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Kurallar ({rules.length})
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
            <Text style={styles.addBtnText}>Yeni Kural</Text>
          </Pressable>
        </View>

        {rules.length === 0 ? (
          <Card>
            <EmptyState
              title="Düzenli ödeme veya abonelik yok"
              description="Maaş, kira, fatura ve aboneliklerinizi düzenli kural olarak tanımlayın; zamanı geldiğinde otomatik işlensin veya onayınıza sunulsun."
              actionLabel="Düzenli Kural Ekle"
              onAction={openCreateModal}
              icon={<Repeat size={24} color={theme.colors.muted} />}
            />
          </Card>
        ) : (
          <View style={styles.list}>
            {rules.map((rule) => {
              const acc = accountMap.get(rule.accountId);
              const cat = categoryMap.get(rule.categoryId);
              const amountColor =
                rule.type === 'income' ? theme.colors.income : theme.colors.expense;

              return (
                <Card
                  key={rule.id}
                  style={[styles.ruleCard, !rule.isActive && { opacity: 0.72 }]}
                  padding={16}
                >
                  <View style={styles.topRow}>
                    <View style={styles.titleWrap}>
                      <Text style={[styles.ruleTitle, { color: theme.colors.text }]}>
                        {rule.title}
                      </Text>
                      <Text style={[styles.ruleMeta, { color: theme.colors.muted }]}>
                        {acc?.name ?? 'Hesap'} · {cat?.name ?? 'Kategori'}
                      </Text>
                    </View>

                    <MoneyText
                      amount={rule.amount}
                      currency={rule.currency}
                      privacyMode={settings.privacyMode}
                      color={amountColor}
                      style={styles.amountText}
                    />
                  </View>

                  <View style={styles.badgesRow}>
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: theme.colors.accentSoft },
                      ]}
                    >
                      <Text style={[styles.badgeText, { color: theme.colors.accent }]}>
                        {FREQUENCY_LABELS[rule.frequency]}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor: rule.autoCreate
                            ? theme.colors.incomeSoft
                            : theme.colors.warningSoft,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          {
                            color: rule.autoCreate
                              ? theme.colors.income
                              : theme.colors.warning,
                          },
                        ]}
                      >
                        {rule.autoCreate ? 'Otomatik İşlenir' : 'Onay Bekler'}
                      </Text>
                    </View>

                    <View style={[styles.badge, { backgroundColor: theme.colors.elevated }]}>
                      <Text
                        style={[
                          styles.badgeText,
                          TABULAR_NUMS_STYLE,
                          { color: theme.colors.muted },
                        ]}
                      >
                        Sonraki: {formatShortTrDate(rule.nextRunDate)}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.footerRow,
                      { borderTopColor: theme.colors.border },
                    ]}
                  >
                    <View style={styles.switchWrap}>
                      <Switch
                        value={rule.isActive}
                        onValueChange={(val) => updateRecurringRule(rule.id, { isActive: val })}
                        trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
                      />
                      <Text style={[styles.switchLabel, { color: theme.colors.muted }]}>
                        {rule.isActive ? 'Aktif' : 'Duraklatıldı'}
                      </Text>
                    </View>

                    <View style={styles.actionsRow}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Kuralı düzenle"
                        onPress={() => openEditModal(rule)}
                        style={[styles.iconBtn, { backgroundColor: theme.colors.elevated }]}
                      >
                        <Pencil size={15} color={theme.colors.text} />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Kuralı sil"
                        onPress={() => setDeleteTarget(rule)}
                        style={[styles.iconBtn, { backgroundColor: theme.colors.expenseSoft }]}
                      >
                        <Trash2 size={15} color={theme.colors.expense} />
                      </Pressable>
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Create / Edit Recurring Rule Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.modalBackdrop, { backgroundColor: theme.colors.overlay }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalVisible(false)} />
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                {editingRule ? 'Düzenli Kuralı Düzenle' : 'Yeni Düzenli Kural'}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setModalVisible(false)}
                style={[styles.closeBtn, { backgroundColor: theme.colors.elevated }]}
              >
                <X size={18} color={theme.colors.text} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>İşlem Türü</Text>
              <SegmentedControl
                options={TYPE_OPTIONS}
                value={ruleType}
                onChange={handleTypeChange}
              />

              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>Başlık</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Örn. Ev Kirası, Spotify, Maaş"
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

              <View style={styles.twoColRow}>
                <View style={styles.twoColCell}>
                  <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>Tutar</Text>
                  <TextInput
                    value={amountStr}
                    onChangeText={setAmountStr}
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
                    Sonraki Tarih
                  </Text>
                  <TextInput
                    value={nextRunDate}
                    onChangeText={setNextRunDate}
                    placeholder="YYYY-AA-GG"
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

              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>Sıklık</Text>
              <SegmentedControl
                options={FREQUENCY_OPTIONS}
                value={frequency}
                onChange={setFrequency}
              />

              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>Hesap</Text>
              {activeAccounts.length === 0 ? (
                <Text style={[styles.errorText, { color: theme.colors.expense }]}>
                  Önce Hesaplarım bölümünden en az bir aktif hesap oluşturun.
                </Text>
              ) : (
                <View style={styles.chipRow}>
                  {activeAccounts.map((acc) => (
                    <Chip
                      key={acc.id}
                      label={acc.name}
                      selected={accountId === acc.id}
                      color={acc.color}
                      onPress={() => setAccountId(acc.id)}
                    />
                  ))}
                </View>
              )}

              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>Kategori</Text>
              <View style={styles.chipRow}>
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

              <View
                style={[
                  styles.switchBox,
                  { backgroundColor: theme.colors.elevated, borderColor: theme.colors.border },
                ]}
              >
                <View style={styles.switchTextWrap}>
                  <Text style={[styles.switchTitle, { color: theme.colors.text }]}>
                    Vadesi Gelince Otomatik İşle
                  </Text>
                  <Text style={[styles.switchDesc, { color: theme.colors.muted }]}>
                    Kapalıysa günü geldiğinde Özet ekranında onayınıza sunulur.
                  </Text>
                </View>
                <Switch
                  value={autoCreate}
                  onValueChange={setAutoCreate}
                  trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
                />
              </View>

              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                Kaç Gün Önce Hatırlatılsın? (0–60)
              </Text>
              <TextInput
                value={remindDaysStr}
                onChangeText={setRemindDaysStr}
                keyboardType="number-pad"
                placeholder="1"
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

              {formError ? (
                <Text style={[styles.errorText, { color: theme.colors.expense }]}>{formError}</Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={handleSave}
                style={({ pressed }) => [
                  styles.saveBtn,
                  { backgroundColor: theme.colors.accent, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={styles.saveBtnText}>
                  {editingRule ? 'Değişiklikleri Kaydet' : 'Kuralı Kaydet'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmModal
        visible={deleteTarget !== null}
        title="Düzenli Kuralı Sil"
        message={
          deleteTarget
            ? `"${deleteTarget.title}" düzenli kuralını silmek istediğinize emin misiniz?`
            : ''
        }
        confirmLabel="Sil"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteRecurringRule(deleteTarget.id);
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
  ruleCard: {
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleWrap: {
    flex: 1,
    gap: 2,
  },
  ruleTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  ruleMeta: {
    fontSize: 12,
  },
  amountText: {
    fontSize: 15,
    fontWeight: '800',
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
  },
  switchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  switchLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionsRow: {
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
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  modalSheet: {
    width: '100%',
    maxWidth: 500,
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
  switchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  switchTextWrap: {
    flex: 1,
    gap: 2,
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  switchDesc: {
    fontSize: 11,
    lineHeight: 16,
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
