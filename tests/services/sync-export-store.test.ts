import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSharedReportSnapshot } from '@/domain/analytics';
import { createDefaultCategories, createDefaultExchangeRates, DEFAULT_SETTINGS } from '@/domain/defaults';
import type {
  Account,
  Budget,
  Category,
  CurrencyCode,
  ExchangeRate,
  FinanceDataSnapshot,
  InstallmentPlan,
  RecurringRule,
  Transaction,
} from '@/domain/types';
import {
  exportBackupJson,
  generateReportHtml,
  generateTransactionsCsv,
  parseBackupJson,
  sanitizeCsvCell,
  sharePdfReport,
} from '@/services/exportService';
import { fetchLiveRates } from '@/services/fxService';
import {
  deduplicateCategoriesByNameType,
  fromSnakeRow,
  mergeLocalIntoCloud,
  mergeLwwEntities,
  toSnakeRow,
} from '@/services/syncEngine';
import { useFinanceStore } from '@/store/useFinanceStore';

const NOW = '2026-11-20T12:00:00.000Z';
const EARLIER = '2026-11-19T12:00:00.000Z';
const LATER = '2026-11-21T12:00:00.000Z';

function makeSnapshot(overrides: Partial<FinanceDataSnapshot> = {}): FinanceDataSnapshot {
  return {
    accounts: [],
    categories: [],
    transactions: [],
    installmentPlans: [],
    recurringRules: [],
    budgets: [],
    savingsGoals: [],
    debts: [],
    exchangeRates: createDefaultExchangeRates(NOW),
    settings: { ...DEFAULT_SETTINGS },
    ...overrides,
  };
}

