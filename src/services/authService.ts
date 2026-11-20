import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createDefaultExchangeRates, DEFAULT_SETTINGS } from '@/domain/defaults';
import type { FinanceDataSnapshot, Transaction } from '@/domain/types';
import { getSupabaseClient, getWebBaseUrl, isSupabaseConfigured } from '@/services/supabase';
import {
  fromSnakeAccountRow,
  fromSnakeBudgetRow,
  fromSnakeCategoryRow,
  fromSnakeDebtRow,
  fromSnakeExchangeRateRow,
  fromSnakeInstallmentPlanRow,
  fromSnakeRecurringRuleRow,
  fromSnakeSavingsGoalRow,
  fromSnakeTransactionRow,
  fromSnakeUserSettingsRow,
  hasNonDemoLocalData,
  mergeLocalIntoCloud,
  type SnakeRow,
  toSnakeAccountRow,
  toSnakeBudgetRow,
  toSnakeCategoryRow,
  toSnakeDebtRow,
  toSnakeExchangeRateRow,
  toSnakeInstallmentPlanRow,
  toSnakeRecurringRuleRow,
  toSnakeSavingsGoalRow,
  toSnakeTransactionRow,
  toSnakeUserSettingsRow,
} from '@/services/syncEngine';

export interface AuthUser {
  id: string;
  email: string;
  provider?: string;
}

export interface AuthResult {
  ok: boolean;
  user?: AuthUser | null;
  error?: string;
  needsEmailConfirmation?: boolean;
}

const UNCONFIGURED_ERROR =
  'Bulut senkronizasyonu yapılandırılmamış. Lütfen Supabase ortam değişkenlerini kontrol edin.';

function mapSupabaseUser(user: User | null | undefined): AuthUser | null {
  if (!user) {
    return null;
  }
  const provider =
    typeof user.app_metadata?.provider === 'string' ? user.app_metadata.provider : undefined;
  return {
    id: user.id,
    email: user.email ?? '',
    provider,
  };
}

function translateAuthError(message: string | undefined): string {
  if (!message) {
    return 'Kimlik doğrulama sırasında beklenmeyen bir hata oluştu.';
  }
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) {
    return 'E-posta veya şifre hatalı.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Lütfen önce e-posta adresinize gönderilen onay bağlantısını doğrulayın.';
  }
  if (lower.includes('user already registered')) {
    return 'Bu e-posta adresi zaten kayıtlı.';
  }
  if (lower.includes('password should be at least')) {
    return 'Şifreniz en az 6 karakter olmalıdır.';
  }
  return message;
}

async function isWebEnvironment(): Promise<boolean> {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return true;
  }
  try {
    const rn = await import('react-native');
    return rn.Platform?.OS === 'web';
  } catch {
    return false;
  }
}

function extractAuthParamsFromUrl(url: string): {
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  errorDescription: string | null;
} {
  try {
    const parsed = new URL(url);
    const queryParams = parsed.searchParams;
    const hashRaw = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
    const hashParams = new URLSearchParams(hashRaw);

    return {
      code: queryParams.get('code') ?? hashParams.get('code'),
      accessToken: hashParams.get('access_token') ?? queryParams.get('access_token'),
      refreshToken: hashParams.get('refresh_token') ?? queryParams.get('refresh_token'),
      errorDescription:
        queryParams.get('error_description') ??
        hashParams.get('error_description') ??
        queryParams.get('error') ??
        hashParams.get('error'),
    };
  } catch {
    return { code: null, accessToken: null, refreshToken: null, errorDescription: null };
  }
}

/** Signs in an existing user using email and password via Supabase Auth. */
export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, error: UNCONFIGURED_ERROR };
  }

  const trimmedEmail = email.trim();
  if (!trimmedEmail || !password) {
    return { ok: false, error: 'E-posta ve şifre alanları zorunludur.' };
  }

  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });
    if (error) {
      return { ok: false, error: translateAuthError(error.message) };
    }
    return { ok: true, user: mapSupabaseUser(data.user) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Giriş yapılırken bir hata oluştu.',
    };
  }
}

