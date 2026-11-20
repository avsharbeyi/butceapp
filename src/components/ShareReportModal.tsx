import React, { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Check,
  Copy,
  FileSpreadsheet,
  FileText,
  Link2,
  Share2,
  X,
} from 'lucide-react-native';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { buildSharedReportSnapshot, filterReportTransactions } from '@/domain/analytics';
import type {
  Account,
  Budget,
  Category,
  CurrencyCode,
  DateRange,
  PeriodType,
  Transaction,
} from '@/domain/types';
import { getCurrentSession } from '@/services/authService';
import {
  generateTransactionsCsv,
  shareCsvFile,
  sharePdfReport,
} from '@/services/exportService';
import { buildShareUrl, createSharedReport } from '@/services/sharedReportService';
import { useResponsiveLayout, useTheme } from '@/theme/theme';

export interface ShareReportModalProps {
  visible: boolean;
  onClose: () => void;
  periodType: PeriodType;
  range: DateRange;
  prevRange: DateRange;
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  baseCurrency: CurrencyCode;
  monthStartDay: number;
  rates: Record<CurrencyCode, number>;
  accounts: Account[];
}

type ExpiryOption = 7 | 30 | 'never';

const EXPIRY_OPTIONS: Array<{ value: ExpiryOption; label: string }> = [
  { value: 7, label: '7 Gün' },
  { value: 30, label: '30 Gün' },
  { value: 'never', label: 'Süresiz' },
];

