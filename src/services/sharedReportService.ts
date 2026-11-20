import { generateEntityId } from '@/domain/ledger';
import type { PeriodType, ReportSnapshot, SharedReport } from '@/domain/types';
import { getSupabaseClient, getWebBaseUrl } from '@/services/supabase';
import type { SnakeRow } from '@/services/syncEngine';

export interface CreateSharedReportInput {
  title: string;
  periodType: PeriodType;
  startDate: string;
  endDate: string;
  includeTransactions: boolean;
  includeNotes: boolean;
  snapshot: ReportSnapshot;
  expiresInDays: 7 | 30 | null;
  userId?: string | null;
}

export type PublicSharedReportResult =
  | { status: 'ok'; report: SharedReport }
  | { status: 'not_found' | 'expired' | 'revoked' };

const LOCAL_SHARED_REPORTS_KEY = 'butce-pro-shared-reports-v1';
const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

let memoryReports: SharedReport[] = [];

function canUseRuntimeStorage(): boolean {
  const hasWindow = typeof window !== 'undefined';
  const isReactNative =
    typeof navigator !== 'undefined' &&
    (navigator as { product?: string }).product === 'ReactNative';
  return hasWindow || isReactNative;
}

async function readLocalReports(): Promise<SharedReport[]> {
  if (!canUseRuntimeStorage()) {
    return memoryReports.map((r) => ({ ...r }));
  }
  try {
    const mod = await import('@react-native-async-storage/async-storage');
    const raw = await mod.default.getItem(LOCAL_SHARED_REPORTS_KEY);
    if (!raw) {
      return memoryReports.map((r) => ({ ...r }));
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryReports = parsed as SharedReport[];
      return memoryReports.map((r) => ({ ...r }));
    }
  } catch {
    // Fall back to memoryReports
  }
  return memoryReports.map((r) => ({ ...r }));
}

async function writeLocalReports(reports: SharedReport[]): Promise<void> {
  memoryReports = reports.map((r) => ({ ...r }));
  if (!canUseRuntimeStorage()) {
    return;
  }
  try {
    const mod = await import('@react-native-async-storage/async-storage');
    await mod.default.setItem(LOCAL_SHARED_REPORTS_KEY, JSON.stringify(memoryReports));
  } catch {
    // Already persisted in memoryReports
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;

    const triple = (b0 << 16) | (b1 << 8) | b2;
    out += BASE64URL_ALPHABET[(triple >> 18) & 0x3f];
    out += BASE64URL_ALPHABET[(triple >> 12) & 0x3f];
    if (hasB1) {
      out += BASE64URL_ALPHABET[(triple >> 6) & 0x3f];
    }
    if (hasB2) {
      out += BASE64URL_ALPHABET[triple & 0x3f];
    }
  }
  return out;
}

function isReactNativeRuntime(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    (navigator as { product?: string }).product === 'ReactNative'
  );
}

function getRandomBytes(byteLength: number): Uint8Array {
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(byteLength);
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }

  if (isReactNativeRuntime()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ExpoCrypto = require('expo-crypto') as typeof import('expo-crypto');
    if (typeof ExpoCrypto.getRandomBytes === 'function') {
      return ExpoCrypto.getRandomBytes(byteLength);
    }
  }

  throw new Error('Kriptografik rastgele sayı üreticisi (CSPRNG) kullanılamıyor.');
}

/** Generates a cryptographically random URL-safe share token (>= 32 characters). */
export function generateShareToken(): string {
  return bytesToBase64Url(getRandomBytes(32));
}

/** Builds the public share URL for a given share token. */
export function buildShareUrl(token: string): string {
  const base = getWebBaseUrl().replace(/\/+$/, '');
  return `${base}/shared/${token}`;
}

function sanitizeSnapshotForSharing(
  snapshot: ReportSnapshot,
  includeTransactions: boolean,
  includeNotes: boolean,
): ReportSnapshot {
  return {
    ...snapshot,
    includeTransactions,
    includeNotes,
    transactions: includeTransactions
      ? snapshot.transactions.map((tx) =>
          includeNotes
            ? tx
            : {
                ...tx,
                note: undefined,
              },
        )
      : [],
  };
}

function mapSnakeSharedReportRow(row: SnakeRow, fallbackToken = ''): SharedReport {
  const createdAt = typeof row.created_at === 'string' ? row.created_at : new Date().toISOString();
  return {
    id: typeof row.id === 'string' ? row.id : generateEntityId(),
    userId: typeof row.user_id === 'string' ? row.user_id : null,
    shareToken: typeof row.share_token === 'string' ? row.share_token : fallbackToken,
    title: typeof row.title === 'string' ? row.title : '',
    periodType: (typeof row.period_type === 'string' ? row.period_type : 'monthly') as PeriodType,
    startDate: typeof row.start_date === 'string' ? row.start_date : '',
    endDate: typeof row.end_date === 'string' ? row.end_date : '',
    includeTransactions: Boolean(row.include_transactions),
    includeNotes: Boolean(row.include_notes),
    snapshotJson: row.snapshot_json as ReportSnapshot,
    expiresAt: typeof row.expires_at === 'string' ? row.expires_at : null,
    isRevoked: Boolean(row.is_revoked),
    viewCount: typeof row.view_count === 'number' ? row.view_count : 0,
    createdAt,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : createdAt,
    deletedAt: typeof row.deleted_at === 'string' ? row.deleted_at : null,
  };
}