/** Registers a new user with email and password via Supabase Auth. */
export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, error: UNCONFIGURED_ERROR };
  }

  const trimmedEmail = email.trim();
  if (!trimmedEmail || !password) {
    return { ok: false, error: 'E-posta ve şifre alanları zorunludur.' };
  }

  try {
    const { data, error } = await client.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        emailRedirectTo: getWebBaseUrl(),
      },
    });
    if (error) {
      return { ok: false, error: translateAuthError(error.message) };
    }
    const needsEmailConfirmation = Boolean(data.user && !data.session);
    return {
      ok: true,
      user: mapSupabaseUser(data.user),
      needsEmailConfirmation,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Kayıt olurken bir hata oluştu.',
    };
  }
}

/** Sends a password reset email via Supabase Auth. */
export async function resetPassword(email: string): Promise<{ ok: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, error: UNCONFIGURED_ERROR };
  }

  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    return { ok: false, error: 'Lütfen e-posta adresinizi girin.' };
  }

  try {
    const { error } = await client.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: getWebBaseUrl(),
    });
    if (error) {
      return { ok: false, error: translateAuthError(error.message) };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Şifre sıfırlama bağlantısı gönderilemedi.',
    };
  }
}

/**
 * Initiates Google OAuth login via Supabase Auth on Web (browser redirect)
 * or Native (`expo-auth-session` + `expo-web-browser`).
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, error: UNCONFIGURED_ERROR };
  }

  try {
    const isWeb = await isWebEnvironment();
    if (isWeb) {
      const redirectTo = getWebBaseUrl();
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (error) {
        return { ok: false, error: translateAuthError(error.message) };
      }
      const sessionUser = await getCurrentSession();
      return { ok: true, user: sessionUser };
    }

    const AuthSession = await import('expo-auth-session');
    const WebBrowser = await import('expo-web-browser');
    WebBrowser.maybeCompleteAuthSession?.();

    const redirectTo = AuthSession.makeRedirectUri({ scheme: 'butceapp' });
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data?.url) {
      return {
        ok: false,
        error: translateAuthError(error?.message ?? 'Google giriş bağlantısı oluşturulamadı.'),
      };
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success' || !result.url) {
      return { ok: false, error: 'Google ile giriş iptal edildi.' };
    }

    const { code, accessToken, refreshToken, errorDescription } = extractAuthParamsFromUrl(
      result.url,
    );

    if (errorDescription) {
      return { ok: false, error: translateAuthError(errorDescription) };
    }

    if (code) {
      const exchange = await client.auth.exchangeCodeForSession(code);
      if (exchange.error) {
        return { ok: false, error: translateAuthError(exchange.error.message) };
      }
      return { ok: true, user: mapSupabaseUser(exchange.data.user) };
    }

    if (accessToken && refreshToken) {
      const sessionRes = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionRes.error) {
        return { ok: false, error: translateAuthError(sessionRes.error.message) };
      }
      return { ok: true, user: mapSupabaseUser(sessionRes.data.user) };
    }

    return { ok: false, error: 'Google oturum bilgisi doğrulanamadı.' };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Google ile giriş başarısız oldu.',
    };
  }
}

/** Signs out the current Supabase user session if configured. */
export async function signOut(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    return;
  }
  try {
    const { error } = await client.auth.signOut();
    if (error) {
      await client.auth.signOut({ scope: 'local' }).catch(() => {});
    }
  } catch {
    await client.auth.signOut({ scope: 'local' }).catch(() => {});
  }
}

/** Returns the currently authenticated Supabase user, or `null` when signed out / unconfigured. */
export async function getCurrentSession(): Promise<AuthUser | null> {
  const client = getSupabaseClient();
  if (!client) {
    return null;
  }
  try {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session?.user) {
      return null;
    }
    return mapSupabaseUser(data.session.user);
  } catch {
    return null;
  }
}

