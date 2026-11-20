import React, { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AlertTriangle, Info, X } from 'lucide-react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LockScreenOverlay } from '@/components/ui/LockScreenOverlay';
import { toIsoDate } from '@/domain/periods';
import { getCurrentSession } from '@/services/authService';
import {
  notifyBudgetThreshold,
  scheduleUpcomingReminders,
} from '@/services/notificationService';
import { hasPin } from '@/services/securityService';
import { useFinanceStore } from '@/store/useFinanceStore';
import { useResponsiveLayout, useTheme } from '@/theme/theme';

function getLocalTodayIso(): string {
  const now = new Date();
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function parseBudgetAlertInfo(
  title: string,
  message: string,
  level: 'warning' | 'danger' | 'info',
): { categoryName: string; pct: number } {
  const match = message.match(/^(.+?)\s+bütçe(?:niz|nizin)\s+%(\d+)/);
  return {
    categoryName: match ? match[1] : title,
    pct: match ? Number(match[2]) : level === 'danger' ? 100 : 80,
  };
}

function AlertBannerOverlay() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isWide, contentMaxWidth } = useResponsiveLayout();
  const pathname = usePathname();
  const alertQueue = useFinanceStore((s) => s.alertQueue);
  const dismissAlert = useFinanceStore((s) => s.dismissAlert);
  const notificationsEnabled = useFinanceStore((s) => s.settings.notificationsEnabled);
  const notifiedIdsRef = useRef<Set<string>>(new Set());

  const isSharedRoute = pathname === '/shared' || pathname.startsWith('/shared/');

  useEffect(() => {
    for (const item of alertQueue) {
      if (notifiedIdsRef.current.has(item.id)) {
        continue;
      }
      notifiedIdsRef.current.add(item.id);
      if (notificationsEnabled && (item.level === 'warning' || item.level === 'danger')) {
        const info = parseBudgetAlertInfo(item.title, item.message, item.level);
        void notifyBudgetThreshold(info.categoryName, info.pct);
      }
    }
  }, [alertQueue, notificationsEnabled]);

  if (isSharedRoute || alertQueue.length === 0) {
    return null;
  }

  const visibleAlerts = alertQueue.slice(-2);

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.bannerContainer,
        {
          top: insets.top + 8,
        },
      ]}
    >
      <View
        pointerEvents="box-none"
        style={[
          styles.bannerInner,
          isWide && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' },
        ]}
      >
        {visibleAlerts.map((alert) => {
          const accent =
            alert.level === 'danger'
              ? theme.colors.expense
              : alert.level === 'warning'
                ? theme.colors.warning
                : theme.colors.accent;
          const softBg =
            alert.level === 'danger'
              ? theme.colors.expenseSoft
              : alert.level === 'warning'
                ? theme.colors.warningSoft
                : theme.colors.accentSoft;

          return (
            <View
              key={alert.id}
              style={[
                styles.bannerCard,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: accent,
                  borderRadius: theme.radius.md,
                },
              ]}
            >
              <View style={[styles.bannerIconWrap, { backgroundColor: softBg }]}>
                {alert.level === 'info' ? (
                  <Info size={16} color={accent} />
                ) : (
                  <AlertTriangle size={16} color={accent} />
                )}
              </View>
              <View style={styles.bannerTextWrap}>
                <Text style={[styles.bannerTitle, { color: theme.colors.text }]} numberOfLines={1}>
                  {alert.title}
                </Text>
                <Text style={[styles.bannerMessage, { color: theme.colors.muted }]} numberOfLines={2}>
                  {alert.message}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Bildirimi kapat"
                onPress={() => dismissAlert(alert.id)}
                hitSlop={8}
                style={[styles.dismissBtn, { backgroundColor: theme.colors.elevated }]}
              >
                <X size={14} color={theme.colors.muted} />
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function RootShell() {
  const theme = useTheme();
  const pathname = usePathname();
  const hasHydrated = useFinanceStore((s) => s.hasHydrated);
  const appLockEnabled = useFinanceStore((s) => s.settings.appLockEnabled);
  const notificationsEnabled = useFinanceStore((s) => s.settings.notificationsEnabled);
  const recurringRules = useFinanceStore((s) => s.recurringRules);
  const accounts = useFinanceStore((s) => s.accounts);
  const runDueRecurringRules = useFinanceStore((s) => s.runDueRecurringRules);
  const refreshLiveRates = useFinanceStore((s) => s.refreshLiveRates);
  const setSyncStatus = useFinanceStore((s) => s.setSyncStatus);

  const [isLocked, setIsLocked] = useState(false);
  const startupDoneRef = useRef(false);
  const appStateRef = useRef<string>(AppState.currentState ?? 'active');

  const isSharedRoute = pathname === '/shared' || pathname.startsWith('/shared/');

  useEffect(() => {
    if (!hasHydrated || startupDoneRef.current) {
      return;
    }
    startupDoneRef.current = true;

    runDueRecurringRules(getLocalTodayIso());
    void refreshLiveRates().catch(() => {});

    void getCurrentSession()
      .then((user) => {
        if (user && useFinanceStore.getState().syncStatus === 'local') {
          setSyncStatus('synced');
        }
      })
      .catch(() => {});

    if (appLockEnabled) {
      void hasPin()
        .then((pinExists) => {
          if (pinExists) {
            setIsLocked(true);
          }
        })
        .catch(() => {});
    }
  }, [hasHydrated, appLockEnabled, runDueRecurringRules, refreshLiveRates, setSyncStatus]);

  useEffect(() => {
    if (!hasHydrated || !notificationsEnabled) {
      return;
    }
    void scheduleUpcomingReminders(recurringRules, accounts);
  }, [hasHydrated, notificationsEnabled, recurringRules, accounts]);

  useEffect(() => {
    if (!appLockEnabled) {
      setIsLocked(false);
    }
  }, [appLockEnabled]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (prevState === 'background' && nextState === 'active') {
        if (useFinanceStore.getState().settings.appLockEnabled) {
          void hasPin()
            .then((pinExists) => {
              if (pinExists) {
                setIsLocked(true);
              }
            })
            .catch(() => {});
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="plan" />
        <Stack.Screen name="shared/[token]" />
      </Stack>
      <AlertBannerOverlay />
      <LockScreenOverlay
        visible={isLocked && !isSharedRoute}
        onUnlocked={() => setIsLocked(false)}
      />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <RootShell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  bannerContainer: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 50,
  },
  bannerInner: {
    gap: 8,
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 4,
  },
  bannerIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTextWrap: {
    flex: 1,
    gap: 2,
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  bannerMessage: {
    fontSize: 12,
    lineHeight: 16,
  },
  dismissBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
