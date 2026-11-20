import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import {
  Ban,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Lock,
  RefreshCw,
  Share2,
  ShieldAlert,
  Unlock,
} from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { parseIsoDate } from '@/domain/periods';
import type { PeriodType, SharedReport } from '@/domain/types';
import { getCurrentSession } from '@/services/authService';
import {
  buildShareUrl,
  listSharedReports,
  revokeSharedReport,
} from '@/services/sharedReportService';
import { TABULAR_NUMS_STYLE, useResponsiveLayout, useTheme } from '@/theme/theme';

const PERIOD_LABELS: Record<PeriodType, string> = {
  daily: 'Günlük',
  weekly: 'Haftalık',
  monthly: 'Aylık',
  yearly: 'Yıllık',
  custom: 'Özel',
};

type ReportStatus = 'active' | 'revoked' | 'expired';

function getReportStatus(report: SharedReport): ReportStatus {
  if (report.isRevoked) {
    return 'revoked';
  }
  if (report.expiresAt !== null && Date.parse(report.expiresAt) <= Date.now()) {
    return 'expired';
  }
  return 'active';
}

function formatShortTrDate(isoDateOrTimestamp: string): string {
  try {
    const datePart = isoDateOrTimestamp.slice(0, 10);
    const { year, month, day } = parseIsoDate(datePart);
    return new Intl.DateTimeFormat('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));
  } catch {
    return isoDateOrTimestamp;
  }
}

function formatRangeLabel(startDate: string, endDate: string): string {
  if (startDate === endDate) {
    return formatShortTrDate(startDate);
  }
  return `${formatShortTrDate(startDate)} – ${formatShortTrDate(endDate)}`;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  }

  return false;
}