function requireConfiguredClient(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error(UNCONFIGURED_ERROR);
  }
  return client;
}

async function selectUserRows(
  client: SupabaseClient,
  table: string,
  userId: string,
): Promise<SnakeRow[]> {
  const { data, error } = await client.from(table).select('*').eq('user_id', userId);
  if (error) {
    throw new Error(`${table} verileri alınamadı: ${error.message}`);
  }
  return (data ?? []) as SnakeRow[];
}

async function upsertUserRows(
  client: SupabaseClient,
  table: string,
  rows: SnakeRow[],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const { error } = await client.from(table).upsert(rows, { onConflict: 'id' });
  if (error) {
    throw new Error(`${table} senkronizasyonu başarısız: ${error.message}`);
  }
}

const RECEIPTS_BUCKET = 'receipts';
const LOCAL_RECEIPT_URI_RE = /^(file:|content:|blob:|data:)/i;
const SUPABASE_RECEIPT_URL_RE =
  /\/storage\/v1\/object\/(?:sign|authenticated|public)\/receipts\/([^?#]+)/i;

function decodeBase64ToBytes(base64: string): Uint8Array {
  const cleaned = base64.replace(/\s+/g, '');
  if (typeof globalThis.atob === 'function') {
    const bin = globalThis.atob(cleaned);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
  const len = (cleaned.length * 3) / 4 - padding;
  const bytes = new Uint8Array(Math.max(0, len));
  let p = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const a = alphabet.indexOf(cleaned[i]);
    const b = alphabet.indexOf(cleaned[i + 1]);
    const c = cleaned[i + 2] === '=' ? 0 : alphabet.indexOf(cleaned[i + 2]);
    const d = cleaned[i + 3] === '=' ? 0 : alphabet.indexOf(cleaned[i + 3]);
    const triple = (a << 18) | (b << 12) | (c << 6) | d;
    if (p < len) bytes[p++] = (triple >> 16) & 0xff;
    if (p < len) bytes[p++] = (triple >> 8) & 0xff;
    if (p < len) bytes[p++] = triple & 0xff;
  }
  return bytes;
}

async function readLocalReceiptBytes(
  uri: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const trimmed = uri.trim();
  if (trimmed.startsWith('data:')) {
    const commaIdx = trimmed.indexOf(',');
    if (commaIdx < 0) {
      return null;
    }
    const meta = trimmed.slice(5, commaIdx);
    const payload = trimmed.slice(commaIdx + 1);
    const contentType = meta.split(';')[0]?.trim() || 'image/jpeg';
    if (meta.includes(';base64')) {
      const bytes = decodeBase64ToBytes(payload);
      return bytes.byteLength > 0 ? { bytes, contentType } : null;
    }
    const decoded = decodeURIComponent(payload);
    const bytes = new TextEncoder().encode(decoded);
    return bytes.byteLength > 0 ? { bytes, contentType } : null;
  }

  if (typeof fetch === 'function') {
    try {
      const response = await fetch(trimmed);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > 0) {
          const headerType = response.headers?.get('content-type')?.split(';')[0]?.trim();
          return {
            bytes: new Uint8Array(buffer),
            contentType: headerType || 'image/jpeg',
          };
        }
      }
    } catch {
      // Fall back to expo-file-system on native
    }
  }

  try {
    const fs = await import('expo-file-system');
    const file = new fs.File(trimmed);
    const bytes = await file.bytes();
    if (bytes.byteLength > 0) {
      return { bytes, contentType: 'image/jpeg' };
    }
  } catch {
    // Unreadable file or unsupported runtime
  }

  return null;
}

