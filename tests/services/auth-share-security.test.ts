import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultExchangeRates } from '@/domain/defaults';
import type { Account, RecurringRule, ReportSnapshot } from '@/domain/types';
import {
  getCurrentSession,
  resetPassword,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  signUpWithEmail,
} from '@/services/authService';
import {
  notifyBudgetThreshold,
  requestNotificationPermission,
  scheduleUpcomingReminders,
} from '@/services/notificationService';
import {
  authenticateWithBiometrics,
  clearPin,
  hasPin,
  hashPin,
  isBiometricAvailable,
  savePin,
  verifyPin,
} from '@/services/securityService';
import {
  buildShareUrl,
  clearLocalSharedReportsForTests,
  createSharedReport,
  fetchPublicSharedReport,
  generateShareToken,
  listSharedReports,
  revokeSharedReport,
} from '@/services/sharedReportService';
import {
  getSupabaseClient,
  getWebBaseUrl,
  isSupabaseConfigured,
  resetSupabaseClientForTests,
} from '@/services/supabase';

function makeSampleReportSnapshot(overrides: Partial<ReportSnapshot> = {}): ReportSnapshot {
  return {
    title: 'Kasım 2026 Finans Özeti',
    periodType: 'monthly',
    range: {
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    },
    baseCurrency: 'TRY',
    includeTransactions: true,
    includeNotes: true,
    kpis: {
      totalIncome: 63500,
      totalExpense: 33210,
      netCashFlow: 30290,
      savingsRate: 47.7,
      dailyAverageExpense: 1107,
      incomeDeltaPct: 15.4,
      expenseDeltaPct: 4.2,
      netDeltaPct: 28.1,
    },
    incomeExpenseSeries: [
      { key: '2026-11', label: 'Kas 2026', income: 63500, expense: 33210, net: 30290 },
    ],
    cumulativeCashFlowSeries: [{ key: '2026-11', label: 'Kas 2026', cumulativeNet: 30290 }],
    expenseBreakdown: [
      {
        categoryId: 'cat-1',
        name: 'Market',
        color: '#EF4444',
        icon: 'shopping-cart',
        amount: 4120,
        sharePct: 12.4,
        count: 3,
      },
    ],
    incomeBreakdown: [
      {
        categoryId: 'cat-2',
        name: 'Maaş',
        color: '#10B981',
        icon: 'briefcase',
        amount: 55000,
        sharePct: 86.6,
        count: 1,
      },
    ],
    budgetProgress: [],
    transactions: [
      {
        id: 'tx-1',
        date: '2026-11-05',
        type: 'expense',
        categoryName: 'Market',
        baseAmount: 1450,
        currency: 'TRY',
        note: 'Haftalık market alışverişi',
        tags: ['market'],
      },
    ],
    generatedAt: '2026-11-20T12:00:00.000Z',
    ...overrides,
  };
}

describe('supabase client & zero-config startup', () => {
  const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const originalWebBaseUrl = process.env.EXPO_PUBLIC_WEB_BASE_URL;

  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.EXPO_PUBLIC_WEB_BASE_URL;
    resetSupabaseClientForTests();
  });

  afterEach(() => {
    if (originalUrl !== undefined) {
      process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
    } else {
      delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    }
    if (originalAnonKey !== undefined) {
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
    } else {
      delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    }
    if (originalWebBaseUrl !== undefined) {
      process.env.EXPO_PUBLIC_WEB_BASE_URL = originalWebBaseUrl;
    } else {
      delete process.env.EXPO_PUBLIC_WEB_BASE_URL;
    }
    resetSupabaseClientForTests();
  });

  it('returns false and null without throwing when env vars are unset or empty', () => {
    expect(isSupabaseConfigured()).toBe(false);
    expect(getSupabaseClient()).toBeNull();

    process.env.EXPO_PUBLIC_SUPABASE_URL = '   ';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = '';
    resetSupabaseClientForTests();

    expect(isSupabaseConfigured()).toBe(false);
    expect(getSupabaseClient()).toBeNull();
  });

  it('reads EXPO_PUBLIC_WEB_BASE_URL or falls back to default URL', () => {
    expect(getWebBaseUrl()).toBe('https://butce-pro.vercel.app');

    process.env.EXPO_PUBLIC_WEB_BASE_URL = 'https://rapor.butce.pro/';
    expect(getWebBaseUrl()).toBe('https://rapor.butce.pro/');
  });

  it('returns true and initializes singleton client when env vars are provided', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'example-anon-key';
    resetSupabaseClientForTests();

    expect(isSupabaseConfigured()).toBe(true);
    const clientA = getSupabaseClient();
    const clientB = getSupabaseClient();
    expect(clientA).not.toBeNull();
    expect(clientA).toBe(clientB);

    resetSupabaseClientForTests();
    const clientC = getSupabaseClient();
    expect(clientC).not.toBeNull();
    expect(clientC).not.toBe(clientA);
  });
});