export default function SharedReportsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { isWide, contentMaxWidth } = useResponsiveLayout();

  const [reports, setReports] = useState<SharedReport[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<SharedReport | null>(null);
  const [revoking, setRevoking] = useState(false);

  const loadReports = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const sessionUser = await getCurrentSession().catch(() => null);
      const resolvedUserId = sessionUser?.id ?? null;
      setUserId(resolvedUserId);

      const list = await listSharedReports(resolvedUserId);
      setReports(list);
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Paylaşılan raporlar yüklenirken bir hata oluştu.',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadReports(false);
    }, [loadReports]),
  );

  const handleShareOrCopy = async (report: SharedReport) => {
    setFeedback(null);
    const url = buildShareUrl(report.shareToken);

    try {
      if (Platform.OS === 'web') {
        const copied = await copyTextToClipboard(url);
        if (copied) {
          setFeedback({
            type: 'success',
            message: `"${report.title}" bağlantı adresi panoya kopyalandı.`,
          });
          return;
        }
      }

      if (Platform.OS !== 'web') {
        await Share.share({
          title: report.title,
          message: `${report.title}\n${url}`,
          url,
        });
        setFeedback({
          type: 'success',
          message: 'Paylaşım penceresi açıldı.',
        });
        return;
      }

      const copiedFallback = await copyTextToClipboard(url);
      if (copiedFallback) {
        setFeedback({
          type: 'success',
          message: 'Paylaşım bağlantısı panoya kopyalandı.',
        });
      } else {
        setFeedback({
          type: 'error',
          message: 'Bağlantı panoya kopyalanamadı.',
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'Bağlantı paylaşılırken veya kopyalanırken bir sorun oluştu.',
      });
    }
  };

  const handleConfirmRevoke = async () => {
    if (!revokeTarget) {
      return;
    }

    setRevoking(true);
    setFeedback(null);

    try {
      await revokeSharedReport(revokeTarget.id, userId);
      const revokedTitle = revokeTarget.title;
      setRevokeTarget(null);
      await loadReports(true);
      setFeedback({
        type: 'success',
        message: `"${revokedTitle}" paylaşım bağlantısı iptal edildi.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Paylaşım iptal edilirken bir hata oluştu.',
      });
    } finally {
      setRevoking(false);
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
        <View style={styles.topRow}>
          <View style={styles.topInfo}>
            <Text style={[styles.subtitle, { color: theme.colors.muted }]}>
              Raporlar sekmesinden oluşturduğunuz salt-okunur bağlantıları buradan
              önizleyebilir, paylaşabilir veya iptal edebilirsiniz.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Listeyi yenile"
            disabled={loading || refreshing}
            onPress={() => void loadReports(true)}
            style={({ pressed }) => [
              styles.refreshBtn,
              {
                backgroundColor: theme.colors.elevated,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                opacity: loading || refreshing ? 0.55 : pressed ? 0.78 : 1,
              },
            ]}
          >
            <RefreshCw size={15} color={theme.colors.text} />
            <Text style={[styles.refreshBtnText, { color: theme.colors.text }]}>
              Yenile
            </Text>
          </Pressable>
        </View>

        {feedback ? (
          <View
            style={[
              styles.feedbackBanner,
              {
                backgroundColor:
                  feedback.type === 'success'
                    ? theme.colors.incomeSoft
                    : theme.colors.expenseSoft,
                borderColor:
                  feedback.type === 'success'
                    ? theme.colors.income
                    : theme.colors.expense,
                borderRadius: theme.radius.md,
              },
            ]}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 size={16} color={theme.colors.income} />
            ) : (
              <ShieldAlert size={16} color={theme.colors.expense} />
            )}
            <Text
              style={[
                styles.feedbackText,
                {
                  color:
                    feedback.type === 'success'
                      ? theme.colors.income
                      : theme.colors.expense,
                },
              ]}
            >
              {feedback.message}
            </Text>
          </View>
        ) : null}

        {loading ? (
          <Card style={styles.loadingCard}>
            <ActivityIndicator size="large" color={theme.colors.accent} />
            <Text style={[styles.loadingText, { color: theme.colors.muted }]}>
              Paylaşılan raporlar yükleniyor...
            </Text>
          </Card>
        ) : reports.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Share2 size={24} color={theme.colors.accent} />}
              title="Henüz Paylaşılan Rapor Yok"
              description="Raporlar sekmesindeki 'Paylaş / Dışa Aktar' düğmesini kullanarak istediğiniz dönem için salt-okunur canlı rapor bağlantısı oluşturabilirsiniz."
              actionLabel="Raporlara Git"
              onAction={() => router.push('/(tabs)/reports' as Href)}
            />
          </Card>
        ) : (
          <View style={styles.list}>
            {reports.map((report) => {
              const status = getReportStatus(report);
              const isActive = status === 'active';

              const statusColor =
                status === 'active'
                  ? theme.colors.income
                  : status === 'expired'
                    ? theme.colors.warning
                    : theme.colors.expense;
              const statusBg =
                status === 'active'
                  ? theme.colors.incomeSoft
                  : status === 'expired'
                    ? theme.colors.warningSoft
                    : theme.colors.expenseSoft;
              const statusLabel =
                status === 'active'
                  ? 'Aktif'
                  : status === 'expired'
                    ? 'Süresi Doldu'
                    : 'İptal Edildi';

              return (
                <Card key={report.id} style={styles.reportCard} padding={16}>
                  <View style={styles.cardHeader}>
                    <View style={styles.titleBlock}>
                      <Text
                        numberOfLines={2}
                        style={[styles.reportTitle, { color: theme.colors.text }]}
                      >
                        {report.title}
                      </Text>
                      <View style={styles.rangeRow}>
                        <Calendar size={13} color={theme.colors.muted} />
                        <Text
                          style={[
                            styles.rangeText,
                            TABULAR_NUMS_STYLE,
                            { color: theme.colors.muted },
                          ]}
                        >
                          {formatRangeLabel(report.startDate, report.endDate)}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                      <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                        {statusLabel}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.badgesRow}>
                    <View
                      style={[
                        styles.metaBadge,
                        {
                          backgroundColor: theme.colors.accentSoft,
                          borderColor: theme.colors.accent,
                        },
                      ]}
                    >
                      <Text style={[styles.metaBadgeText, { color: theme.colors.accent }]}>
                        {PERIOD_LABELS[report.periodType]}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.metaBadge,
                        {
                          backgroundColor: theme.colors.elevated,
                          borderColor: theme.colors.border,
                        },
                      ]}
                    >
                      {report.includeTransactions ? (
                        <FileText size={12} color={theme.colors.text} />
                      ) : (
                        <EyeOff size={12} color={theme.colors.muted} />
                      )}
                      <Text style={[styles.metaBadgeText, { color: theme.colors.text }]}>
                        {report.includeTransactions ? 'İşlemler Açık' : 'Sadece Özet'}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.metaBadge,
                        {
                          backgroundColor: theme.colors.elevated,
                          borderColor: theme.colors.border,
                        },
                      ]}
                    >
                      {report.includeNotes ? (
                        <Unlock size={12} color={theme.colors.text} />
                      ) : (
                        <Lock size={12} color={theme.colors.muted} />
                      )}
                      <Text style={[styles.metaBadgeText, { color: theme.colors.text }]}>
                        {report.includeNotes ? 'Notlar Açık' : 'Notlar Gizli'}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.metaFooter,
                      {
                        borderTopColor: theme.colors.border,
                      },
                    ]}
                  >
                    <View style={styles.metaFooterItem}>
                      <Eye size={14} color={theme.colors.muted} />
                      <Text
                        style={[
                          styles.metaFooterText,
                          TABULAR_NUMS_STYLE,
                          { color: theme.colors.muted },
                        ]}
                      >
                        {report.viewCount} görüntülenme
                      </Text>
                    </View>

                    <View style={styles.metaFooterItem}>
                      <Clock size={14} color={theme.colors.muted} />
                      <Text
                        style={[
                          styles.metaFooterText,
                          TABULAR_NUMS_STYLE,
                          { color: theme.colors.muted },
                        ]}
                      >
                        {report.expiresAt
                          ? `Son geçerlilik: ${formatShortTrDate(report.expiresAt)}`
                          : 'Süresiz'}
                      </Text>
                    </View>
                  </View>

                  {isActive ? (
                    <View style={styles.actionsRow}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          router.push(`/shared/${report.shareToken}` as Href)
                        }
                        style={({ pressed }) => [
                          styles.actionBtn,
                          {
                            backgroundColor: theme.colors.accent,
                            borderColor: theme.colors.accent,
                            borderRadius: theme.radius.md,
                            opacity: pressed ? 0.85 : 1,
                          },
                        ]}
                      >
                        <Eye size={15} color="#FFFFFF" />
                        <Text style={styles.primaryActionText}>Önizle</Text>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void handleShareOrCopy(report)}
                        style={({ pressed }) => [
                          styles.actionBtn,
                          styles.actionBtnGrow,
                          {
                            backgroundColor: theme.colors.elevated,
                            borderColor: theme.colors.border,
                            borderRadius: theme.radius.md,
                            opacity: pressed ? 0.78 : 1,
                          },
                        ]}
                      >
                        {Platform.OS === 'web' ? (
                          <Copy size={15} color={theme.colors.text} />
                        ) : (
                          <Share2 size={15} color={theme.colors.text} />
                        )}
                        <Text
                          numberOfLines={1}
                          style={[styles.secondaryActionText, { color: theme.colors.text }]}
                        >
                          Linki Kopyala / Paylaş
                        </Text>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setRevokeTarget(report)}
                        style={({ pressed }) => [
                          styles.actionBtn,
                          {
                            backgroundColor: theme.colors.expenseSoft,
                            borderColor: theme.colors.expense,
                            borderRadius: theme.radius.md,
                            opacity: pressed ? 0.78 : 1,
                          },
                        ]}
                      >
                        <Ban size={15} color={theme.colors.expense} />
                        <Text
                          style={[
                            styles.secondaryActionText,
                            { color: theme.colors.expense },
                          ]}
                        >
                          İptal Et
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>

      <ConfirmModal
        visible={revokeTarget !== null}
        title="Paylaşımı İptal Et"
        message={
          revokeTarget
            ? `"${revokeTarget.title}" raporu için oluşturulan paylaşım bağlantısı kalıcı olarak iptal edilecek ve artık açılamayacaktır. Devam etmek istiyor musunuz?`
            : ''
        }
        confirmLabel="İptal Et"
        cancelLabel="Vazgeç"
        destructive
        loading={revoking}
        onConfirm={() => void handleConfirmRevoke()}
        onCancel={() => {
          if (!revoking) {
            setRevokeTarget(null);
          }
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  topInfo: {
    flex: 1,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  refreshBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  feedbackText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  loadingCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    gap: 12,
  },
  reportCard: {
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleBlock: {
    flex: 1,
    gap: 4,
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rangeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  metaBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  metaFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  metaFooterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaFooterText: {
    fontSize: 12,
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 2,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  actionBtnGrow: {
    flexGrow: 1,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