async function uploadReceiptForTransaction(
  client: SupabaseClient,
  userId: string,
  tx: Transaction,
): Promise<string | null> {
  const uri = tx.receiptUri?.trim();
  if (!uri) {
    return null;
  }

  const signedMatch = SUPABASE_RECEIPT_URL_RE.exec(uri);
  if (signedMatch) {
    return decodeURIComponent(signedMatch[1]);
  }

  if (!LOCAL_RECEIPT_URI_RE.test(uri)) {
    return uri;
  }

  if (!client.storage?.from) {
    return null;
  }

  try {
    const payload = await readLocalReceiptBytes(uri);
    if (!payload) {
      return null;
    }
    const storagePath = `${userId}/${tx.id}.jpg`;
    const { error } = await client.storage
      .from(RECEIPTS_BUCKET)
      .upload(storagePath, payload.bytes, {
        contentType: payload.contentType,
        upsert: true,
      });
    if (error) {
      return null;
    }
    return storagePath;
  } catch {
    return null;
  }
}

/** Resolves a stored Supabase `receipts` bucket path into a short-lived signed URL (best-effort). */
export async function resolveReceiptDisplayUrl(
  client: SupabaseClient,
  receiptUri: string | null | undefined,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!receiptUri) {
    return null;
  }
  const trimmed = receiptUri.trim();
  if (!trimmed) {
    return null;
  }
  if (/^(https?:|file:|content:|blob:|data:)/i.test(trimmed)) {
    return trimmed;
  }
  if (!client.storage?.from) {
    return trimmed;
  }
  const storagePath = trimmed.replace(/^receipts\//, '');
  try {
    const { data, error } = await client.storage
      .from(RECEIPTS_BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);
    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
  } catch {
    // Keep storage path on failure
  }
  return trimmed;
}

/** Fetches the complete cloud finance snapshot for `userId` from Supabase. */
export async function fetchRemoteFinanceData(userId: string): Promise<FinanceDataSnapshot> {
  const client = requireConfiguredClient();

  const [
    accountRows,
    categoryRows,
    transactionRows,
    planRows,
    ruleRows,
    budgetRows,
    goalRows,
    debtRows,
    rateResult,
    settingsResult,
  ] = await Promise.all([
    selectUserRows(client, 'accounts', userId),
    selectUserRows(client, 'categories', userId),
    selectUserRows(client, 'transactions', userId),
    selectUserRows(client, 'installment_plans', userId),
    selectUserRows(client, 'recurring_rules', userId),
    selectUserRows(client, 'budgets', userId),
    selectUserRows(client, 'savings_goals', userId),
    selectUserRows(client, 'debts', userId),
    client.from('exchange_rates').select('*').eq('user_id', userId).is('deleted_at', null),
    client
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle(),
  ]);

  if (rateResult.error) {
    throw new Error(`exchange_rates verileri alınamadı: ${rateResult.error.message}`);
  }
  if (settingsResult.error) {
    throw new Error(`user_settings verileri alınamadı: ${settingsResult.error.message}`);
  }

  const mappedRates = ((rateResult.data ?? []) as SnakeRow[]).map(fromSnakeExchangeRateRow);
  const mappedTransactions = await Promise.all(
    transactionRows.map(async (row) => {
      const tx = fromSnakeTransactionRow(row);
      if (!tx.receiptUri || tx.deletedAt !== null) {
        return tx;
      }
      const displayUrl = await resolveReceiptDisplayUrl(client, tx.receiptUri);
      return displayUrl === tx.receiptUri ? tx : { ...tx, receiptUri: displayUrl };
    }),
  );

  return {
    accounts: accountRows.map(fromSnakeAccountRow),
    categories: categoryRows.map(fromSnakeCategoryRow),
    transactions: mappedTransactions,
    installmentPlans: planRows.map(fromSnakeInstallmentPlanRow),
    recurringRules: ruleRows.map(fromSnakeRecurringRuleRow),
    budgets: budgetRows.map(fromSnakeBudgetRow),
    savingsGoals: goalRows.map(fromSnakeSavingsGoalRow),
    debts: debtRows.map(fromSnakeDebtRow),
    exchangeRates: mappedRates.length > 0 ? mappedRates : createDefaultExchangeRates(),
    settings: settingsResult.data
      ? fromSnakeUserSettingsRow(settingsResult.data as SnakeRow)
      : { ...DEFAULT_SETTINGS },
  };
}