describe('authService unconfigured safe fallbacks', () => {
  const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    resetSupabaseClientForTests();
  });

  afterEach(() => {
    if (originalUrl !== undefined) {
      process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
    }
    if (originalAnonKey !== undefined) {
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
    }
    resetSupabaseClientForTests();
  });

  it('returns clean Turkish errors on signInWithEmail, signUpWithEmail, resetPassword, and signInWithGoogle when unconfigured', async () => {
    const emailRes = await signInWithEmail('kullanici@example.com', 'sifre123');
    expect(emailRes.ok).toBe(false);
    expect(emailRes.error).toBeTruthy();
    expect(emailRes.error).toMatch(/yapılandırılmamış|Supabase/i);

    const signUpRes = await signUpWithEmail('kullanici@example.com', 'sifre123');
    expect(signUpRes.ok).toBe(false);
    expect(signUpRes.error).toBeTruthy();

    const resetRes = await resetPassword('kullanici@example.com');
    expect(resetRes.ok).toBe(false);
    expect(resetRes.error).toBeTruthy();

    const googleRes = await signInWithGoogle();
    expect(googleRes.ok).toBe(false);
    expect(googleRes.error).toBeTruthy();
    expect(googleRes.error).toMatch(/yapılandırılmamış|Supabase/i);

    await expect(signOut()).resolves.toBeUndefined();
    await expect(getCurrentSession()).resolves.toBeNull();
  });
});

