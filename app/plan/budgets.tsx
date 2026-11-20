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
  ChevronLeft,
  ChevronRight,
  Copy,
  Pencil,
  Plus,
  Target,
  Trash2,
  X,
} from 'lucide-react-native';
import { BudgetProgressBars } from '@/components/charts/BudgetProgressBars';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { MoneyText } from '@/components/ui/MoneyText';
import { computeBudgetProgress } from '@/domain/analytics';
import { ratesListToMap } from '@/domain/currency';
import { roundMoney } from '@/domain/money';
import {
  addMonthsClamped,
  getFiscalMonthKey,
  getFiscalMonthRange,
  getLocalTodayIso,
  parseIsoDate,
} from '@/domain/periods';
import type { BudgetProgressItem, CurrencyCode } from '@/domain/types';
import { useFinanceStore } from '@/store/useFinanceStore';
import { TABULAR_NUMS_STYLE, useResponsiveLayout, useTheme } from '@/theme/theme';

const CURRENCIES: CurrencyCode[] = ['TRY', 'USD', 'EUR', 'GBP', 'XAU'];

function formatMonthTitleTr(monthKey: string): string {
  const [yStr, mStr] = monthKey.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  return new Intl.DateTimeFormat('tr-TR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatShortDateTr(isoDate: string): string {
  const { year, month, day } = parseIsoDate(isoDate);
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function parsePositiveAmount(raw: string): number | null {
  const normalized = raw.trim().replace(/\s+/g, '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return roundMoney(parsed);
}

export default function BudgetsScreen() {
  const theme = useTheme();
  const { isWide, contentMaxWidth } = useResponsiveLayout();

  const budgets = useFinanceStore((s) => s.budgets);
  const transactions = useFinanceStore((s) => s.transactions);
  const categories = useFinanceStore((s) => s.categories);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);
  const settings = useFinanceStore((s) => s.settings);
  const upsertBudget = useFinanceStore((s) => s.upsertBudget);
  const deleteBudget = useFinanceStore((s) => s.deleteBudget);
  const copyPreviousMonthBudgets = useFinanceStore((s) => s.copyPreviousMonthBudgets);

  const todayIso = getLocalTodayIso();
  const ratesMap = useMemo(() => ratesListToMap(exchangeRates), [exchangeRates]);

  const [selectedMonthKey, setSelectedMonthKey] = useState(() =>
    getFiscalMonthKey(todayIso, settings.monthStartDay),
  );
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Add / Edit modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [limitStr, setLimitStr] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(settings.baseCurrency);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<BudgetProgressItem | null>(null);

  const fiscalRange = useMemo(
    () => getFiscalMonthRange(selectedMonthKey, settings.monthStartDay),
    [selectedMonthKey, settings.monthStartDay],
  );

  const expenseCategories = useMemo(
    () =>
      categories
        .filter((c) => c.deletedAt === null && c.type === 'expense')
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  );

  const progressItems = useMemo(
    () =>
      computeBudgetProgress(
        budgets,
        transactions,
        categories,
        selectedMonthKey,
        settings.monthStartDay,
        ratesMap,
      ).sort((a, b) => {
        if (a.budget.categoryId === null && b.budget.categoryId !== null) return -1;
        if (a.budget.categoryId !== null && b.budget.categoryId === null) return 1;
        return b.pct - a.pct;
      }),
    [budgets, transactions, categories, selectedMonthKey, settings.monthStartDay, ratesMap],
  );

  const shiftMonth = (delta: -1 | 1) => {
    setFeedbackMsg(null);
    setSelectedMonthKey((prev) => addMonthsClamped(`${prev}-01`, delta).slice(0, 7));
  };

  const handleCopyPrevious = () => {
    const created = copyPreviousMonthBudgets(selectedMonthKey);
    if (created.length > 0) {
      setFeedbackMsg(`Önceki aydan ${created.length} adet bütçe limiti kopyalandı.`);
    } else {
      setFeedbackMsg('Önceki aydan kopyalanabilecek yeni bir bütçe limiti bulunamadı.');
    }
  };

  const openAddModal = () => {
    setEditingBudgetId(null);
    const hasGeneral = progressItems.some((item) => item.budget.categoryId === null);
    setSelectedCategoryId(hasGeneral ? (expenseCategories[0]?.id ?? null) : null);
    setLimitStr('');
    setCurrency(settings.baseCurrency);
    setFormError(null);
    setModalVisible(true);
  };

  const openEditModal = (item: BudgetProgressItem) => {
    setEditingBudgetId(item.budget.id);
    setSelectedCategoryId(item.budget.categoryId);
    setLimitStr(String(roundMoney(item.limit)).replace('.', ','));
    setCurrency(item.budget.currency);
    setFormError(null);
    setModalVisible(true);
  };

  const handleSaveBudget = () => {
    const parsedLimit = parsePositiveAmount(limitStr);
    if (parsedLimit === null) {
      setFormError('Lütfen 0’dan büyük geçerli bir bütçe limiti girin.');
      return;
    }

    upsertBudget({
      categoryId: selectedCategoryId,
      month: selectedMonthKey,
      limitAmount: parsedLimit,
      currency,
    });
    setModalVisible(false);
    setFeedbackMsg('Bütçe limiti kaydedildi.');
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
        <Card padding={14} style={styles.monthCard}>
          <View style={styles.monthHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Önceki Ay"
              onPress={() => shiftMonth(-1)}
              style={[styles.monthNavBtn, { backgroundColor: theme.colors.elevated }]}
            >
              <ChevronLeft size={18} color={theme.colors.text} />
              <Text style={[styles.monthNavLabel, { color: theme.colors.text }]}>Önceki Ay</Text>
            </Pressable>

            <View style={styles.monthCenter}>
              <Text style={[styles.monthTitle, { color: theme.colors.text }]}>
                {formatMonthTitleTr(selectedMonthKey)}
              </Text>
              <Text style={[styles.monthRange, TABULAR_NUMS_STYLE, { color: theme.colors.muted }]}>
                {formatShortDateTr(fiscalRange.startDate)} – {formatShortDateTr(fiscalRange.endDate)}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sonraki Ay"
              onPress={() => shiftMonth(1)}
              style={[styles.monthNavBtn, { backgroundColor: theme.colors.elevated }]}
            >
              <Text style={[styles.monthNavLabel, { color: theme.colors.text }]}>Sonraki Ay</Text>
              <ChevronRight size={18} color={theme.colors.text} />
            </Pressable>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              onPress={handleCopyPrevious}
              style={({ pressed }) => [
                styles.secondaryActionBtn,
                {
                  backgroundColor: theme.colors.elevated,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Copy size={14} color={theme.colors.accent} />
              <Text style={[styles.secondaryActionText, { color: theme.colors.text }]}>
                Önceki Aydan Kopyala
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={openAddModal}
              style={({ pressed }) => [
                styles.primaryActionBtn,
                { backgroundColor: theme.colors.accent, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Plus size={15} color="#FFFFFF" />
              <Text style={styles.primaryActionText}>Bütçe Ekle</Text>
            </Pressable>
          </View>

          {feedbackMsg ? (
            <View
              style={[
                styles.feedbackBanner,
                { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accent },
              ]}
            >
              <Text style={[styles.feedbackText, { color: theme.colors.text }]}>
                {feedbackMsg}
              </Text>
            </View>
          ) : null}
        </Card>

        {progressItems.length === 0 ? (
          <Card>
            <EmptyState
              title="Bu dönem için bütçe limiti yok"
              description="Genel aylık harcama limiti veya kategori bazlı bütçeler tanımlayarak harcamalarınızı kontrol altında tutun."
              actionLabel="Bütçe Limiti Ekle"
              onAction={openAddModal}
              icon={<Target size={24} color={theme.colors.muted} />}
            />
          </Card>
        ) : (
          <>
            <Card padding={16} style={styles.chartCard}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                Bütçe Gerçekleşmeleri
              </Text>
              <BudgetProgressBars
                items={progressItems}
                privacyMode={settings.privacyMode}
                onPressItem={openEditModal}
              />
            </Card>

            <Card padding={16} style={styles.manageCard}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                Limit Yönetimi ({progressItems.length})
              </Text>
              <View style={styles.manageList}>
                {progressItems.map((item) => (
                  <View
                    key={item.budget.id}
                    style={[
                      styles.manageRow,
                      { borderBottomColor: theme.colors.border },
                    ]}
                  >
                    <View style={styles.manageLeft}>
                      <View style={[styles.dot, { backgroundColor: item.categoryColor }]} />
                      <View style={styles.manageTextWrap}>
                        <Text style={[styles.manageName, { color: theme.colors.text }]}>
                          {item.categoryName}
                        </Text>
                        <Text style={[styles.manageMeta, { color: theme.colors.muted }]}>
                          Limit:{' '}
                          <MoneyText
                            amount={item.limit}
                            currency={item.budget.currency}
                            privacyMode={settings.privacyMode}
                            color={theme.colors.text}
                          />
                        </Text>
                      </View>
                    </View>

                    <View style={styles.manageActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Bütçeyi düzenle"
                        onPress={() => openEditModal(item)}
                        style={[styles.iconBtn, { backgroundColor: theme.colors.elevated }]}
                      >
                        <Pencil size={15} color={theme.colors.text} />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Bütçeyi sil"
                        onPress={() => setDeleteTarget(item)}
                        style={[styles.iconBtn, { backgroundColor: theme.colors.expenseSoft }]}
                      >
                        <Trash2 size={15} color={theme.colors.expense} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          </>
        )}
      </ScrollView>

      {/* Add / Edit Budget Modal */}
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
                {editingBudgetId ? 'Bütçe Limitini Düzenle' : 'Yeni Bütçe Limiti'}
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
              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>Kapsam</Text>
              <View style={styles.chipRow}>
                <Chip
                  label="Genel Aylık Bütçe"
                  selected={selectedCategoryId === null}
                  disabled={Boolean(editingBudgetId)}
                  color="#6366F1"
                  onPress={() => setSelectedCategoryId(null)}
                />
                {expenseCategories.map((cat) => (
                  <Chip
                    key={cat.id}
                    label={cat.name}
                    selected={selectedCategoryId === cat.id}
                    disabled={Boolean(editingBudgetId)}
                    color={cat.color}
                    onPress={() => setSelectedCategoryId(cat.id)}
                  />
                ))}
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

              <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                Aylık Limit Tutarı ({currency})
              </Text>
              <TextInput
                value={limitStr}
                onChangeText={setLimitStr}
                keyboardType="decimal-pad"
                placeholder="Örn. 15000"
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
                onPress={handleSaveBudget}
                style={({ pressed }) => [
                  styles.saveBtn,
                  { backgroundColor: theme.colors.accent, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={styles.saveBtnText}>Limiti Kaydet</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmModal
        visible={deleteTarget !== null}
        title="Bütçe Limitini Sil"
        message={
          deleteTarget
            ? `"${deleteTarget.categoryName}" için tanımlanan ${formatMonthTitleTr(selectedMonthKey)} bütçe limitini silmek istiyor musunuz?`
            : ''
        }
        confirmLabel="Sil"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteBudget(deleteTarget.budget.id);
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
  monthCard: {
    gap: 12,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  monthNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  monthNavLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  monthCenter: {
    alignItems: 'center',
    flex: 1,
  },
  monthTitle: {
    fontSize: 15,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  monthRange: {
    fontSize: 11,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  secondaryActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  feedbackBanner: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  feedbackText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chartCard: {
    gap: 12,
  },
  manageCard: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  manageList: {
    gap: 4,
  },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  manageLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  manageTextWrap: {
    flex: 1,
    gap: 2,
  },
  manageName: {
    fontSize: 14,
    fontWeight: '700',
  },
  manageMeta: {
    fontSize: 12,
  },
  manageActions: {
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
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