/** Pushes local/merged changes to Supabase in FK-safe dependency order, excluding `isDemo` rows. */
export async function pushFinanceDataToCloud(
  userId: string,
  data: FinanceDataSnapshot,
): Promise<void> {
  const client = requireConfiguredClient();

  const nonDemo = <T extends { isDemo?: boolean }>(items: T[]): T[] =>
    items.filter((item) => item.isDemo !== true);

  await upsertUserRows(
    client,
    'accounts',
    nonDemo(data.accounts).map((a) => toSnakeAccountRow(a, userId)),
  );
  await upsertUserRows(
    client,
    'categories',
    nonDemo(data.categories).map((c) => toSnakeCategoryRow(c, userId)),
  );
  await upsertUserRows(
    client,
    'installment_plans',
    nonDemo(data.installmentPlans).map((p) => toSnakeInstallmentPlanRow(p, userId)),
  );
  await upsertUserRows(
    client,
    'recurring_rules',
    nonDemo(data.recurringRules).map((r) => toSnakeRecurringRuleRow(r, userId)),
  );
  await upsertUserRows(
    client,
    'savings_goals',
    nonDemo(data.savingsGoals).map((g) => toSnakeSavingsGoalRow(g, userId)),
  );
  await upsertUserRows(
    client,
    'debts',
    nonDemo(data.debts).map((d) => toSnakeDebtRow(d, userId)),
  );

  const preparedTransactions = await Promise.all(
    nonDemo(data.transactions).map(async (tx) => {
      if (tx.deletedAt !== null || !tx.receiptUri) {
        return tx;
      }
      const resolvedReceiptUri = await uploadReceiptForTransaction(client, userId, tx);
      return resolvedReceiptUri === tx.receiptUri
        ? tx
        : { ...tx, receiptUri: resolvedReceiptUri };
    }),
  );

  await upsertUserRows(
    client,
    'transactions',
    preparedTransactions.map((t) => toSnakeTransactionRow(t, userId)),
  );

  // Upsert budget tombstones before active rows so the partial unique index
  // (WHERE deleted_at IS NULL) does not conflict on replaced (category, month) limits.
  const nonDemoBudgets = nonDemo(data.budgets);
  const budgetTombstones = nonDemoBudgets.filter((b) => b.deletedAt !== null);
  const activeBudgets = nonDemoBudgets.filter((b) => b.deletedAt === null);
  await upsertUserRows(
    client,
    'budgets',
    budgetTombstones.map((b) => toSnakeBudgetRow(b, userId)),
  );
  await upsertUserRows(
    client,
    'budgets',
    activeBudgets.map((b) => toSnakeBudgetRow(b, userId)),
  );

  // exchange_rates & user_settings use partial unique indexes (WHERE deleted_at IS NULL),
  // so update existing active row or insert when absent.
  if (data.exchangeRates.length > 0) {
    const { data: existingRates, error: fetchRateErr } = await client
      .from('exchange_rates')
      .select('id, currency')
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (fetchRateErr) {
      throw new Error(`exchange_rates sorgulanamadı: ${fetchRateErr.message}`);
    }

    const rateIdByCurrency = new Map<string, string>();
    for (const row of (existingRates ?? []) as Array<{ id: string; currency: string }>) {
      rateIdByCurrency.set(row.currency, row.id);
    }

    for (const rate of data.exchangeRates) {
      const payload = toSnakeExchangeRateRow(rate, userId);
      const existingId = rateIdByCurrency.get(rate.currencyCode);
      if (existingId) {
        const { error } = await client.from('exchange_rates').update(payload).eq('id', existingId);
        if (error) {
          throw new Error(`exchange_rates güncellenemedi: ${error.message}`);
        }
      } else {
        const { error } = await client.from('exchange_rates').insert(payload);
        if (error) {
          throw new Error(`exchange_rates eklenemedi: ${error.message}`);
        }
      }
    }
  }

  const settingsPayload = toSnakeUserSettingsRow(data.settings, userId);
  const { data: existingSettings, error: fetchSettingsErr } = await client
    .from('user_settings')
    .select('id')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (fetchSettingsErr) {
    throw new Error(`user_settings sorgulanamadı: ${fetchSettingsErr.message}`);
  }

  if (existingSettings?.id) {
    const { error } = await client
      .from('user_settings')
      .update(settingsPayload)
      .eq('id', existingSettings.id);
    if (error) {
      throw new Error(`user_settings güncellenemedi: ${error.message}`);
    }
  } else {
    const { error } = await client.from('user_settings').insert(settingsPayload);
    if (error) {
      throw new Error(`user_settings eklenemedi: ${error.message}`);
    }
  }
}