function makeAccount(overrides: Partial<Account> & Pick<Account, 'id' | 'name'>): Account {
  return {
    userId: null,
    type: 'bank',
    currency: 'TRY',
    initialBalance: 0,
    color: '#3B82F6',
    icon: 'landmark',
    isArchived: false,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function makeCategory(
  overrides: Partial<Category> & Pick<Category, 'id' | 'name' | 'type'>,
): Category {
  return {
    userId: null,
    icon: 'tag',
    color: '#EF4444',
    isDefault: false,
    sortOrder: 1,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function makeTx(
  overrides: Partial<Transaction> & Pick<Transaction, 'id' | 'type' | 'amount' | 'accountId' | 'date'>,
): Transaction {
  return {
    userId: null,
    currency: 'TRY',
    exchangeRateToBase: 1,
    baseAmount: overrides.amount,
    tags: [],
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

describe('Review Focus #4: CSV UTF-8 BOM, Turkish quoting, and formula-injection safety', () => {
  it('neutralizes leading =, +, -, @ (even after spaces/tabs) and quotes commas/quotes/newlines', () => {
    expect(sanitizeCsvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(sanitizeCsvCell('+123')).toBe("'+123");
    expect(sanitizeCsvCell('-123')).toBe("'-123");
    expect(sanitizeCsvCell('@cmd')).toBe("'@cmd");
    expect(sanitizeCsvCell('  =HYPERLINK("http://evil")')).toBe('"\'  =HYPERLINK(""http://evil"")"');
    expect(sanitizeCsvCell('\t+CMD')).toBe("'\t+CMD");
    expect(sanitizeCsvCell('Market, "özel" not\nsatır 2')).toBe(
      '"Market, ""özel"" not\nsatır 2"',
    );
  });

  it('prepends UTF-8 BOM and Turkish headers while keeping Turkish characters and safe cells', () => {
    const accounts: Account[] = [
      makeAccount({ id: 'acc-1', name: 'Vadesiz Banka' }),
      makeAccount({ id: 'acc-2', name: 'Nakit Cüzdan', type: 'cash' }),
    ];
    const categories: Category[] = [
      makeCategory({ id: 'cat-1', name: 'Market', type: 'expense' }),
    ];
    const transactions: Transaction[] = [
      makeTx({
        id: 'tx-1',
        type: 'expense',
        amount: 250.5,
        accountId: 'acc-1',
        categoryId: 'cat-1',
        date: '2026-11-20',
        note: 'Market, "özel" not\nsatır 2',
        tags: ['ığüşöç', 'market'],
      }),
      makeTx({
        id: 'tx-2',
        type: 'income',
        amount: 100,
        accountId: 'acc-1',
        date: '2026-11-19',
        note: '=SUM(A1)',
        tags: ['+123', '-123', '@cmd'],
      }),
      makeTx({
        id: 'tx-deleted',
        type: 'expense',
        amount: 999,
        accountId: 'acc-1',
        date: '2026-11-18',
        note: 'Silinmiş işlem',
        deletedAt: NOW,
      }),
    ];

    const csv = generateTransactionsCsv(transactions, accounts, categories);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    const withoutBom = csv.slice(1);
    const firstNewline = withoutBom.indexOf('\n');
    const headerLine = withoutBom.slice(0, firstNewline).replace(/\r$/, '');
    expect(headerLine).toBe(
      'Tarih,Tür,Tutar,Para Birimi,Ana Para Birimi Tutarı,Hesap,Hedef Hesap,Kategori,Not,Etiketler',
    );
    expect(csv).toContain('"Market, ""özel"" not\nsatır 2"');
    expect(csv).toContain("'=SUM(A1)");
    expect(csv).toContain("'+123; -123; @cmd");
    expect(csv).toContain('ığüşöç');
    expect(csv).not.toContain('Silinmiş işlem');
  });
});

describe('Review Focus #5: Demo isolation, category deduplication & LWW sync', () => {
  it('deduplicates categories by Turkish lowercase name + type and returns idRemap', () => {
    const local: Category[] = [
      makeCategory({ id: 'loc-market', name: '  MARKET ', type: 'expense' }),
      makeCategory({ id: 'loc-custom', name: 'Evcil Hayvan', type: 'expense' }),
    ];
    const remote: Category[] = [
      makeCategory({ id: 'rem-market', name: 'Market', type: 'expense' }),
      makeCategory({ id: 'rem-salary', name: 'Maaş', type: 'income' }),
    ];

    const { merged, idRemap } = deduplicateCategoriesByNameType(local, remote);

    expect(idRemap).toEqual({ 'loc-market': 'rem-market' });
    expect(merged.map((c) => c.id).sort()).toEqual(['loc-custom', 'rem-market', 'rem-salary'].sort());
  });

  it('drops every isDemo record from nextState and toUpload and remaps real local entities to remote categories', () => {
    const localMarket = makeCategory({
      id: 'loc-market',
      name: 'Market',
      type: 'expense',
      isDefault: true,
    });
    const demoCategory = makeCategory({
      id: 'demo-cat',
      name: 'Demo Kategori',
      type: 'expense',
      isDemo: true,
    });
    const remoteMarket = makeCategory({
      id: 'rem-market',
      userId: 'user-1',
      name: 'market',
      type: 'expense',
      isDefault: true,
    });

    const realAccount = makeAccount({ id: 'acc-real', name: 'Gerçek Banka' });
    const demoAccount = makeAccount({ id: 'acc-demo', name: 'Demo Hesap', isDemo: true });

    const realTx = makeTx({
      id: 'tx-real',
      type: 'expense',
      amount: 350,
      accountId: 'acc-real',
      categoryId: 'loc-market',
      date: '2026-11-20',
      note: 'Gerçek market harcaması',
    });
    const demoTx = makeTx({
      id: 'tx-demo',
      type: 'expense',
      amount: 999,
      accountId: 'acc-demo',
      categoryId: 'demo-cat',
      date: '2026-11-20',
      isDemo: true,
    });

    const realBudget: Budget = {
      id: 'b-real',
      userId: null,
      categoryId: 'loc-market',
      month: '2026-11',
      limitAmount: 5_000,
      currency: 'TRY',
      alert80Sent: false,
      alert100Sent: false,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    };
    const demoBudget: Budget = {
      ...realBudget,
      id: 'b-demo',
      categoryId: 'demo-cat',
      isDemo: true,
    };

    const realPlan: InstallmentPlan = {
      id: 'plan-real',
      userId: null,
      title: 'Koltuk',
      accountId: 'acc-real',
      categoryId: 'loc-market',
      totalAmount: 3_000,
      currency: 'TRY',
      installmentCount: 3,
      startDate: '2026-11-01',
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    };
    const realRule: RecurringRule = {
      id: 'rule-real',
      userId: null,
      title: 'Haftalık Pazar',
      type: 'expense',
      amount: 400,
      currency: 'TRY',
      accountId: 'acc-real',
      categoryId: 'loc-market',
      frequency: 'weekly',
      nextRunDate: '2026-11-27',
      autoCreate: true,
      remindDaysBefore: 1,
      isActive: true,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    };

    const localState = makeSnapshot({
      accounts: [realAccount, demoAccount],
      categories: [localMarket, demoCategory],
      transactions: [realTx, demoTx],
      budgets: [realBudget, demoBudget],
      installmentPlans: [realPlan],
      recurringRules: [realRule],
    });
    const remoteState = makeSnapshot({
      categories: [remoteMarket],
    });

    const { nextState, toUpload } = mergeLocalIntoCloud(localState, remoteState, 'merge');

    // No demo records anywhere
    expect(nextState.accounts.some((a) => a.isDemo)).toBe(false);
    expect(nextState.categories.some((c) => c.isDemo)).toBe(false);
    expect(nextState.transactions.some((t) => t.isDemo)).toBe(false);
    expect(nextState.budgets.some((b) => b.isDemo)).toBe(false);
    expect(toUpload.accounts.some((a) => a.isDemo)).toBe(false);
    expect(toUpload.transactions.some((t) => t.isDemo)).toBe(false);
    expect(toUpload.budgets.some((b) => b.isDemo)).toBe(false);

    // Remote Market ID survives; local duplicate Market is absent
    expect(nextState.categories.map((c) => c.id)).toEqual(['rem-market']);
    expect(toUpload.categories).toHaveLength(0);

    // Remapped foreign keys on nextState AND toUpload
    expect(nextState.transactions.find((t) => t.id === 'tx-real')?.categoryId).toBe('rem-market');
    expect(toUpload.transactions.find((t) => t.id === 'tx-real')?.categoryId).toBe('rem-market');
    expect(nextState.budgets.find((b) => b.id === 'b-real')?.categoryId).toBe('rem-market');
    expect(toUpload.budgets.find((b) => b.id === 'b-real')?.categoryId).toBe('rem-market');
    expect(nextState.installmentPlans[0].categoryId).toBe('rem-market');
    expect(nextState.recurringRules[0].categoryId).toBe('rem-market');
  });

  it('cloud_only mode discards all local data and uploads nothing', () => {
    const localState = makeSnapshot({
      accounts: [makeAccount({ id: 'loc-acc', name: 'Local' })],
      transactions: [makeTx({ id: 'loc-tx', type: 'expense', amount: 50, accountId: 'loc-acc', date: '2026-11-20' })],
    });
    const remoteState = makeSnapshot({
      accounts: [makeAccount({ id: 'rem-acc', name: 'Cloud', userId: 'u1' })],
    });

    const { nextState, toUpload } = mergeLocalIntoCloud(localState, remoteState, 'cloud_only');

    expect(nextState.accounts.map((a) => a.id)).toEqual(['rem-acc']);
    expect(nextState.transactions).toHaveLength(0);
    expect(toUpload.accounts).toHaveLength(0);
    expect(toUpload.transactions).toHaveLength(0);
  });

  it('mergeLwwEntities resolves conflicts strictly by latest updatedAt including soft-delete tombstones', () => {
    const local: Account[] = [
      makeAccount({ id: 'a1', name: 'Local Newer', updatedAt: LATER }),
      makeAccount({ id: 'a2', name: 'Local Older', updatedAt: EARLIER }),
      makeAccount({ id: 'a3', name: 'Local Tombstone', updatedAt: LATER, deletedAt: LATER }),
    ];
    const remote: Account[] = [
      makeAccount({ id: 'a1', name: 'Remote Older', updatedAt: EARLIER }),
      makeAccount({ id: 'a2', name: 'Remote Newer Deleted', updatedAt: LATER, deletedAt: LATER }),
      makeAccount({ id: 'a3', name: 'Remote Older Active', updatedAt: EARLIER, deletedAt: null }),
    ];

    const merged = mergeLwwEntities(local, remote);
    const byId = new Map(merged.map((m) => [m.id, m]));

    expect(byId.get('a1')?.name).toBe('Local Newer');
    expect(byId.get('a2')?.deletedAt).toBe(LATER);
    expect(byId.get('a3')?.deletedAt).toBe(LATER);
  });

  it('maps camelCase entities <-> snake_case Supabase rows explicitly', () => {
    const tx = makeTx({
      id: 'tx-map',
      userId: 'user-1',
      type: 'transfer',
      amount: 100,
      currency: 'USD',
      exchangeRateToBase: 40,
      baseAmount: 4000,
      accountId: 'acc-1',
      toAccountId: 'acc-2',
      toAmount: 4000,
      categoryId: null,
      date: '2026-11-20',
      note: 'Döviz transferi',
      tags: ['döviz'],
      goalId: 'goal-1',
    });

    const snake = toSnakeRow('transactions', tx, 'user-1');
    expect(snake.exchange_rate_to_base).toBe(40);
    expect(snake.base_amount).toBe(4000);
    expect(snake.to_account_id).toBe('acc-2');
    expect(snake.goal_id).toBe('goal-1');

    const roundTrip = fromSnakeRow('transactions', snake) as Transaction;
    expect(roundTrip.exchangeRateToBase).toBe(40);
    expect(roundTrip.baseAmount).toBe(4000);
    expect(roundTrip.toAccountId).toBe('acc-2');
    expect(roundTrip.goalId).toBe('goal-1');
  });

  it('adopts remote budget id when newer local active budget collides on (categoryId, month)', () => {
    const remoteCat = makeCategory({
      id: 'rem-market',
      userId: 'user-1',
      name: 'Market',
      type: 'expense',
    });
    const localCat = makeCategory({
      id: 'loc-market',
      name: 'Market',
      type: 'expense',
    });

    const remoteBudget: Budget = {
      id: 'rem-budget-1',
      userId: 'user-1',
      categoryId: 'rem-market',
      month: '2026-11',
      limitAmount: 4_000,
      currency: 'TRY',
      alert80Sent: false,
      alert100Sent: false,
      createdAt: EARLIER,
      updatedAt: EARLIER,
      deletedAt: null,
    };
    const localBudget: Budget = {
      id: 'loc-budget-1',
      userId: null,
      categoryId: 'loc-market',
      month: '2026-11',
      limitAmount: 7_500,
      currency: 'TRY',
      alert80Sent: false,
      alert100Sent: false,
      createdAt: NOW,
      updatedAt: LATER,
      deletedAt: null,
    };

    const { nextState, toUpload } = mergeLocalIntoCloud(
      makeSnapshot({ categories: [localCat], budgets: [localBudget] }),
      makeSnapshot({ categories: [remoteCat], budgets: [remoteBudget] }),
      'merge',
    );

    const activeBudgets = nextState.budgets.filter((b) => b.deletedAt === null);
    expect(activeBudgets).toHaveLength(1);
    expect(activeBudgets[0].id).toBe('rem-budget-1');
    expect(activeBudgets[0].categoryId).toBe('rem-market');
    expect(activeBudgets[0].limitAmount).toBe(7_500);

    expect(toUpload.budgets).toHaveLength(1);
    expect(toUpload.budgets[0].id).toBe('rem-budget-1');
    expect(toUpload.budgets[0].limitAmount).toBe(7_500);
  });
});

describe('Live FX service', () => {
  it('updates USD/EUR/GBP from open.er-api.com while preserving manual overrides', async () => {
    const existing: ExchangeRate[] = [
      { currencyCode: 'TRY', rateToTry: 1, source: 'auto', updatedAt: EARLIER },
      { currencyCode: 'USD', rateToTry: 35, source: 'auto', updatedAt: EARLIER },
      { currencyCode: 'EUR', rateToTry: 42.5, source: 'manual', updatedAt: EARLIER },
      { currencyCode: 'GBP', rateToTry: 44, source: 'auto', updatedAt: EARLIER },
      { currencyCode: 'XAU', rateToTry: 3350, source: 'auto', updatedAt: EARLIER },
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('open.er-api.com')) {
        return new Response(
          JSON.stringify({
            result: 'success',
            rates: { TRY: 1, USD: 0.025, EUR: 0.02, GBP: 0.02 },
          }),
          { status: 200 },
        );
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const updated = await fetchLiveRates(existing, fetchMock);
    const byCode = new Map(updated.map((r) => [r.currencyCode, r]));

    expect(byCode.get('USD')?.rateToTry).toBe(40);
    expect(byCode.get('USD')?.source).toBe('auto');
    expect(byCode.get('GBP')?.rateToTry).toBe(50);
    // Manual override MUST be preserved
    expect(byCode.get('EUR')?.rateToTry).toBe(42.5);
    expect(byCode.get('EUR')?.source).toBe('manual');
    // Cached XAU preserved when optional gold endpoint is unavailable
    expect(byCode.get('XAU')?.rateToTry).toBe(3350);
  });

  it('falls back gracefully to existingRates on network or parse error', async () => {
    const existing = createDefaultExchangeRates(EARLIER);
    const failingFetch = vi.fn(async () => {
      throw new Error('Network offline');
    }) as unknown as typeof fetch;

    const result = await fetchLiveRates(existing, failingFetch);
    expect(result).toEqual(existing);
  });
});

describe('JSON Backup, HTML Report & Store Integration', () => {
  beforeEach(() => {
    useFinanceStore.getState().clearAllData();
  });

  it('round-trips structured JSON backup excluding receipt binaries and rejects malformed JSON', () => {
    const state = makeSnapshot({
      accounts: [makeAccount({ id: 'acc-1', name: 'Banka' })],
      transactions: [
        makeTx({
          id: 'tx-1',
          type: 'expense',
          amount: 120,
          accountId: 'acc-1',
          date: '2026-11-20',
          receiptUri: 'data:image/png;base64,AAAA',
        }),
      ],
    });

    const json = exportBackupJson(state);
    const parsedRaw = JSON.parse(json) as { schemaVersion: number; exportedAt: string; data: FinanceDataSnapshot };
    expect(parsedRaw.schemaVersion).toBe(1);
    expect(parsedRaw.exportedAt).toBeTruthy();

    const restored = parseBackupJson(json);
    expect(restored.accounts).toHaveLength(1);
    expect(restored.transactions[0].receiptUri).toBeNull();

    expect(() => parseBackupJson('{bad json')).toThrow();
    expect(() => parseBackupJson(JSON.stringify({ schemaVersion: 99, data: {} }))).toThrow();
  });

  it('generates clean Turkish HTML report respecting includeTransactions and includeNotes', () => {
    const cats = createDefaultCategories();
    const snapshot = buildSharedReportSnapshot({
      title: 'Kasım 2026 Raporu',
      periodType: 'monthly',
      range: { startDate: '2026-11-01', endDate: '2026-11-30' },
      prevRange: { startDate: '2026-10-01', endDate: '2026-10-31' },
      transactions: [
        makeTx({
          id: 't1',
          type: 'expense',
          amount: 500,
          accountId: 'acc-1',
          categoryId: cats[7].id,
          date: '2026-11-10',
          note: 'Gizli Not <script>',
        }),
      ],
      categories: cats,
      budgets: [],
      baseCurrency: 'TRY',
      monthStartDay: 1,
      rates: { TRY: 1, USD: 40, EUR: 44, GBP: 50, XAU: 3500 },
      includeTransactions: true,
      includeNotes: false,
      generatedAt: NOW,
    });

    const html = generateReportHtml(snapshot);
    expect(html).toContain('Kasım 2026 Raporu');
    expect(html).toContain('Toplam Gelir');
    expect(html).toContain('Toplam Gider');
    expect(html).not.toContain('Gizli Not');
    expect(html).not.toContain('<script>');
  });

  it('sharePdfReport prints report HTML via hidden iframe on Web without window.open noopener', async () => {
    const cats = createDefaultCategories();
    const snapshot = buildSharedReportSnapshot({
      title: 'Web PDF Test Raporu',
      periodType: 'monthly',
      range: { startDate: '2026-11-01', endDate: '2026-11-30' },
      prevRange: { startDate: '2026-10-01', endDate: '2026-10-31' },
      transactions: [],
      categories: cats,
      budgets: [],
      baseCurrency: 'TRY',
      monthStartDay: 1,
      rates: { TRY: 1, USD: 40, EUR: 44, GBP: 50, XAU: 3500 },
      includeTransactions: false,
      includeNotes: false,
      generatedAt: NOW,
    });

    const prevWindow = globalThis.window;
    const prevDocument = globalThis.document;

    const framePrint = vi.fn();
    const frameFocus = vi.fn();
    const windowOpenSpy = vi.fn();
    const windowPrintSpy = vi.fn();

    const fakeIframe: {
      style: Record<string, string>;
      srcdoc: string;
      onload: (() => void) | null;
      parentNode: { removeChild: (el: unknown) => void } | null;
      contentWindow: {
        focus: () => void;
        print: () => void;
        addEventListener: (ev: string, cb: () => void) => void;
      };
      setAttribute: (k: string, v: string) => void;
    } = {
      style: {},
      srcdoc: '',
      onload: null,
      parentNode: null,
      contentWindow: {
        focus: frameFocus,
        print: framePrint,
        addEventListener: vi.fn(),
      },
      setAttribute: vi.fn(),
    };

    const removeChild = vi.fn(() => {
      fakeIframe.parentNode = null;
    });
    const appendChild = vi.fn(() => {
      fakeIframe.parentNode = { removeChild };
      fakeIframe.onload?.();
    });

    try {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        writable: true,
        value: { open: windowOpenSpy, print: windowPrintSpy },
      });
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        writable: true,
        value: {
          createElement: vi.fn(() => fakeIframe),
          body: { appendChild },
        },
      });

      await sharePdfReport(snapshot);

      expect(windowOpenSpy).not.toHaveBeenCalled();
      expect(windowPrintSpy).not.toHaveBeenCalled();
      expect(fakeIframe.srcdoc).toContain('Web PDF Test Raporu');
      expect(frameFocus).toHaveBeenCalledTimes(1);
      expect(framePrint).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        writable: true,
        value: prevWindow,
      });
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        writable: true,
        value: prevDocument,
      });
    }
  });

  it('restoreFromBackup merge upserts while replace soft-deletes missing records for cloud tombstones', () => {
    const store = useFinanceStore.getState();
    const accA = store.addAccount({
      name: 'Hesap A',
      type: 'bank',
      currency: 'TRY',
      initialBalance: 1000,
      color: '#3B82F6',
      icon: 'landmark',
      isArchived: false,
    });
    const accB = store.addAccount({
      name: 'Hesap B',
      type: 'cash',
      currency: 'TRY',
      initialBalance: 500,
      color: '#10B981',
      icon: 'wallet',
      isArchived: false,
    });

    const backupOnlyA = makeSnapshot({
      accounts: [{ ...accA, name: 'Hesap A Güncel', updatedAt: LATER }],
      categories: useFinanceStore.getState().categories,
    });

    store.restoreFromBackup(backupOnlyA, 'merge');
    let accountsAfterMerge = useFinanceStore.getState().accounts;
    expect(accountsAfterMerge.find((a) => a.id === accA.id)?.name).toBe('Hesap A Güncel');
    expect(accountsAfterMerge.find((a) => a.id === accB.id)?.deletedAt).toBeNull();

    store.restoreFromBackup(backupOnlyA, 'replace');
    accountsAfterMerge = useFinanceStore.getState().accounts;
    expect(accountsAfterMerge.find((a) => a.id === accA.id)?.deletedAt).toBeNull();
    expect(accountsAfterMerge.find((a) => a.id === accB.id)?.deletedAt).not.toBeNull();
  });

  it('triggers budget 80% warning and 100% danger Turkish alerts when adding expenses', () => {
    const store = useFinanceStore.getState();
    const bank = store.addAccount({
      name: 'Banka',
      type: 'bank',
      currency: 'TRY',
      initialBalance: 20_000,
      color: '#3B82F6',
      icon: 'landmark',
      isArchived: false,
    });
    const marketCat = useFinanceStore
      .getState()
      .categories.find((c) => c.name === 'Market' && c.type === 'expense')!;

    store.upsertBudget({
      categoryId: marketCat.id,
      month: '2026-11',
      limitAmount: 1_000,
      currency: 'TRY',
    });

    // 75% -> no alert
    store.addTransaction({
      type: 'expense',
      amount: 750,
      currency: 'TRY',
      accountId: bank.id,
      categoryId: marketCat.id,
      date: '2026-11-10',
      note: 'İlk alışveriş',
    });
    expect(useFinanceStore.getState().alertQueue).toHaveLength(0);
    expect(useFinanceStore.getState().budgets[0].alert80Sent).toBe(false);

    // 75% -> 85% -> warning alert + alert80Sent = true
    store.addTransaction({
      type: 'expense',
      amount: 100,
      currency: 'TRY',
      accountId: bank.id,
      categoryId: marketCat.id,
      date: '2026-11-12',
      note: 'İkinci alışveriş',
    });
    let state = useFinanceStore.getState();
    expect(state.budgets[0].alert80Sent).toBe(true);
    expect(state.budgets[0].alert100Sent).toBe(false);
    expect(state.alertQueue).toHaveLength(1);
    expect(state.alertQueue[0].level).toBe('warning');

    // 85% -> 105% -> danger alert + alert100Sent = true
    store.addTransaction({
      type: 'expense',
      amount: 200,
      currency: 'TRY',
      accountId: bank.id,
      categoryId: marketCat.id,
      date: '2026-11-15',
      note: 'Üçüncü alışveriş',
    });
    state = useFinanceStore.getState();
    expect(state.budgets[0].alert100Sent).toBe(true);
    expect(state.alertQueue).toHaveLength(2);
    expect(state.alertQueue[1].level).toBe('danger');
  });

  it('contributeToGoal creates non-expense transfer and deleting it reverts goal.currentAmount', () => {
    const store = useFinanceStore.getState();
    const bank = store.addAccount({
      name: 'Banka',
      type: 'bank',
      currency: 'TRY',
      initialBalance: 10_000,
      color: '#3B82F6',
      icon: 'landmark',
      isArchived: false,
    });
    const goal = store.addGoal({
      name: 'Tatil Fonu',
      targetAmount: 5_000,
      currentAmount: 0,
      currency: 'TRY',
      icon: 'plane',
      color: '#0EA5E9',
    });

    const tx = store.contributeToGoal({
      goalId: goal.id,
      amount: 2_000,
      accountId: bank.id,
      direction: 'deposit',
      date: '2026-11-20',
      note: 'Kumbaraya aktarım',
    });

    expect(tx).not.toBeNull();
    expect(tx!.type).toBe('transfer');
    expect(tx!.goalId).toBe(goal.id);
    expect(tx!.toAccountId).toBeNull();
    expect(useFinanceStore.getState().savingsGoals[0].currentAmount).toBe(2_000);

    store.deleteTransaction(tx!.id);
    expect(useFinanceStore.getState().savingsGoals[0].currentAmount).toBe(0);
  });

  it('contributeToGoal handles accountless updates directly and syncs withdrawal with nullable account_id', () => {
    const store = useFinanceStore.getState();
    const bank = store.addAccount({
      name: 'Banka',
      type: 'bank',
      currency: 'TRY',
      initialBalance: 10_000,
      color: '#3B82F6',
      icon: 'landmark',
      isArchived: false,
    });
    const goal = store.addGoal({
      name: 'Acil Fon',
      targetAmount: 3_000,
      currentAmount: 0,
      currency: 'TRY',
      icon: 'shield',
      color: '#10B981',
    });

    // Accountless deposit/withdraw updates goal directly without creating fake accountless transactions
    const directDeposit = store.contributeToGoal({
      goalId: goal.id,
      amount: 3_000,
      direction: 'deposit',
    });
    expect(directDeposit).toBeNull();
    expect(useFinanceStore.getState().transactions).toHaveLength(0);
    expect(useFinanceStore.getState().savingsGoals[0].currentAmount).toBe(3_000);
    expect(useFinanceStore.getState().savingsGoals[0].isCompleted).toBe(true);

    const directWithdraw = store.contributeToGoal({
      goalId: goal.id,
      amount: 500,
      direction: 'withdraw',
    });
    expect(directWithdraw).toBeNull();
    expect(useFinanceStore.getState().transactions).toHaveLength(0);
    expect(useFinanceStore.getState().savingsGoals[0].currentAmount).toBe(2_500);
    expect(useFinanceStore.getState().savingsGoals[0].isCompleted).toBe(false);

    // Withdrawal linked to a target account creates transfer with accountId='' -> null in Postgres
    const withdrawTx = store.contributeToGoal({
      goalId: goal.id,
      amount: 1_000,
      accountId: bank.id,
      direction: 'withdraw',
      date: '2026-11-20',
    });
    expect(withdrawTx).not.toBeNull();
    expect(withdrawTx!.accountId).toBe('');
    expect(withdrawTx!.toAccountId).toBe(bank.id);
    expect(useFinanceStore.getState().savingsGoals[0].currentAmount).toBe(1_500);

    const snake = toSnakeRow('transactions', withdrawTx!, 'user-1');
    expect(snake.account_id).toBeNull();
    expect(snake.to_account_id).toBe(bank.id);

    const parsed = fromSnakeRow('transactions', snake) as Transaction;
    expect(parsed.accountId).toBe('');
    expect(parsed.toAccountId).toBe(bank.id);
  });

  it('recordDebtPayment updates debt.paidAmount and deleting linked tx reverts paidAmount', () => {
    const store = useFinanceStore.getState();
    const bank = store.addAccount({
      name: 'Banka',
      type: 'bank',
      currency: 'TRY',
      initialBalance: 10_000,
      color: '#3B82F6',
      icon: 'landmark',
      isArchived: false,
    });
    const debt = store.addDebt({
      personName: 'Ahmet',
      direction: 'owed_to_me',
      totalAmount: 4_000,
      paidAmount: 0,
      currency: 'TRY',
    });

    const directPayment = store.recordDebtPayment({
      debtId: debt.id,
      amount: 500,
    });
    expect(directPayment).toBeNull();
    expect(useFinanceStore.getState().transactions).toHaveLength(0);
    expect(useFinanceStore.getState().debts[0].paidAmount).toBe(500);

    const paymentTx = store.recordDebtPayment({
      debtId: debt.id,
      amount: 1_500,
      accountId: bank.id,
      date: '2026-11-20',
    });

    expect(paymentTx).not.toBeNull();
    expect(paymentTx!.type).toBe('income');
    expect(paymentTx!.debtId).toBe(debt.id);
    expect(useFinanceStore.getState().debts[0].paidAmount).toBe(2_000);

    store.deleteTransaction(paymentTx!.id);
    expect(useFinanceStore.getState().debts[0].paidAmount).toBe(500);
  });

  it('copyPreviousMonthBudgets copies prior month limits cleanly with reset alert flags', () => {
    const store = useFinanceStore.getState();
    const marketCat = useFinanceStore
      .getState()
      .categories.find((c) => c.name === 'Market' && c.type === 'expense')!;

    store.upsertBudget({
      categoryId: marketCat.id,
      month: '2026-10',
      limitAmount: 6_000,
      currency: 'TRY',
      alert80Sent: true,
      alert100Sent: true,
    });

    const copied = store.copyPreviousMonthBudgets('2026-11');
    expect(copied).toHaveLength(1);
    expect(copied[0].month).toBe('2026-11');
    expect(copied[0].limitAmount).toBe(6_000);
    expect(copied[0].alert80Sent).toBe(false);
    expect(copied[0].alert100Sent).toBe(false);
  });

  it('updateSettings converts active budgets when baseCurrency changes and queues info alert', () => {
    const store = useFinanceStore.getState();
    store.setManualRate('USD', 40);
    store.upsertBudget({
      categoryId: null,
      month: '2026-11',
      limitAmount: 40_000,
      currency: 'TRY',
    });

    store.updateSettings({ baseCurrency: 'USD' });

    const state = useFinanceStore.getState();
    expect(state.settings.baseCurrency).toBe('USD');
    expect(state.budgets[0].currency).toBe('USD');
    expect(state.budgets[0].limitAmount).toBe(1_000);
    expect(state.alertQueue.some((a) => a.level === 'info')).toBe(true);
  });

  it('addInstallmentPlan generates installment txs and deleteInstallmentPlan soft-deletes them', () => {
    const store = useFinanceStore.getState();
    const card = store.addAccount({
      name: 'Kredi Kartı',
      type: 'credit_card',
      currency: 'TRY',
      initialBalance: 0,
      creditLimit: 50_000,
      statementDay: 15,
      dueDay: 25,
      color: '#EF4444',
      icon: 'credit-card',
      isArchived: false,
    });
    const cat = useFinanceStore
      .getState()
      .categories.find((c) => c.type === 'expense')!;

    const { plan, transactions } = store.addInstallmentPlan({
      title: 'Telefon',
      accountId: card.id,
      categoryId: cat.id,
      totalAmount: 100,
      currency: 'TRY',
      installmentCount: 3,
      startDate: '2026-01-31',
    });

    expect(transactions).toHaveLength(3);
    expect(transactions.map((t) => t.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(useFinanceStore.getState().transactions.filter((t) => t.deletedAt === null)).toHaveLength(3);

    store.deleteInstallmentPlan(plan.id);
    expect(useFinanceStore.getState().installmentPlans[0].deletedAt).not.toBeNull();
    expect(useFinanceStore.getState().transactions.filter((t) => t.deletedAt === null)).toHaveLength(0);
  });

  it('runDueRecurringRules creates auto transactions and queues/approves manual pending rules', () => {
    const store = useFinanceStore.getState();
    const bank = store.addAccount({
      name: 'Banka',
      type: 'bank',
      currency: 'TRY',
      initialBalance: 10_000,
      color: '#3B82F6',
      icon: 'landmark',
      isArchived: false,
    });
    const cat = useFinanceStore
      .getState()
      .categories.find((c) => c.type === 'expense')!;

    store.addRecurringRule({
      title: 'İnternet',
      type: 'expense',
      amount: 500,
      currency: 'TRY',
      accountId: bank.id,
      categoryId: cat.id,
      frequency: 'monthly',
      nextRunDate: '2026-10-15',
      autoCreate: true,
      remindDaysBefore: 2,
      isActive: true,
    });

    const manualRule = store.addRecurringRule({
      title: 'Aidat',
      type: 'expense',
      amount: 800,
      currency: 'TRY',
      accountId: bank.id,
      categoryId: cat.id,
      frequency: 'monthly',
      nextRunDate: '2026-11-10',
      autoCreate: false,
      remindDaysBefore: 2,
      isActive: true,
    });

    const res = store.runDueRecurringRules('2026-11-20');
    expect(res.createdTransactions).toHaveLength(2);
    expect(res.pendingApprovals).toHaveLength(1);
    expect(res.pendingApprovals[0].rule.id).toBe(manualRule.id);

    const approvedTx = store.approvePendingRecurring(manualRule.id, '2026-11-10');
    expect(approvedTx?.amount).toBe(800);
    expect(useFinanceStore.getState().pendingApprovals).toHaveLength(0);
    expect(
      useFinanceStore.getState().recurringRules.find((r) => r.id === manualRule.id)?.nextRunDate,
    ).toBe('2026-12-10');
  });
});