/**
 * Creates a shareable report snapshot. Persists to Supabase `shared_reports` when signed in,
 * or to local cross-platform storage in Local/Demo mode.
 */
export async function createSharedReport(
  input: CreateSharedReportInput,
  nowIso = new Date().toISOString(),
): Promise<SharedReport> {
  const id = generateEntityId();
  const shareToken = generateShareToken();
  const expiresAt =
    input.expiresInDays != null
      ? new Date(Date.parse(nowIso) + input.expiresInDays * 86_400_000).toISOString()
      : null;

  const snapshotJson = sanitizeSnapshotForSharing(
    input.snapshot,
    input.includeTransactions,
    input.includeNotes,
  );

  const client = getSupabaseClient();
  if (client && input.userId) {
    const payload = {
      id,
      user_id: input.userId,
      share_token: shareToken,
      title: input.title,
      period_type: input.periodType,
      start_date: input.startDate,
      end_date: input.endDate,
      include_transactions: input.includeTransactions,
      include_notes: input.includeNotes,
      snapshot_json: snapshotJson,
      expires_at: expiresAt,
      is_revoked: false,
      view_count: 0,
      created_at: nowIso,
      updated_at: nowIso,
      deleted_at: null,
    };

    const { data, error } = await client
      .from('shared_reports')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Paylaşım raporu oluşturulamadı: ${error.message}`);
    }

    return mapSnakeSharedReportRow(data as SnakeRow, shareToken);
  }

  const report: SharedReport = {
    id,
    userId: input.userId ?? null,
    shareToken,
    title: input.title,
    periodType: input.periodType,
    startDate: input.startDate,
    endDate: input.endDate,
    includeTransactions: input.includeTransactions,
    includeNotes: input.includeNotes,
    snapshotJson,
    expiresAt,
    isRevoked: false,
    viewCount: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
  };

  const existing = await readLocalReports();
  await writeLocalReports([report, ...existing]);
  return report;
}

/** Lists active shared reports for the current user (Supabase or local registry). */
export async function listSharedReports(userId?: string | null): Promise<SharedReport[]> {
  const client = getSupabaseClient();
  if (client && userId) {
    const { data, error } = await client
      .from('shared_reports')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Paylaşılan raporlar alınamadı: ${error.message}`);
    }

    return ((data ?? []) as SnakeRow[]).map((row) => mapSnakeSharedReportRow(row));
  }

  const local = await readLocalReports();
  return local
    .filter((r) => r.deletedAt === null && (!userId || r.userId === userId || r.userId === null))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Revokes a shared report so future public link visits return `{ status: 'revoked' }`. */
export async function revokeSharedReport(id: string, userId?: string | null): Promise<void> {
  const nowIso = new Date().toISOString();
  const client = getSupabaseClient();

  if (client && userId) {
    const { error } = await client
      .from('shared_reports')
      .update({ is_revoked: true, updated_at: nowIso })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Paylaşım iptal edilemedi: ${error.message}`);
    }
  }

  const local = await readLocalReports();
  let changed = false;
  const next = local.map((report) => {
    if (report.id === id) {
      changed = true;
      return { ...report, isRevoked: true, updatedAt: nowIso };
    }
    return report;
  });
  if (changed) {
    await writeLocalReports(next);
  }
}

async function fetchLocalPublicSharedReport(
  token: string,
  nowIso: string,
): Promise<PublicSharedReportResult> {
  const reports = await readLocalReports();
  const index = reports.findIndex((r) => r.shareToken === token && r.deletedAt === null);
  if (index < 0) {
    return { status: 'not_found' };
  }

  const target = reports[index];
  if (target.isRevoked) {
    return { status: 'revoked' };
  }

  if (target.expiresAt !== null && Date.parse(target.expiresAt) <= Date.parse(nowIso)) {
    return { status: 'expired' };
  }

  const updated: SharedReport = {
    ...target,
    viewCount: target.viewCount + 1,
    updatedAt: nowIso,
  };
  const next = [...reports];
  next[index] = updated;
  await writeLocalReports(next);

  return { status: 'ok', report: updated };
}

/**
 * Fetches a public shared report by token via the `get_shared_report` SECURITY DEFINER RPC
 * when Supabase is configured, or from the local cross-platform registry otherwise.
 */
export async function fetchPublicSharedReport(
  token: string,
  nowIso = new Date().toISOString(),
): Promise<PublicSharedReportResult> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { status: 'not_found' };
  }

  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client.rpc('get_shared_report', { p_token: trimmed });
    if (!error && data && typeof data === 'object') {
      const payload = data as { status?: string; report?: SnakeRow };
      if (payload.status === 'revoked') {
        return { status: 'revoked' };
      }
      if (payload.status === 'expired') {
        return { status: 'expired' };
      }
      if (payload.status === 'ok' && payload.report) {
        return {
          status: 'ok',
          report: mapSnakeSharedReportRow(payload.report, trimmed),
        };
      }
    }
  }

  return fetchLocalPublicSharedReport(trimmed, nowIso);
}

/** Clears local shared report storage (for unit tests). */
export async function clearLocalSharedReportsForTests(): Promise<void> {
  memoryReports = [];
  if (!canUseRuntimeStorage()) {
    return;
  }
  try {
    const mod = await import('@react-native-async-storage/async-storage');
    await mod.default.removeItem(LOCAL_SHARED_REPORTS_KEY);
  } catch {
    // Already cleared in memoryReports
  }
}
