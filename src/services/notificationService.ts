import { addDays, daysInMonth, parseIsoDate, toIsoDate } from '@/domain/periods';
import type { Account, RecurringRule } from '@/domain/types';

function isReactNativeRuntime(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    (navigator as { product?: string }).product === 'ReactNative'
  );
}

function buildMorningReminderDate(isoDate: string): Date {
  const { year, month, day } = parseIsoDate(isoDate);
  return new Date(year, month - 1, day, 9, 0, 0, 0);
}

function computeNextDueDate(dueDay: number, now: Date): string {
  const clampedDay = Math.max(1, Math.min(28, Math.trunc(dueDay)));
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const currentMonthDate = toIsoDate(year, month, Math.min(clampedDay, daysInMonth(year, month)));
  const candidate = buildMorningReminderDate(currentMonthDate);

  if (candidate.getTime() > now.getTime()) {
    return currentMonthDate;
  }

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return toIsoDate(nextYear, nextMonth, Math.min(clampedDay, daysInMonth(nextYear, nextMonth)));
}

/**
 * Requests local notification permissions on Native (iOS/Android).
 * Safely returns `false` on Web and Node without throwing.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isReactNativeRuntime()) {
    return false;
  }

  try {
    const Notifications = await import('expo-notifications');
    const existing = await Notifications.getPermissionsAsync();
    if (existing.status === 'granted') {
      return true;
    }
    const requested = await Notifications.requestPermissionsAsync();
    return requested.status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Fires an immediate local notification when a budget crosses the 80% warning
 * or 100% exceeded threshold on Native devices. No-op on Web/Node.
 */
export async function notifyBudgetThreshold(categoryName: string, pct: number): Promise<void> {
  if (!isReactNativeRuntime()) {
    return;
  }

  try {
    const Notifications = await import('expo-notifications');
    const perms = await Notifications.getPermissionsAsync();
    if (perms.status !== 'granted') {
      return;
    }

    const roundedPct = Math.round(pct);
    const isExceeded = roundedPct >= 100;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: isExceeded ? 'Bütçe Limiti Aşıldı' : 'Bütçe Sınırına Yaklaşıldı',
        body: isExceeded
          ? `${categoryName} bütçeniz %${roundedPct} seviyesine ulaşarak limiti aştı.`
          : `${categoryName} bütçenizin %${roundedPct} kadarı harcandı.`,
        sound: 'default',
      },
      trigger: null,
    });
  } catch {
    // Notification delivery errors should never break ledger mutations
  }
}

/**
 * Schedules local reminders on Native for active recurring rules and credit card due days.
 * Safely no-ops on Web and Node without throwing.
 */
export async function scheduleUpcomingReminders(
  rules: RecurringRule[],
  accounts: Account[],
): Promise<void> {
  if (!isReactNativeRuntime()) {
    return;
  }

  try {
    const Notifications = await import('expo-notifications');
    const perms = await Notifications.getPermissionsAsync();
    if (perms.status !== 'granted') {
      return;
    }

    await Notifications.cancelAllScheduledNotificationsAsync();

    const now = new Date();
    const nowMs = now.getTime();

    for (const rule of rules) {
      if (!rule.isActive || rule.deletedAt !== null) {
        continue;
      }
      try {
        const remindOffset = Math.max(0, Math.trunc(rule.remindDaysBefore));
        const reminderIso = addDays(rule.nextRunDate, -remindOffset);
        const triggerDate = buildMorningReminderDate(reminderIso);
        if (triggerDate.getTime() <= nowMs) {
          continue;
        }

        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Yaklaşan Düzenli İşlem',
            body: `${rule.title} (${rule.nextRunDate}) için hatırlatma.`,
            sound: 'default',
            data: { ruleId: rule.id },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: triggerDate,
          },
        });
      } catch {
        // Skip invalid rule dates without aborting remaining reminders
      }
    }

    for (const account of accounts) {
      if (
        account.type !== 'credit_card' ||
        account.isArchived ||
        account.deletedAt !== null ||
        account.dueDay == null
      ) {
        continue;
      }
      try {
        const dueDateIso = computeNextDueDate(account.dueDay, now);
        const reminderIso = addDays(dueDateIso, -2);
        const reminderDate = buildMorningReminderDate(reminderIso);
        const targetDate =
          reminderDate.getTime() > nowMs ? reminderDate : buildMorningReminderDate(dueDateIso);

        if (targetDate.getTime() <= nowMs) {
          continue;
        }

        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Kredi Kartı Son Ödeme Hatırlatması',
            body: `${account.name} kartının son ödeme tarihi (${dueDateIso}) yaklaşıyor.`,
            sound: 'default',
            data: { accountId: account.id },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: targetDate,
          },
        });
      } catch {
        // Skip invalid account dueDay without aborting remaining reminders
      }
    }
  } catch {
    // Notification scheduling errors should never break app execution
  }
}
