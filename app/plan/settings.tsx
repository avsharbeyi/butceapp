import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useFocusEffect } from 'expo-router';
import {
  Cloud,
  CloudOff,
  Download,
  Fingerprint,
  Lock,
  LogOut,
  Minus,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { toIsoDate } from '@/domain/periods';
import type { CurrencyCode, FinanceDataSnapshot, ThemeMode } from '@/domain/types';
import {
  type AuthUser,
  getCurrentSession,
  resetPassword,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  signUpWithEmail,
  syncWithSupabase,
} from '@/services/authService';
import { exportBackupJson, parseBackupJson, shareJsonBackup } from '@/services/exportService';
import { requestNotificationPermission } from '@/services/notificationService';
import {
  clearPin,
  hasPin,
  isBiometricAvailable,
  savePin,
} from '@/services/securityService';
import { isSupabaseConfigured } from '@/services/supabase';
import { useFinanceStore } from '@/store/useFinanceStore';
import { TABULAR_NUMS_STYLE, useResponsiveLayout, useTheme } from '@/theme/theme';

const CURRENCIES: CurrencyCode[] = ['TRY', 'USD', 'EUR', 'GBP', 'XAU'];

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'system', label: 'Sistem' },
  { value: 'dark', label: 'Koyu' },
  { value: 'light', label: 'Açık' },
];

const CATEGORY_TYPE_OPTIONS: Array<{ value: 'expense' | 'income'; label: string }> = [
  { value: 'expense', label: 'Gider' },
  { value: 'income', label: 'Gelir' },
];

const RESTORE_MODE_OPTIONS: Array<{ value: 'merge' | 'replace'; label: string }> = [
  { value: 'merge', label: 'Birleştir (Önerilen)' },
  { value: 'replace', label: 'Sıfırla ve Yükle' },
];

const COLOR_SWATCHES = [
  '#3B82F6',
  '#10B981',
  '#EF4444',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#14B8A6',
] as const;