/**
 * Performs a two-way LWW + category-deduplicated sync with Supabase and returns the
 * resolved next local state along with the sync timestamp.
 */
export async function syncWithSupabase(
  userId: string,
  localSnapshot: FinanceDataSnapshot,
  mode: 'merge' | 'cloud_only' = 'merge',
): Promise<{ nextState: FinanceDataSnapshot; syncedAt: string }> {
  const remoteSnapshot = await fetchRemoteFinanceData(userId);
  const { nextState, toUpload } = mergeLocalIntoCloud(localSnapshot, remoteSnapshot, mode, userId);

  if (mode === 'merge') {
    await pushFinanceDataToCloud(userId, toUpload);
  }

  return {
    nextState,
    syncedAt: new Date().toISOString(),
  };
}

export type AutoSyncOutcome =
  | { status: 'no_session' }
  | { status: 'local_conflict' }
  | { status: 'synced'; syncedAt: string }
  | { status: 'offline' }
  | { status: 'error'; message: string };

function isLikelyNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /network|fetch|offline|timeout|internet|connection|econn|enotfound/i.test(msg);
}

/**
 * Runs startup or foreground-resume cloud synchronization when an active Supabase
 * session exists, deferring to Settings Merge/Replace when unsynced non-demo local data exists.
 */
export async function syncSessionIfEligible(storeAccess: {
  getSnapshot: () => FinanceDataSnapshot;
  getLastSyncedAt: () => string | null;
  getSyncStatus: () => 'local' | 'syncing' | 'synced' | 'offline' | 'error';
  setSyncStatus: (status: 'local' | 'syncing' | 'synced' | 'offline' | 'error') => void;
  applyCloudState: (state: FinanceDataSnapshot) => void;
}): Promise<AutoSyncOutcome> {
  if (!isSupabaseConfigured()) {
    return { status: 'no_session' };
  }

  const user = await getCurrentSession();
  if (!user) {
    return { status: 'no_session' };
  }

  const snapshot = storeAccess.getSnapshot();
  if (storeAccess.getLastSyncedAt() === null && hasNonDemoLocalData(snapshot)) {
    if (storeAccess.getSyncStatus() !== 'local') {
      storeAccess.setSyncStatus('local');
    }
    return { status: 'local_conflict' };
  }

  storeAccess.setSyncStatus('syncing');
  try {
    const { nextState, syncedAt } = await syncWithSupabase(user.id, snapshot, 'merge');
    const activeSession = await getCurrentSession();
    if (!activeSession || activeSession.id !== user.id) {
      return { status: 'no_session' };
    }
    storeAccess.applyCloudState(nextState);
    return { status: 'synced', syncedAt };
  } catch (err) {
    if (isLikelyNetworkError(err)) {
      storeAccess.setSyncStatus('offline');
      return { status: 'offline' };
    }
    storeAccess.setSyncStatus('error');
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Senkronizasyon başarısız oldu.',
    };
  }
}
