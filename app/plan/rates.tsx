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
import { Coins, RefreshCw, RotateCcw, X } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import type { CurrencyCode, ExchangeRate } from '@/domain/types';
import { useFinanceStore } from '@/store/useFinanceStore';
import { TABULAR_NUMS_STYLE, useResponsiveLayout, useTheme } from '@/theme/theme';

const CURRENCY_ORDER: readonly CurrencyCode[] = ['TRY', 'USD', 'EUR', 'GBP', 'XAU'];

const CURRENCY_NAMES: Record<CurrencyCode, string> = {
  TRY: 'Türk Lirası',
  USD: 'Amerikan Doları',
  EUR: 'Euro',
  GBP: 'İngiliz Sterlini',
  XAU: 'Gram Altın',
};

function formatRateTr(value: number): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function formatUpdatedAtTr(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function RatesScreen() {
  const theme = useTheme();
  const { isWide, contentMaxWidth } = useResponsiveLayout();

  const exchangeRates = useFinanceStore((s) => s.exchangeRates);
  const setManualRate = useFinanceStore((s) => s.setManualRate);
  const resetRateToAuto = useFinanceStore((s) => s.resetRateToAuto);
  const refreshLiveRates = useFinanceStore((s) => s.refreshLiveRates);

  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<ExchangeRate | null>(null);
  const [rateStr, setRateStr] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  const orderedRates = useMemo(() => {
    const byCode = new Map(exchangeRates.map((r) => [r.currencyCode, r]));
    return CURRENCY_ORDER.map(
      (code) =>
        byCode.get(code) ?? {
          currencyCode: code,
          rateToTry: code === 'TRY' ? 1 : 0,
          source: 'auto' as const,
          updatedAt: new Date().toISOString(),
        },
    );
  }, [exchangeRates]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setFeedback(null);
    try {
      await refreshLiveRates();
      setFeedback('Otomatik döviz ve altın kurları güncellendi.');
    } catch {
      setFeedback('Canlı kurlar alınamadı. Mevcut kurlar korunuyor.');
    } finally {
      setRefreshing(false);
    }
  };

  const openEditModal = (rate: ExchangeRate) => {
    if (rate.currencyCode === 'TRY') return;
    setEditTarget(rate);
    setRateStr(String(rate.rateToTry).replace('.', ','));
    setModalError(null);
  };

  const handleSaveManualRate = () => {
    if (!editTarget) return;
    const normalized = rateStr.trim().replace(/\s+/g, '').replace(',', '.');
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setModalError('Lütfen 0’dan büyük geçerli bir kur değeri girin.');
      return;
    }

    setManualRate(editTarget.currencyCode, parsed);
    setFeedback(`${editTarget.currencyCode} kuru manuel olarak sabitlendi.`);
    setEditTarget(null);
  };

  const handleResetToAuto = async () => {
    if (!editTarget) return;
    const code = editTarget.currencyCode;
    resetRateToAuto(code);
    setEditTarget(null);
    setRefreshing(true);
    try {
      await refreshLiveRates();
      setFeedback(`${code} kuru otomatik moda döndürüldü ve güncellendi.`);
    } catch {
      setFeedback(`${code} kuru otomatik moda döndürüldü.`);
    } finally {
      setRefreshing(false);
    }
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
        <Card padding={16} style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View style={[styles.iconBox, { backgroundColor: theme.colors.accentSoft }]}>
              <Coins size={20} color={theme.colors.accent} />
            </View>
            <View style={styles.headerText}>
              <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
                TRY Bazlı Döviz & Altın Kurları
              </Text>
              <Text style={[styles.headerSubtitle, { color: theme.colors.muted }]}>
                Manuel sabitlediğiniz kurlar otomatik yenilemede korunur. Değiştirmek için ilgili
                para birimine dokunun.
              </Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={refreshing}
            onPress={() => void handleRefresh()}
            style={({ pressed }) => [
              styles.refreshBtn,
              {
                backgroundColor: theme.colors.accent,
                opacity: refreshing ? 0.65 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <RefreshCw size={15} color="#FFFFFF" />
            <Text style={styles.refreshBtnText}>
              {refreshing ? 'Kurlar Güncelleniyor...' : 'Canlı Kurları Güncelle'}
            </Text>
          </Pressable>

          {feedback ? (
            <View
              style={[
                styles.feedbackBanner,
                { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accent },
              ]}
            >
              <Text style={[styles.feedbackText, { color: theme.colors.text }]}>{feedback}</Text>
            </View>
          ) : null}
        </Card>

        <View style={styles.list}>
          {orderedRates.map((rate) => {
            const isTry = rate.currencyCode === 'TRY';
            const isManual = rate.source === 'manual';

            const content = (
              <Card style={styles.rateCard} padding={16}>
                <View style={styles.rateRow}>
                  <View style={styles.rateLeft}>
                    <View style={styles.codeRow}>
                      <Text style={[styles.codeText, { color: theme.colors.text }]}>
                        {rate.currencyCode}
                      </Text>
                      <View
                        style={[
                          styles.sourceBadge,
                          {
                            backgroundColor: isManual
                              ? theme.colors.warningSoft
                              : theme.colors.incomeSoft,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.sourceText,
                            { color: isManual ? theme.colors.warning : theme.colors.income },
                          ]}
                        >
                          {isManual ? 'Manuel' : 'Otomatik'}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.currencyName, { color: theme.colors.muted }]}>
                      {CURRENCY_NAMES[rate.currencyCode]}
                    </Text>
                  </View>

                  <View style={styles.rateRight}>
                    <Text style={[styles.rateValue, TABULAR_NUMS_STYLE, { color: theme.colors.text }]}>
                      {formatRateTr(rate.rateToTry)} ₺
                    </Text>
                    <Text style={[styles.updatedText, TABULAR_NUMS_STYLE, { color: theme.colors.muted }]}>
                      {formatUpdatedAtTr(rate.updatedAt)}
                    </Text>
                  </View>
                </View>
              </Card>
            );

            if (isTry) {
              return <View key={rate.currencyCode}>{content}</View>;
            }

            return (
              <Pressable
                key={rate.currencyCode}
                accessibilityRole="button"
                onPress={() => openEditModal(rate)}
                style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
              >
                {content}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Modal
        visible={editTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEditTarget(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.modalBackdrop, { backgroundColor: theme.colors.overlay }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditTarget(null)} />
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                {editTarget ? `${editTarget.currencyCode} Kurunu Düzenle` : ''}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setEditTarget(null)}
                style={[styles.closeBtn, { backgroundColor: theme.colors.elevated }]}
              >
                <X size={18} color={theme.colors.text} />
              </Pressable>
            </View>

            {editTarget ? (
              <View style={styles.modalBody}>
                <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                  1 {editTarget.currencyCode} = Kaç TRY?
                </Text>
                <TextInput
                  value={rateStr}
                  onChangeText={setRateStr}
                  keyboardType="decimal-pad"
                  placeholder="Örn. 36,50"
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

                {modalError ? (
                  <Text style={[styles.errorText, { color: theme.colors.expense }]}>
                    {modalError}
                  </Text>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  onPress={handleSaveManualRate}
                  style={({ pressed }) => [
                    styles.saveBtn,
                    { backgroundColor: theme.colors.accent, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Text style={styles.saveBtnText}>Manuel Kuru Kaydet</Text>
                </Pressable>

                {editTarget.source === 'manual' ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void handleResetToAuto()}
                    style={({ pressed }) => [
                      styles.secondaryBtn,
                      {
                        backgroundColor: theme.colors.elevated,
                        borderColor: theme.colors.border,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <RotateCcw size={15} color={theme.colors.text} />
                    <Text style={[styles.secondaryBtnText, { color: theme.colors.text }]}>
                      Otomatik Kura Dön
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  headerCard: {
    gap: 12,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 12,
    lineHeight: 18,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 11,
  },
  refreshBtnText: {
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
  list: {
    gap: 10,
  },
  rateCard: {},
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rateLeft: {
    gap: 3,
    flex: 1,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  codeText: {
    fontSize: 16,
    fontWeight: '800',
  },
  sourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  sourceText: {
    fontSize: 11,
    fontWeight: '700',
  },
  currencyName: {
    fontSize: 12,
  },
  rateRight: {
    alignItems: 'flex-end',
    gap: 3,
  },
  rateValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  updatedText: {
    fontSize: 11,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  modalSheet: {
    width: '100%',
    maxWidth: 420,
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
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
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
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