export function ShareReportModal({
  visible,
  onClose,
  periodType,
  range,
  prevRange,
  transactions,
  categories,
  budgets,
  baseCurrency,
  monthStartDay,
  rates,
  accounts,
}: ShareReportModalProps) {
  const theme = useTheme();
  const { isWide } = useResponsiveLayout();

  const defaultTitle = `Finansal Rapor (${range.startDate} – ${range.endDate})`;

  const [title, setTitle] = useState(defaultTitle);
  const [expiry, setExpiry] = useState<ExpiryOption>(7);
  const [includeTransactions, setIncludeTransactions] = useState(false);
  const [hideNotes, setHideNotes] = useState(true);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busyAction, setBusyAction] = useState<'link' | 'pdf' | 'csv' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setTitle(`Finansal Rapor (${range.startDate} – ${range.endDate})`);
    setExpiry(7);
    setIncludeTransactions(false);
    setHideNotes(true);
    setShareUrl(null);
    setCopied(false);
    setBusyAction(null);
    setStatusMessage(null);
    setErrorMessage(null);
  }, [visible, range.startDate, range.endDate]);

  const resolvedTitle = title.trim() || defaultTitle;
  const includeNotes = !hideNotes;

  const buildSnapshot = () =>
    buildSharedReportSnapshot({
      title: resolvedTitle,
      periodType,
      range,
      prevRange,
      transactions,
      categories,
      budgets,
      baseCurrency,
      monthStartDay,
      rates,
      includeTransactions,
      includeNotes,
    });

  const handleCreateLink = async () => {
    setBusyAction('link');
    setErrorMessage(null);
    setStatusMessage(null);
    setCopied(false);

    try {
      const sessionUser = await getCurrentSession();
      const snapshot = buildSnapshot();
      const created = await createSharedReport({
        title: resolvedTitle,
        periodType,
        startDate: range.startDate,
        endDate: range.endDate,
        includeTransactions,
        includeNotes,
        snapshot,
        expiresInDays: expiry === 'never' ? null : expiry,
        userId: sessionUser?.id ?? null,
      });
      setShareUrl(buildShareUrl(created.shareToken));
      setStatusMessage('Paylaşım bağlantısı oluşturuldu.');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Paylaşım bağlantısı oluşturulamadı.',
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    setErrorMessage(null);

    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setStatusMessage('Bağlantı panoya kopyalandı.');
        return;
      }

      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = shareUrl;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopied(true);
        setStatusMessage('Bağlantı panoya kopyalandı.');
        return;
      }

      await Share.share({
        title: resolvedTitle,
        message: shareUrl,
      });
    } catch {
      setErrorMessage('Bağlantı kopyalanamadı. Paylaş düğmesini deneyebilirsiniz.');
    }
  };

  const handleNativeShareLink = async () => {
    if (!shareUrl) return;
    setErrorMessage(null);
    try {
      await Share.share({
        title: resolvedTitle,
        message: `${resolvedTitle}\n${shareUrl}`,
        url: shareUrl,
      });
    } catch {
      setErrorMessage('Paylaşım penceresi açılamadı.');
    }
  };

  const handleExportPdf = async () => {
    setBusyAction('pdf');
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const snapshot = buildSnapshot();
      await sharePdfReport(snapshot, `butce-raporu-${range.startDate}.pdf`);
      setStatusMessage(
        Platform.OS === 'web'
          ? 'PDF yazdırma/indirme penceresi açıldı.'
          : 'PDF raporu paylaşım için hazırlandı.',
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'PDF raporu oluşturulamadı.',
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleExportCsv = async () => {
    setBusyAction('csv');
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const filtered = filterReportTransactions(transactions, range);
      const csv = generateTransactionsCsv(filtered, accounts, categories);
      await shareCsvFile(csv, `butce-islemler-${range.startDate}.csv`);
      setStatusMessage('CSV dosyası dışa aktarıldı.');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'CSV dosyası dışa aktarılamadı.',
      );
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View
          style={[
            styles.dialog,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.xl,
              maxWidth: isWide ? 540 : '100%',
            },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
              Raporu Paylaş ve Dışa Aktar
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
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                styles.sectionCard,
                {
                  backgroundColor: theme.colors.elevated,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.lg,
                },
              ]}
            >
              <View style={styles.sectionHeader}>
                <Link2 size={16} color={theme.colors.accent} />
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  Canlı Paylaşım Bağlantısı
                </Text>
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                  Rapor Başlığı
                </Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Rapor başlığı girin"
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

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
                  Geçerlilik Süresi
                </Text>
                <SegmentedControl
                  options={EXPIRY_OPTIONS}
                  value={expiry}
                  onChange={setExpiry}
                />
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchTextWrap}>
                  <Text style={[styles.switchLabel, { color: theme.colors.text }]}>
                    İşlem listesini dahil et
                  </Text>
                  <Text style={[styles.switchHint, { color: theme.colors.muted }]}>
                    Kapalıyken yalnızca özet grafikler paylaşılır
                  </Text>
                </View>
                <Switch
                  value={includeTransactions}
                  onValueChange={setIncludeTransactions}
                  trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
                />
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchTextWrap}>
                  <Text style={[styles.switchLabel, { color: theme.colors.text }]}>
                    Notları gizle
                  </Text>
                  <Text style={[styles.switchHint, { color: theme.colors.muted }]}>
                    Özel işlem notlarını ve etiketleri paylaşımdan çıkarır
                  </Text>
                </View>
                <Switch
                  value={hideNotes}
                  onValueChange={setHideNotes}
                  trackColor={{ false: theme.colors.border, true: theme.colors.income }}
                />
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={busyAction !== null}
                onPress={() => void handleCreateLink()}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: theme.colors.accent,
                    borderRadius: theme.radius.md,
                    opacity: busyAction !== null ? 0.65 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Link2 size={16} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>
                  {busyAction === 'link'
                    ? 'Bağlantı Oluşturuluyor...'
                    : 'Paylaşım Linki Oluştur'}
                </Text>
              </Pressable>

              {shareUrl ? (
                <View
                  style={[
                    styles.urlResultBox,
                    {
                      backgroundColor: theme.colors.card,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radius.md,
                    },
                  ]}
                >
                  <Text
                    selectable
                    numberOfLines={2}
                    style={[styles.urlText, { color: theme.colors.text }]}
                  >
                    {shareUrl}
                  </Text>

                  <View style={styles.urlActions}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void handleCopyLink()}
                      style={({ pressed }) => [
                        styles.secondaryButton,
                        {
                          backgroundColor: theme.colors.elevated,
                          borderColor: theme.colors.border,
                          borderRadius: theme.radius.sm,
                          opacity: pressed ? 0.78 : 1,
                        },
                      ]}
                    >
                      {copied ? (
                        <Check size={15} color={theme.colors.income} />
                      ) : (
                        <Copy size={15} color={theme.colors.text} />
                      )}
                      <Text
                        style={[
                          styles.secondaryButtonText,
                          {
                            color: copied ? theme.colors.income : theme.colors.text,
                          },
                        ]}
                      >
                        {copied ? 'Kopyalandı' : 'Kopyala'}
                      </Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void handleNativeShareLink()}
                      style={({ pressed }) => [
                        styles.secondaryButton,
                        {
                          backgroundColor: theme.colors.accentSoft,
                          borderColor: theme.colors.accent,
                          borderRadius: theme.radius.sm,
                          opacity: pressed ? 0.78 : 1,
                        },
                      ]}
                    >
                      <Share2 size={15} color={theme.colors.accent} />
                      <Text
                        style={[
                          styles.secondaryButtonText,
                          { color: theme.colors.accent },
                        ]}
                      >
                        Paylaş
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>

            <View
              style={[
                styles.sectionCard,
                {
                  backgroundColor: theme.colors.elevated,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.lg,
                },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                Dosya Olarak Dışa Aktar
              </Text>

              <Pressable
                accessibilityRole="button"
                disabled={busyAction !== null}
                onPress={() => void handleExportPdf()}
                style={({ pressed }) => [
                  styles.exportButton,
                  {
                    backgroundColor: theme.colors.card,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.md,
                    opacity: busyAction !== null ? 0.65 : pressed ? 0.8 : 1,
                  },
                ]}
              >
                <FileText size={18} color={theme.colors.expense} />
                <Text style={[styles.exportButtonText, { color: theme.colors.text }]}>
                  {busyAction === 'pdf'
                    ? 'PDF Hazırlanıyor...'
                    : 'PDF Rapor İndir / Paylaş'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={busyAction !== null}
                onPress={() => void handleExportCsv()}
                style={({ pressed }) => [
                  styles.exportButton,
                  {
                    backgroundColor: theme.colors.card,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.md,
                    opacity: busyAction !== null ? 0.65 : pressed ? 0.8 : 1,
                  },
                ]}
              >
                <FileSpreadsheet size={18} color={theme.colors.income} />
                <Text style={[styles.exportButtonText, { color: theme.colors.text }]}>
                  {busyAction === 'csv'
                    ? 'CSV Hazırlanıyor...'
                    : 'CSV (Excel) İndir / Paylaş'}
                </Text>
              </Pressable>
            </View>

            {statusMessage ? (
              <Text style={[styles.statusText, { color: theme.colors.income }]}>
                {statusMessage}
              </Text>
            ) : null}

            {errorMessage ? (
              <Text style={[styles.statusText, { color: theme.colors.expense }]}>
                {errorMessage}
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  dialog: {
    width: '100%',
    maxHeight: '92%',
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
  content: {
    padding: 16,
    gap: 14,
  },
  sectionCard: {
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  switchTextWrap: {
    flex: 1,
    gap: 2,
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  switchHint: {
    fontSize: 11,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  urlResultBox: {
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  urlText: {
    fontSize: 12,
    lineHeight: 18,
  },
  urlActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  exportButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