describe('sharedReportService', () => {
  const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    resetSupabaseClientForTests();
    await clearLocalSharedReportsForTests();
  });

  afterEach(async () => {
    await clearLocalSharedReportsForTests();
    if (originalUrl !== undefined) {
      process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
    }
    if (originalAnonKey !== undefined) {
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
    }
    resetSupabaseClientForTests();
  });

  it('generates URL-safe unique share tokens of at least 32 characters', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const token = generateShareToken();
      expect(token.length).toBeGreaterThanOrEqual(32);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      tokens.add(token);
    }
    expect(tokens.size).toBe(20);
  });

  it('throws explicitly instead of using Math.random when no CSPRNG is available', () => {
    vi.stubGlobal('crypto', {});
    try {
      expect(() => generateShareToken()).toThrow(/CSPRNG/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('builds share URLs ending with /shared/<token>', () => {
    const token = generateShareToken();
    const url = buildShareUrl(token);
    expect(url.endsWith(`/shared/${token}`)).toBe(true);
    expect(url.includes('//shared')).toBe(false);
  });

  it('creates, fetches (incrementing viewCount), lists, and revokes shared reports locally', async () => {
    const snapshot = makeSampleReportSnapshot();
    const createdAt = '2026-11-20T10:00:00.000Z';

    const created = await createSharedReport(
      {
        title: 'Kasım 2026 Özeti',
        periodType: 'monthly',
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        includeTransactions: true,
        includeNotes: true,
        snapshot,
        expiresInDays: 7,
      },
      createdAt,
    );

    expect(created.shareToken.length).toBeGreaterThanOrEqual(32);
    expect(created.viewCount).toBe(0);
    expect(created.isRevoked).toBe(false);
    expect(created.expiresAt).toBe('2026-11-27T10:00:00.000Z');

    const listed = await listSharedReports();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(created.id);

    const fetched1 = await fetchPublicSharedReport(created.shareToken, '2026-11-21T10:00:00.000Z');
    expect(fetched1.status).toBe('ok');
    if (fetched1.status === 'ok') {
      expect(fetched1.report.snapshotJson).toEqual(snapshot);
      expect(fetched1.report.viewCount).toBe(1);
    }

    const fetched2 = await fetchPublicSharedReport(created.shareToken, '2026-11-22T10:00:00.000Z');
    expect(fetched2.status).toBe('ok');
    if (fetched2.status === 'ok') {
      expect(fetched2.report.viewCount).toBe(2);
    }

    // Past expiry date -> expired
    const expiredResult = await fetchPublicSharedReport(
      created.shareToken,
      '2026-11-28T10:00:00.000Z',
    );
    expect(expiredResult).toEqual({ status: 'expired' });

    // Revoke -> revoked
    await revokeSharedReport(created.id);
    const revokedResult = await fetchPublicSharedReport(
      created.shareToken,
      '2026-11-21T10:00:00.000Z',
    );
    expect(revokedResult).toEqual({ status: 'revoked' });

    // Unknown token -> not_found
    const unknownResult = await fetchPublicSharedReport('olmayan-bir-token-1234567890');
    expect(unknownResult).toEqual({ status: 'not_found' });
  });

  it('respects privacy flags (includeTransactions, includeNotes) and supports unlimited expiry', async () => {
    const snapshot = makeSampleReportSnapshot();

    const noNotes = await createSharedReport(
      {
        title: 'Notsuz Rapor',
        periodType: 'monthly',
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        includeTransactions: true,
        includeNotes: false,
        snapshot,
        expiresInDays: null,
      },
      '2026-11-20T10:00:00.000Z',
    );
    expect(noNotes.expiresAt).toBeNull();
    expect(noNotes.snapshotJson.transactions).toHaveLength(1);
    expect(noNotes.snapshotJson.transactions[0].note).toBeUndefined();

    const fetchedFuture = await fetchPublicSharedReport(
      noNotes.shareToken,
      '2030-01-01T00:00:00.000Z',
    );
    expect(fetchedFuture.status).toBe('ok');

    const noTx = await createSharedReport(
      {
        title: 'İşlemsiz Özet',
        periodType: 'monthly',
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        includeTransactions: false,
        includeNotes: false,
        snapshot,
        expiresInDays: 30,
      },
      '2026-11-20T10:00:00.000Z',
    );
    expect(noTx.expiresAt).toBe('2026-12-20T10:00:00.000Z');
    expect(noTx.snapshotJson.transactions).toEqual([]);
  });
});

describe('securityService', () => {
  beforeEach(async () => {
    await clearPin();
  });

  afterEach(async () => {
    await clearPin();
  });

  it('hashes PIN with SHA-256 hex (64 chars) and verifies/clears PIN safely', async () => {
    const digest = await hashPin('1234');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toBe('1234');

    const sameDigest = await hashPin('1234');
    expect(sameDigest).toBe(digest);

    const otherDigest = await hashPin('0000');
    expect(otherDigest).not.toBe(digest);

    expect(await hasPin()).toBe(false);
    await savePin('1234');
    expect(await hasPin()).toBe(true);
    expect(await verifyPin('1234')).toBe(true);
    expect(await verifyPin('0000')).toBe(false);

    await clearPin();
    expect(await hasPin()).toBe(false);
    expect(await verifyPin('1234')).toBe(false);
  });

  it('safely returns false for biometric checks in Node without throwing', async () => {
    await expect(isBiometricAvailable()).resolves.toBe(false);
    await expect(authenticateWithBiometrics()).resolves.toBe(false);
  });
});

describe('notificationService', () => {
  it('safely returns false and no-ops in Node without throwing', async () => {
    await expect(requestNotificationPermission()).resolves.toBe(false);
    await expect(notifyBudgetThreshold('Market', 85)).resolves.toBeUndefined();

    const sampleAccount: Account = {
      id: 'acc-card-1',
      userId: null,
      name: 'Kredi Kartı',
      type: 'credit_card',
      currency: 'TRY',
      initialBalance: 0,
      creditLimit: 25000,
      statementDay: 15,
      dueDay: 25,
      color: '#EF4444',
      icon: 'credit-card',
      isArchived: false,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
      deletedAt: null,
    };
    const sampleRule: RecurringRule = {
      id: 'rule-1',
      userId: null,
      title: 'Kira',
      type: 'expense',
      amount: 15000,
      currency: 'TRY',
      accountId: 'acc-bank-1',
      categoryId: 'cat-1',
      frequency: 'monthly',
      nextRunDate: '2026-12-01',
      autoCreate: true,
      remindDaysBefore: 2,
      isActive: true,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
      deletedAt: null,
    };

    expect(createDefaultExchangeRates().length).toBe(5);
    await expect(scheduleUpcomingReminders([sampleRule], [sampleAccount])).resolves.toBeUndefined();
  });
});