function getLocalTodayIso(): string {
  const now = new Date();
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function formatDateTimeTr(iso: string | null): string {
  if (!iso) return 'Henüz eşitlenmedi';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function hasNonDemoLocalData(snapshot: FinanceDataSnapshot): boolean {
  const hasReal = <T extends { deletedAt: string | null; isDemo?: boolean }>(items: T[]) =>
    items.some((item) => item.deletedAt === null && item.isDemo !== true);

  return (
    hasReal(snapshot.accounts) ||
    hasReal(snapshot.transactions) ||
    hasReal(snapshot.installmentPlans) ||
    hasReal(snapshot.recurringRules) ||
    hasReal(snapshot.budgets) ||
    hasReal(snapshot.savingsGoals) ||
    hasReal(snapshot.debts) ||
    snapshot.categories.some(
      (c) => c.deletedAt === null && !c.isDefault && c.isDemo !== true,
    )
  );
}

export default function SettingsScreen() {
  const theme = useTheme();
  const { isWide, contentMaxWidth } = useResponsiveLayout();

  const settings = useFinanceStore((s) => s.settings);
  const categories = useFinanceStore((s) => s.categories);
  const syncStatus = useFinanceStore((s) => s.syncStatus);
  const lastSyncedAt = useFinanceStore((s) => s.lastSyncedAt);
  const updateSettings = useFinanceStore((s) => s.updateSettings);
  const addCategory = useFinanceStore((s) => s.addCategory);
  const deleteCategory = useFinanceStore((s) => s.deleteCategory);
  const loadDemoData = useFinanceStore((s) => s.loadDemoData);
  const clearAllData = useFinanceStore((s) => s.clearAllData);
  const restoreFromBackup = useFinanceStore((s) => s.restoreFromBackup);
  const applyCloudState = useFinanceStore((s) => s.applyCloudState);
  const clearUserLocalDataOnSignOut = useFinanceStore((s) => s.clearUserLocalDataOnSignOut);
  const setSyncStatus = useFinanceStore((s) => s.setSyncStatus);
  const getDataSnapshot = useFinanceStore((s) => s.getDataSnapshot);

  const supabaseReady = isSupabaseConfigured();
  const todayIso = getLocalTodayIso();

  // Auth & Sync state
  const [sessionUser, setSessionUser] = useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [authFeedback, setAuthFeedback] = useState<{
    type: 'info' | 'error';
    text: string;
  } | null>(null);
  const [mergePromptUser, setMergePromptUser] = useState<AuthUser | null>(null);
  const [signOutConfirmVisible, setSignOutConfirmVisible] = useState(false);
  const autoCheckedUsersRef = useRef<Set<string>>(new Set());

  // Security & PIN state
  const [pinConfigured, setPinConfigured] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [enableLockAfterPin, setEnableLockAfterPin] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [removePinConfirmVisible, setRemovePinConfirmVisible] = useState(false);

  // Preferences feedback
  const [prefFeedback, setPrefFeedback] = useState<string | null>(null);

  // Custom Categories state
  const [catTab, setCatTab] = useState<'expense' | 'income'>('expense');
  const [catModalVisible, setCatModalVisible] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState<string>(COLOR_SWATCHES[0]);
  const [catError, setCatError] = useState<string | null>(null);
  const [deleteCatTarget, setDeleteCatTarget] = useState<{ id: string; name: string } | null>(null);

  // Backup / Restore / Demo / Reset state
  const [backupFeedback, setBackupFeedback] = useState<{
    type: 'info' | 'error';
    text: string;
  } | null>(null);
  const [restoreModalVisible, setRestoreModalVisible] = useState(false);
  const [restoreJson, setRestoreJson] = useState('');
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreReplaceConfirmVisible, setRestoreReplaceConfirmVisible] = useState(false);
  const [demoConfirmVisible, setDemoConfirmVisible] = useState(false);
  const [resetConfirmVisible, setResetConfirmVisible] = useState(false);

  const performCloudSync = useCallback(
    async (user: AuthUser, mode: 'merge' | 'cloud_only') => {
      setSyncBusy(true);
      setSyncStatus('syncing');
      setAuthFeedback(null);
      try {
        const { nextState } = await syncWithSupabase(user.id, getDataSnapshot(), mode);
        applyCloudState(nextState);
        setAuthFeedback({
          type: 'info',
          text: 'Verileriniz bulutla başarıyla eşitlendi.',
        });
      } catch (err) {
        setSyncStatus('error');
        setAuthFeedback({
          type: 'error',
          text:
            err instanceof Error
              ? err.message
              : 'Bulut senkronizasyonu sırasında bir hata oluştu.',
        });
      } finally {
        setSyncBusy(false);
      }
    },
    [applyCloudState, getDataSnapshot, setSyncStatus],
  );

  const handleAuthenticatedUser = useCallback(
    async (user: AuthUser) => {
      setSessionUser(user);
      if (hasNonDemoLocalData(getDataSnapshot())) {
        setMergePromptUser(user);
      } else {
        await performCloudSync(user, 'merge');
      }
    },
    [getDataSnapshot, performCloudSync],
  );

  const refreshSecurityStatus = useCallback(async () => {
    const [configured, bio] = await Promise.all([hasPin(), isBiometricAvailable()]);
    setPinConfigured(configured);
    setBioAvailable(bio);
  }, []);

  useEffect(() => {
    void refreshSecurityStatus();
  }, [refreshSecurityStatus]);

  useFocusEffect(
    useCallback(() => {
      void refreshSecurityStatus();
      if (!supabaseReady) {
        return;
      }

      let active = true;
      void getCurrentSession()
        .then((user) => {
          if (!active) return;
          setSessionUser(user);
          if (user && !autoCheckedUsersRef.current.has(user.id)) {
            autoCheckedUsersRef.current.add(user.id);
            const state = useFinanceStore.getState();
            if (state.lastSyncedAt === null) {
              if (hasNonDemoLocalData(state.getDataSnapshot())) {
                setMergePromptUser(user);
              } else {
                void performCloudSync(user, 'merge');
              }
            }
          }
        })
        .catch(() => {});

      return () => {
        active = false;
      };
    }, [supabaseReady, refreshSecurityStatus, performCloudSync]),
  );

  const handleEmailAuth = async () => {
    if (authBusy) return;
    setAuthBusy(true);
    setAuthFeedback(null);
    try {
      const result =
        authMode === 'signin'
          ? await signInWithEmail(email, password)
          : await signUpWithEmail(email, password);

      if (!result.ok) {
        setAuthFeedback({
          type: 'error',
          text: result.error ?? 'İşlem gerçekleştirilemedi.',
        });
        return;
      }

      if (result.needsEmailConfirmation) {
        setAuthFeedback({
          type: 'info',
          text: 'Kayıt başarılı! Lütfen e-posta adresinize gönderilen doğrulama bağlantısını onayladıktan sonra giriş yapın.',
        });
        return;
      }

      if (result.user) {
        autoCheckedUsersRef.current.add(result.user.id);
        await handleAuthenticatedUser(result.user);
        setPassword('');
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    if (authBusy) return;
    setAuthBusy(true);
    setAuthFeedback(null);
    try {
      const res = await resetPassword(email);
      if (!res.ok) {
        setAuthFeedback({
          type: 'error',
          text: res.error ?? 'Şifre sıfırlama bağlantısı gönderilemedi.',
        });
      } else {
        setAuthFeedback({
          type: 'info',
          text: 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.',
        });
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (authBusy) return;
    setAuthBusy(true);
    setAuthFeedback(null);
    try {
      const result = await signInWithGoogle();
      if (!result.ok) {
        setAuthFeedback({
          type: 'error',
          text: result.error ?? 'Google ile giriş yapılamadı.',
        });
        return;
      }
      if (result.user) {
        autoCheckedUsersRef.current.add(result.user.id);
        await handleAuthenticatedUser(result.user);
      } else {
        setAuthFeedback({
          type: 'info',
          text: 'Google giriş sayfasına yönlendiriliyorsunuz...',
        });
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setSignOutConfirmVisible(false);
    await signOut();
    clearUserLocalDataOnSignOut();
    autoCheckedUsersRef.current.clear();
    setSessionUser(null);
    setAuthFeedback({
      type: 'info',
      text: 'Çıkış yapıldı ve yerel kullanıcı verileri temizlendi.',
    });
  };

  const handleToggleNotifications = async (nextVal: boolean) => {
    setPrefFeedback(null);
    if (nextVal) {
      if (Platform.OS === 'web') {
        updateSettings({ notificationsEnabled: true });
        setPrefFeedback('Tarayıcıda uygulama içi uyarı bannerları etkindir.');
        return;
      }
      const granted = await requestNotificationPermission();
      if (!granted) {
        updateSettings({ notificationsEnabled: false });
        setPrefFeedback(
          'Bildirim izni verilmedi. Cihaz ayarlarından bildirim iznini etkinleştirebilirsiniz.',
        );
        return;
      }
    }
    updateSettings({ notificationsEnabled: nextVal });
  };

  const openPinModal = (enableLock: boolean) => {
    setEnableLockAfterPin(enableLock);
    setPinInput('');
    setPinConfirm('');
    setPinError(null);
    setPinModalVisible(true);
  };

  const handleSavePin = async () => {
    if (!/^\d{4,6}$/.test(pinInput)) {
      setPinError('PIN kodu 4 ile 6 rakam arasında olmalıdır.');
      return;
    }
    if (pinInput !== pinConfirm) {
      setPinError('PIN kodları birbiriyle eşleşmiyor.');
      return;
    }
    await savePin(pinInput);
    setPinConfigured(true);
    if (enableLockAfterPin) {
      updateSettings({ appLockEnabled: true });
    }
    setPinModalVisible(false);
  };

  const handleToggleAppLock = (nextVal: boolean) => {
    if (nextVal && !pinConfigured) {
      openPinModal(true);
      return;
    }
    updateSettings({ appLockEnabled: nextVal });
  };

  const handleRemovePin = async () => {
    setRemovePinConfirmVisible(false);
    await clearPin();
    setPinConfigured(false);
    updateSettings({ appLockEnabled: false });
  };

  const visibleCategories = useMemo(
    () =>
      categories
        .filter((c) => c.deletedAt === null && c.type === catTab)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [categories, catTab],
  );

  const handleAddCategory = () => {
    const trimmed = newCatName.trim();
    if (!trimmed) {
      setCatError('Lütfen bir kategori adı girin.');
      return;
    }
    const duplicate = visibleCategories.some(
      (c) => c.name.toLocaleLowerCase('tr-TR') === trimmed.toLocaleLowerCase('tr-TR'),
    );
    if (duplicate) {
      setCatError('Bu isimde bir kategori zaten mevcut.');
      return;
    }
    addCategory({
      name: trimmed,
      type: catTab,
      icon: 'tag',
      color: newCatColor,
    });
    setNewCatName('');
    setCatError(null);
    setCatModalVisible(false);
  };

  const handleExportBackup = async () => {
    setBackupFeedback(null);
    try {
      const json = exportBackupJson(getDataSnapshot());
      await shareJsonBackup(json, `butce-pro-yedek-${todayIso}.json`);
      setBackupFeedback({
        type: 'info',
        text: 'JSON yedeği başarıyla hazırlandı.',
      });
    } catch (err) {
      setBackupFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Yedek dışa aktarılamadı.',
      });
    }
  };

  const handlePickWebJsonFile = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setRestoreJson(reader.result);
          setRestoreError(null);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const executeRestore = () => {
    try {
      const parsed = parseBackupJson(restoreJson);
      restoreFromBackup(parsed, restoreMode);
      setRestoreReplaceConfirmVisible(false);
      setRestoreModalVisible(false);
      setRestoreJson('');
      setRestoreError(null);
      setBackupFeedback({
        type: 'info',
        text:
          restoreMode === 'merge'
            ? 'Yedek verileri mevcut kayıtlarla birleştirildi.'
            : 'Mevcut veriler yedekten geri yüklendi.',
      });
    } catch (err) {
      setRestoreReplaceConfirmVisible(false);
      setRestoreError(err instanceof Error ? err.message : 'Yedek geri yüklenemedi.');
    }
  };

  const handleRequestRestore = () => {
    if (!restoreJson.trim()) {
      setRestoreError('Lütfen JSON yedek içeriğini yapıştırın veya dosya seçin.');
      return;
    }
    try {
      parseBackupJson(restoreJson);
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Geçersiz JSON yedeği.');
      return;
    }

    if (restoreMode === 'replace') {
      setRestoreReplaceConfirmVisible(true);
      return;
    }
    executeRestore();
  };

  const syncBadgeLabel =
    syncStatus === 'synced'
      ? 'Eşitlendi'
      : syncStatus === 'syncing'
        ? 'Eşitleniyor'
        : syncStatus === 'error'
          ? 'Hata'
          : syncStatus === 'offline'
            ? 'Çevrimdışı'
            : 'Yerel';

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isWide && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Bulut Hesabı & Senkronizasyon */}
        <Card padding={16} style={styles.sectionCard}>
          <View style={styles.cardTitleRow}>
            {supabaseReady ? (
              <Cloud size={18} color={theme.colors.accent} />
            ) : (
              <CloudOff size={18} color={theme.colors.muted} />
            )}
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              Bulut Hesabı & Senkronizasyon
            </Text>
          </View>

          {!supabaseReady ? (
            <View
              style={[
                styles.infoBox,
                { backgroundColor: theme.colors.elevated, borderColor: theme.colors.border },
              ]}
            >
              <Text style={[styles.infoTitle, { color: theme.colors.text }]}>
                Yerel / Demo Modu Aktif
              </Text>
              <Text style={[styles.infoBody, { color: theme.colors.muted }]}>
                Uygulama şu anda cihazınızda yerel olarak çalışıyor. Bulut senkronizasyonu ve
                paylaşılan canlı raporlar için `.env` dosyanıza `EXPO_PUBLIC_SUPABASE_URL` ve
                `EXPO_PUBLIC_SUPABASE_ANON_KEY` değerlerini ekleyin (bkz. `SUPABASE_SETUP.md`).
              </Text>
            </View>
          ) : sessionUser ? (
            <View style={styles.authSignedInBox}>
              <View
                style={[
                  styles.sessionCard,
                  { backgroundColor: theme.colors.elevated, borderColor: theme.colors.border },
                ]}
              >
                <View style={styles.sessionTopRow}>
                  <Text style={[styles.sessionEmail, { color: theme.colors.text }]}>
                    {sessionUser.email || 'Oturum Açık'}
                  </Text>
                  <View
                    style={[
                      styles.syncPill,
                      {
                        backgroundColor:
                          syncStatus === 'error'
                            ? theme.colors.expenseSoft
                            : theme.colors.incomeSoft,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.syncPillText,
                        {
                          color:
                            syncStatus === 'error'
                              ? theme.colors.expense
                              : theme.colors.income,
                        },
                      ]}
                    >
                      {syncBadgeLabel}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.sessionMeta, { color: theme.colors.muted }]}>
                  Son Eşitleme: {formatDateTimeTr(lastSyncedAt)}
                </Text>
              </View>

              <View style={styles.twoBtnRow}>
                <Pressable
                  accessibilityRole="button"
                  disabled={syncBusy}
                  onPress={() => void performCloudSync(sessionUser, 'merge')}
                  style={({ pressed }) => [
                    styles.primaryFlexBtn,
                    {
                      backgroundColor: theme.colors.accent,
                      opacity: syncBusy ? 0.65 : pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <RefreshCw size={15} color="#FFFFFF" />
                  <Text style={styles.primaryFlexBtnText}>
                    {syncBusy ? 'Eşitleniyor...' : 'Şimdi Eşitle'}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSignOutConfirmVisible(true)}
                  style={({ pressed }) => [
                    styles.secondaryFlexBtn,
                    {
                      backgroundColor: theme.colors.expenseSoft,
                      borderColor: theme.colors.expense,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <LogOut size={15} color={theme.colors.expense} />
                  <Text style={[styles.secondaryFlexBtnText, { color: theme.colors.expense }]}>
                    Çıkış Yap
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.authForm}>
              <SegmentedControl
                options={[
                  { value: 'signin', label: 'Giriş Yap' },
                  { value: 'signup', label: 'Kayıt Ol' },
                ]}
                value={authMode}
                onChange={(v) => {
                  setAuthMode(v);
                  setAuthFeedback(null);
                }}
              />

              <TextInput
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="E-posta adresiniz"
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

              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Şifre"
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

              <Pressable
                accessibilityRole="button"
                disabled={authBusy}
                onPress={() => void handleEmailAuth()}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor: theme.colors.accent,
                    opacity: authBusy ? 0.65 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={styles.primaryBtnText}>
                  {authBusy
                    ? 'İşleniyor...'
                    : authMode === 'signin'
                      ? 'E-posta ile Giriş Yap'
                      : 'Kayıt Ol'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={authBusy}
                onPress={() => void handleGoogleSignIn()}
                style={({ pressed }) => [
                  styles.googleBtn,
                  {
                    backgroundColor: theme.colors.elevated,
                    borderColor: theme.colors.border,
                    opacity: authBusy ? 0.65 : pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Text style={[styles.googleBtnText, { color: theme.colors.text }]}>
                  Google ile Giriş Yap
                </Text>
              </Pressable>

              {authMode === 'signin' ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={authBusy}
                  onPress={() => void handleForgotPassword()}
                  style={styles.forgotLink}
                >
                  <Text style={[styles.forgotLinkText, { color: theme.colors.accent }]}>
                    Şifremi Unuttum
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}

          {authFeedback ? (
            <View
              style={[
                styles.feedbackBanner,
                {
                  backgroundColor:
                    authFeedback.type === 'error'
                      ? theme.colors.expenseSoft
                      : theme.colors.accentSoft,
                  borderColor:
                    authFeedback.type === 'error' ? theme.colors.expense : theme.colors.accent,
                },
              ]}
            >
              <Text style={[styles.feedbackText, { color: theme.colors.text }]}>
                {authFeedback.text}
              </Text>
            </View>
          ) : null}
        </Card>

        {/* 2. Görünüm & Tercihler */}
        <Card padding={16} style={styles.sectionCard}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
            Görünüm & Tercihler
          </Text>

          <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>Tema</Text>
          <SegmentedControl
            options={THEME_OPTIONS}
            value={settings.theme}
            onChange={(val) => updateSettings({ theme: val })}
          />

          <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
            Ana Para Birimi
          </Text>
          <View style={styles.chipRow}>
            {CURRENCIES.map((code) => (
              <Chip
                key={code}
                label={code}
                selected={settings.baseCurrency === code}
                onPress={() => updateSettings({ baseCurrency: code })}
              />
            ))}
          </View>
          <Text style={[styles.helperText, { color: theme.colors.muted }]}>
            Ana para birimi değiştirildiğinde aktif bütçe limitleri güncel kurlarla otomatik
            olarak yeniden değerlenir.
          </Text>

          <View style={[styles.settingRow, { borderTopColor: theme.colors.border }]}>
            <View style={styles.settingTextWrap}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                Ay Başlangıç Günü
              </Text>
              <Text style={[styles.settingSub, { color: theme.colors.muted }]}>
                Aylık rapor ve bütçe dönemleri bu günde başlar (1–28).
              </Text>
            </View>
            <View style={styles.stepper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ay başlangıç gününü azalt"
                onPress={() =>
                  updateSettings({ monthStartDay: Math.max(1, settings.monthStartDay - 1) })
                }
                style={[styles.stepBtn, { backgroundColor: theme.colors.elevated }]}
              >
                <Minus size={15} color={theme.colors.text} />
              </Pressable>
              <Text style={[styles.stepValue, TABULAR_NUMS_STYLE, { color: theme.colors.text }]}>
                {settings.monthStartDay}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ay başlangıç gününü artır"
                onPress={() =>
                  updateSettings({ monthStartDay: Math.min(28, settings.monthStartDay + 1) })
                }
                style={[styles.stepBtn, { backgroundColor: theme.colors.elevated }]}
              >
                <Plus size={15} color={theme.colors.text} />
              </Pressable>
            </View>
          </View>

          <View style={[styles.settingRow, { borderTopColor: theme.colors.border }]}>
            <View style={styles.settingTextWrap}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                Varsayılan Gizlilik Modu
              </Text>
              <Text style={[styles.settingSub, { color: theme.colors.muted }]}>
                Tutarsal değerleri ekranlarda gizli (••••) gösterir.
              </Text>
            </View>
            <Switch
              value={settings.privacyMode}
              onValueChange={(val) => updateSettings({ privacyMode: val })}
              trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
            />
          </View>

          <View style={[styles.settingRow, { borderTopColor: theme.colors.border }]}>
            <View style={styles.settingTextWrap}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                Bildirimler & Hatırlatmalar
              </Text>
              <Text style={[styles.settingSub, { color: theme.colors.muted }]}>
                Bütçe eşikleri, yaklaşan ödemeler ve kart son ödeme tarihleri.
              </Text>
            </View>
            <Switch
              value={settings.notificationsEnabled}
              onValueChange={(val) => void handleToggleNotifications(val)}
              trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
            />
          </View>

          {prefFeedback ? (
            <View
              style={[
                styles.feedbackBanner,
                { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accent },
              ]}
            >
              <Text style={[styles.feedbackText, { color: theme.colors.text }]}>
                {prefFeedback}
              </Text>
            </View>
          ) : null}
        </Card>

        {/* 3. Uygulama Kilidi & Güvenlik */}
        <Card padding={16} style={styles.sectionCard}>
          <View style={styles.cardTitleRow}>
            <ShieldCheck size={18} color={theme.colors.accent} />
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              Uygulama Kilidi & Güvenlik
            </Text>
          </View>

          <View style={styles.settingRowNoBorder}>
            <View style={styles.settingTextWrap}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                Uygulama Kilidi
              </Text>
              <Text style={[styles.settingSub, { color: theme.colors.muted }]}>
                {pinConfigured
                  ? 'Açılışta ve arka plandan dönüşte PIN istenir.'
                  : 'Etkinleştirmek için önce 4–6 haneli bir PIN oluşturun.'}
              </Text>
            </View>
            <Switch
              value={settings.appLockEnabled}
              onValueChange={handleToggleAppLock}
              trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
            />
          </View>

          {bioAvailable ? (
            <View style={[styles.bioBanner, { backgroundColor: theme.colors.incomeSoft }]}>
              <Fingerprint size={16} color={theme.colors.income} />
              <Text style={[styles.bioText, { color: theme.colors.income }]}>
                Biyometrik kilit açma (Face ID / Parmak İzi) cihazınızda kullanılabilir.
              </Text>
            </View>
          ) : null}

          <View style={styles.twoBtnRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => openPinModal(!pinConfigured)}
              style={({ pressed }) => [
                styles.secondaryFlexBtn,
                {
                  backgroundColor: theme.colors.elevated,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Lock size={15} color={theme.colors.text} />
              <Text style={[styles.secondaryFlexBtnText, { color: theme.colors.text }]}>
                {pinConfigured ? 'PIN Değiştir' : 'PIN Oluştur'}
              </Text>
            </Pressable>

            {pinConfigured ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setRemovePinConfirmVisible(true)}
                style={({ pressed }) => [
                  styles.secondaryFlexBtn,
                  {
                    backgroundColor: theme.colors.expenseSoft,
                    borderColor: theme.colors.expense,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Trash2 size={15} color={theme.colors.expense} />
                <Text style={[styles.secondaryFlexBtnText, { color: theme.colors.expense }]}>
                  PIN Kaldır
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Card>

        {/* 4. Özel Kategoriler */}
        <Card padding={16} style={styles.sectionCard}>
          <View style={styles.catHeader}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              Özel Kategoriler
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setNewCatName('');
                setCatError(null);
                setCatModalVisible(true);
              }}
              style={({ pressed }) => [
                styles.smallAddBtn,
                { backgroundColor: theme.colors.accent, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Plus size={14} color="#FFFFFF" />
              <Text style={styles.smallAddBtnText}>Yeni Kategori</Text>
            </Pressable>
          </View>

          <SegmentedControl
            options={CATEGORY_TYPE_OPTIONS}
            value={catTab}
            onChange={setCatTab}
          />

          <View style={styles.catList}>
            {visibleCategories.map((cat) => (
              <View
                key={cat.id}
                style={[styles.catRow, { borderBottomColor: theme.colors.border }]}
              >
                <View style={styles.catLeft}>
                  <View style={[styles.catDot, { backgroundColor: cat.color }]} />
                  <Text style={[styles.catName, { color: theme.colors.text }]}>{cat.name}</Text>
                </View>

                {cat.isDefault ? (
                  <View style={[styles.defaultPill, { backgroundColor: theme.colors.elevated }]}>
                    <Text style={[styles.defaultPillText, { color: theme.colors.muted }]}>
                      Varsayılan
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${cat.name} kategorisini sil`}
                    onPress={() => setDeleteCatTarget({ id: cat.id, name: cat.name })}
                    style={[styles.catDeleteBtn, { backgroundColor: theme.colors.expenseSoft }]}
                  >
                    <Trash2 size={14} color={theme.colors.expense} />
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        </Card>

        {/* 5. Veri & Yedekleme */}
        <Card padding={16} style={styles.sectionCard}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
            Veri & Yedekleme
          </Text>

          <View style={styles.backupBtnCol}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void handleExportBackup()}
              style={({ pressed }) => [
                styles.actionTile,
                {
                  backgroundColor: theme.colors.elevated,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Download size={16} color={theme.colors.accent} />
              <Text style={[styles.actionTileText, { color: theme.colors.text }]}>
                JSON Yedek İndir / Paylaş
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setRestoreError(null);
                setRestoreModalVisible(true);
              }}
              style={({ pressed }) => [
                styles.actionTile,
                {
                  backgroundColor: theme.colors.elevated,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Upload size={16} color={theme.colors.accent} />
              <Text style={[styles.actionTileText, { color: theme.colors.text }]}>
                JSON Yedekten Geri Yükle
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => setDemoConfirmVisible(true)}
              style={({ pressed }) => [
                styles.actionTile,
                {
                  backgroundColor: theme.colors.elevated,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Sparkles size={16} color={theme.colors.warning} />
              <Text style={[styles.actionTileText, { color: theme.colors.text }]}>
                Örnek Demo Verisi Yükle
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => setResetConfirmVisible(true)}
              style={({ pressed }) => [
                styles.actionTile,
                {
                  backgroundColor: theme.colors.expenseSoft,
                  borderColor: theme.colors.expense,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Trash2 size={16} color={theme.colors.expense} />
              <Text style={[styles.actionTileText, { color: theme.colors.expense }]}>
                Tüm Verileri Sıfırla
              </Text>
            </Pressable>
          </View>

          {backupFeedback ? (
            <View
              style={[
                styles.feedbackBanner,
                {
                  backgroundColor:
                    backupFeedback.type === 'error'
                      ? theme.colors.expenseSoft
                      : theme.colors.accentSoft,
                  borderColor:
                    backupFeedback.type === 'error' ? theme.colors.expense : theme.colors.accent,
                },
              ]}
            >
              <Text style={[styles.feedbackText, { color: theme.colors.text }]}>
                {backupFeedback.text}
              </Text>
            </View>
          ) : null}
        </Card>
      </ScrollView>

      {/* Merge vs Cloud-only Prompt Modal */}
      <Modal
        visible={mergePromptUser !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMergePromptUser(null)}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: theme.colors.overlay }]}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
              Yerel Veriler Bulundu
            </Text>
            <Text style={[styles.modalBodyText, { color: theme.colors.muted }]}>
              Cihazınızda henüz bulutla eşitlenmemiş kayıtlar var. Hesabınızla nasıl devam etmek
              istersiniz?
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const target = mergePromptUser;
                setMergePromptUser(null);
                if (target) {
                  void performCloudSync(target, 'merge');
                }
              }}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: theme.colors.accent, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={styles.primaryBtnText}>Yerel verileri buluta ekle (Birleştir)</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const target = mergePromptUser;
                setMergePromptUser(null);
                if (target) {
                  void performCloudSync(target, 'cloud_only');
                }
              }}
              style={({ pressed }) => [
                styles.googleBtn,
                {
                  backgroundColor: theme.colors.elevated,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text style={[styles.googleBtnText, { color: theme.colors.text }]}>
                Sadece bulut verilerini kullan
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* PIN Create / Change Modal */}
      <Modal
        visible={pinModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPinModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.modalBackdrop, { backgroundColor: theme.colors.overlay }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPinModalVisible(false)} />
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                {pinConfigured ? 'PIN Kodunu Değiştir' : 'PIN Oluştur'}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setPinModalVisible(false)}
                style={[styles.closeBtn, { backgroundColor: theme.colors.elevated }]}
              >
                <X size={18} color={theme.colors.text} />
              </Pressable>
            </View>

            <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
              Yeni PIN (4–6 rakam)
            </Text>
            <TextInput
              value={pinInput}
              onChangeText={setPinInput}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              placeholder="••••"
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

            <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>PIN Tekrar</Text>
            <TextInput
              value={pinConfirm}
              onChangeText={setPinConfirm}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              placeholder="••••"
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

            {pinError ? (
              <Text style={[styles.errorText, { color: theme.colors.expense }]}>{pinError}</Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={() => void handleSavePin()}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: theme.colors.accent, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={styles.primaryBtnText}>PIN’i Kaydet</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Category Modal */}
      <Modal
        visible={catModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCatModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.modalBackdrop, { backgroundColor: theme.colors.overlay }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCatModalVisible(false)} />
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                Yeni {catTab === 'expense' ? 'Gider' : 'Gelir'} Kategorisi
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setCatModalVisible(false)}
                style={[styles.closeBtn, { backgroundColor: theme.colors.elevated }]}
              >
                <X size={18} color={theme.colors.text} />
              </Pressable>
            </View>

            <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>Kategori Adı</Text>
            <TextInput
              value={newCatName}
              onChangeText={setNewCatName}
              placeholder="Örn. Evcil Hayvan, Spor"
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

            <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>Renk</Text>
            <View style={styles.swatchRow}>
              {COLOR_SWATCHES.map((hex) => {
                const selected = newCatColor === hex;
                return (
                  <Pressable
                    key={hex}
                    accessibilityRole="button"
                    onPress={() => setNewCatColor(hex)}
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

            {catError ? (
              <Text style={[styles.errorText, { color: theme.colors.expense }]}>{catError}</Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={handleAddCategory}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: theme.colors.accent, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={styles.primaryBtnText}>Kategori Ekle</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* JSON Restore Modal */}
      <Modal
        visible={restoreModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRestoreModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.modalBackdrop, { backgroundColor: theme.colors.overlay }]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setRestoreModalVisible(false)}
          />
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                JSON Yedekten Geri Yükle
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setRestoreModalVisible(false)}
                style={[styles.closeBtn, { backgroundColor: theme.colors.elevated }]}
              >
                <X size={18} color={theme.colors.text} />
              </Pressable>
            </View>

            <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>Yükleme Modu</Text>
            <SegmentedControl
              options={RESTORE_MODE_OPTIONS}
              value={restoreMode}
              onChange={setRestoreMode}
            />

            {Platform.OS === 'web' ? (
              <Pressable
                accessibilityRole="button"
                onPress={handlePickWebJsonFile}
                style={({ pressed }) => [
                  styles.googleBtn,
                  {
                    backgroundColor: theme.colors.elevated,
                    borderColor: theme.colors.border,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Text style={[styles.googleBtnText, { color: theme.colors.accent }]}>
                  Bilgisayardan .json Dosyası Seç
                </Text>
              </Pressable>
            ) : null}

            <Text style={[styles.fieldLabel, { color: theme.colors.muted }]}>
              JSON İçeriği
            </Text>
            <TextInput
              value={restoreJson}
              onChangeText={setRestoreJson}
              multiline
              numberOfLines={6}
              placeholder='{"schemaVersion": 1, ...}'
              placeholderTextColor={theme.colors.muted}
              style={[
                styles.jsonInput,
                {
                  backgroundColor: theme.colors.elevated,
                  borderColor: theme.colors.border,
                  color: theme.colors.text,
                },
              ]}
            />

            {restoreError ? (
              <Text style={[styles.errorText, { color: theme.colors.expense }]}>
                {restoreError}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={handleRequestRestore}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: theme.colors.accent, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={styles.primaryBtnText}>Yedeği Geri Yükle</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmModal
        visible={signOutConfirmVisible}
        title="Çıkış Yap"
        message="Oturumu kapatmak istediğinize emin misiniz? Bulutta eşitlenmiş yerel veriler cihazdan temizlenir."
        confirmLabel="Çıkış Yap"
        destructive
        onCancel={() => setSignOutConfirmVisible(false)}
        onConfirm={() => void handleSignOut()}
      />

      <ConfirmModal
        visible={removePinConfirmVisible}
        title="PIN Kodunu Kaldır"
        message="PIN kodunu kaldırdığınızda uygulama kilidi devre dışı bırakılır. Devam etmek istiyor musunuz?"
        confirmLabel="Kaldır"
        destructive
        onCancel={() => setRemovePinConfirmVisible(false)}
        onConfirm={() => void handleRemovePin()}
      />

      <ConfirmModal
        visible={deleteCatTarget !== null}
        title="Kategoriyi Sil"
        message={
          deleteCatTarget
            ? `"${deleteCatTarget.name}" özel kategorisini silmek istediğinize emin misiniz?`
            : ''
        }
        confirmLabel="Sil"
        destructive
        onCancel={() => setDeleteCatTarget(null)}
        onConfirm={() => {
          if (deleteCatTarget) {
            deleteCategory(deleteCatTarget.id);
          }
          setDeleteCatTarget(null);
        }}
      />

      <ConfirmModal
        visible={restoreReplaceConfirmVisible}
        title="Mevcut Veriyi Sıfırla ve Yükle"
        message="Bu işlem mevcut yerel kayıtlarınızın üzerine yedek dosyasını yazacaktır. Devam etmek istiyor musunuz?"
        confirmLabel="Üzerine Yaz"
        destructive
        onCancel={() => setRestoreReplaceConfirmVisible(false)}
        onConfirm={executeRestore}
      />

      <ConfirmModal
        visible={demoConfirmVisible}
        title="Örnek Demo Verisi Yükle"
        message="Mevcut yerel görünüm örnek Türkçe demo verileriyle doldurulacaktır. Devam etmek istiyor musunuz?"
        confirmLabel="Demo Yükle"
        onCancel={() => setDemoConfirmVisible(false)}
        onConfirm={() => {
          loadDemoData(todayIso);
          setDemoConfirmVisible(false);
          setBackupFeedback({
            type: 'info',
            text: 'Örnek demo verileri yüklendi.',
          });
        }}
      />

      <ConfirmModal
        visible={resetConfirmVisible}
        title="Tüm Verileri Sıfırla"
        message="Cihazdaki tüm hesaplar, işlemler, bütçeler, hedefler ve borç kayıtları silinecektir. Bu işlem geri alınamaz."
        confirmLabel="Sıfırla"
        destructive
        onCancel={() => setResetConfirmVisible(false)}
        onConfirm={() => {
          clearAllData();
          setResetConfirmVisible(false);
          setBackupFeedback({
            type: 'info',
            text: 'Tüm yerel veriler sıfırlandı.',
          });
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
    paddingBottom: 40,
    gap: 14,
  },
  sectionCard: {
    gap: 12,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  infoBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  infoBody: {
    fontSize: 12,
    lineHeight: 18,
  },
  authSignedInBox: {
    gap: 10,
  },
  sessionCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  sessionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sessionEmail: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  syncPill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  syncPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sessionMeta: {
    fontSize: 12,
  },
  authForm: {
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  jsonInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  googleBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  googleBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  forgotLink: {
    alignSelf: 'center',
    paddingVertical: 4,
  },
  forgotLinkText: {
    fontSize: 12,
    fontWeight: '700',
  },
  twoBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryFlexBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 11,
  },
  primaryFlexBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryFlexBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
  },
  secondaryFlexBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  feedbackBanner: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  feedbackText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  helperText: {
    fontSize: 11,
    lineHeight: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  settingRowNoBorder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  settingTextWrap: {
    flex: 1,
    gap: 2,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  settingSub: {
    fontSize: 12,
    lineHeight: 17,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    minWidth: 24,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '800',
  },
  bioBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  bioText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  smallAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  smallAddBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  catList: {
    gap: 2,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  catLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  catDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  catName: {
    fontSize: 13,
    fontWeight: '600',
  },
  defaultPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  defaultPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  catDeleteBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backupBtnCol: {
    gap: 8,
  },
  actionTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  actionTileText: {
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
    maxWidth: 460,
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
  modalBodyText: {
    fontSize: 13,
    lineHeight: 19,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
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
  errorText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
