import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSharedReportSnapshot, computePeriodKPIs } from '@/domain/analytics';
import { ratesListToMap } from '@/domain/currency';
import {
  computeAccountBalance,
  computeCreditCardSummary,
  computeNetWorth,
} from '@/domain/ledger';
import { addMoney, subMoney } from '@/domain/money';
import { getPeriodRange, getPreviousPeriodRange } from '@/domain/periods';
import {
  exportBackupJson,
  generateTransactionsCsv,
  parseBackupJson,
} from '@/services/exportService';
import {
  clearLocalSharedReportsForTests,
  createSharedReport,
  fetchPublicSharedReport,
  listSharedReports,
  revokeSharedReport,
} from '@/services/sharedReportService';
import { resetSupabaseClientForTests } from '@/services/supabase';
import { useFinanceStore } from '@/store/useFinanceStore';

const AS_OF_DATE = '2026-11-20';

function getCurrentNetWorth() {
  const state = useFinanceStore.getState();
  return computeNetWorth({
    accounts: state.accounts,
    goals: state.savingsGoals,
    debts: state.debts,
    transactions: state.transactions,
    rates: ratesListToMap(state.exchangeRates),
    baseCurrency: state.settings.baseCurrency,
    asOfDate: AS_OF_DATE,
  });
}

function getNovemberKpis() {
  const state = useFinanceStore.getState();
  const novRange = getPeriodRange('monthly', AS_OF_DATE, state.settings.monthStartDay);
  const octRange = getPreviousPeriodRange(
    'monthly',
    novRange,
    state.settings.monthStartDay,
  );
  return {
    novRange,
    octRange,
    kpis: computePeriodKPIs(state.transactions, novRange, octRange),
  };
}

describe('End-to-End Financial Lifecycle Integration Flow', () => {
  const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    resetSupabaseClientForTests();
    await clearLocalSharedReportsForTests();
    useFinanceStore.getState().clearAllData();
  });

  afterEach(async () => {
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
    resetSupabaseClientForTests();
    await clearLocalSharedReportsForTests();
  });

  it('executes the complete 6-step user financial, reporting, sharing, and backup lifecycle', async () => {
    // -------------------------------------------------------------------------
    // Step 1: Load demo dataset & verify 2A Net Worth reconciliation
    // -------------------------------------------------------------------------
    useFinanceStore.getState().loadDemoData(AS_OF_DATE);

    const step1State = useFinanceStore.getState();
    const bankAccount = step1State.accounts.find((a) => a.type === 'bank' && a.deletedAt === null);
    const cardAccount = step1State.accounts.find(
      (a) => a.type === 'credit_card' && a.deletedAt === null,
    );
    const goal = step1State.savingsGoals.find((g) => g.deletedAt === null);
    const expenseCategory = step1State.categories.find(
      (c) => c.type === 'expense' && c.deletedAt === null,
    );

    expect(bankAccount).toBeDefined();
    expect(cardAccount).toBeDefined();
    expect(goal).toBeDefined();
    expect(expenseCategory).toBeDefined();

    const nw1 = getCurrentNetWorth();
    expect(nw1.netWorth).toBe(
      subMoney(addMoney(nw1.totalAssets, nw1.totalGoals), nw1.totalCardDebt),
    );
    // Personal debts are tracked in their own ledger and excluded from 2A Net Worth
    expect(nw1.owedToMe).toBe(4_000);
    expect(nw1.owedByMe).toBe(3_500);
    expect(nw1.netDebtPosition).toBe(500);

    const cardBeforeInstallment = computeCreditCardSummary(
      cardAccount!,
      step1State.transactions,
      AS_OF_DATE,
    );
    const { kpis: novKpisBefore } = getNovemberKpis();

    // -------------------------------------------------------------------------
    // Step 2: Add 3-month 3,000 TRY installment on credit card starting 2026-11-20
    // -------------------------------------------------------------------------
    const { transactions: createdInstallments } = useFinanceStore
      .getState()
      .addInstallmentPlan({
        title: 'E2E Akıllı Saat Taksiti',
        accountId: cardAccount!.id,
        categoryId: expenseCategory!.id,
        totalAmount: 3_000,
        currency: 'TRY',
        installmentCount: 3,
        startDate: AS_OF_DATE,
        note: '3 taksit test',
      });

    expect(createdInstallments).toHaveLength(3);
    expect(createdInstallments.map((t) => t.date)).toEqual([
      '2026-11-20',
      '2026-12-20',
      '2027-01-20',
    ]);

    const step2State = useFinanceStore.getState();
    const cardAfterInstallment = computeCreditCardSummary(
      cardAccount!,
      step2State.transactions,
      AS_OF_DATE,
    );
    const nw2 = getCurrentNetWorth();
    const { kpis: novKpisAfterInstallment } = getNovemberKpis();

    // Total card debt & Net Worth reflect all 3,000 TRY immediately
    expect(subMoney(cardAfterInstallment.totalDebt, cardBeforeInstallment.totalDebt)).toBe(3_000);
    expect(subMoney(nw1.netWorth, nw2.netWorth)).toBe(3_000);
    // November's expense KPI increases by ONLY the 1st installment (1,000 TRY)
    expect(subMoney(novKpisAfterInstallment.totalExpense, novKpisBefore.totalExpense)).toBe(
      1_000,
    );

    // -------------------------------------------------------------------------
    // Step 3: Pay 1,000 TRY credit card bill via transfer (Bank -> Credit Card)
    // -------------------------------------------------------------------------
    const bankBalanceBeforeBill = computeAccountBalance(
      bankAccount!,
      step2State.transactions,
      AS_OF_DATE,
    );

    useFinanceStore.getState().addTransaction({
      type: 'transfer',
      amount: 1_000,
      currency: 'TRY',
      accountId: bankAccount!.id,
      toAccountId: cardAccount!.id,
      toAmount: 1_000,
      categoryId: null,
      date: AS_OF_DATE,
      note: 'Kredi kartı borç ödemesi',
    });

    const step3State = useFinanceStore.getState();
    const cardAfterBill = computeCreditCardSummary(
      cardAccount!,
      step3State.transactions,
      AS_OF_DATE,
    );
    const bankBalanceAfterBill = computeAccountBalance(
      bankAccount!,
      step3State.transactions,
      AS_OF_DATE,
    );
    const nw3 = getCurrentNetWorth();
    const { kpis: novKpisAfterBill } = getNovemberKpis();

    expect(subMoney(cardAfterInstallment.totalDebt, cardAfterBill.totalDebt)).toBe(1_000);
    expect(subMoney(bankBalanceBeforeBill, bankBalanceAfterBill)).toBe(1_000);
    expect(nw3.netWorth).toBe(nw2.netWorth);
    expect(novKpisAfterBill.totalExpense).toBe(novKpisAfterInstallment.totalExpense);

    // -------------------------------------------------------------------------
    // Step 4: Contribute 2,000 TRY from Bank to Savings Goal
    // -------------------------------------------------------------------------
    const goalAmountBefore = step3State.savingsGoals.find((g) => g.id === goal!.id)!.currentAmount;

    useFinanceStore.getState().contributeToGoal({
      goalId: goal!.id,
      amount: 2_000,
      accountId: bankAccount!.id,
      direction: 'deposit',
      date: AS_OF_DATE,
      note: 'Kumbaraya aktarım',
    });

    const step4State = useFinanceStore.getState();
    const bankBalanceAfterGoal = computeAccountBalance(
      bankAccount!,
      step4State.transactions,
      AS_OF_DATE,
    );
    const goalAmountAfter = step4State.savingsGoals.find((g) => g.id === goal!.id)!.currentAmount;
    const nw4 = getCurrentNetWorth();
    const { kpis: novKpisAfterGoal } = getNovemberKpis();

    expect(subMoney(bankBalanceAfterBill, bankBalanceAfterGoal)).toBe(2_000);
    expect(subMoney(goalAmountAfter, goalAmountBefore)).toBe(2_000);
    expect(nw4.netWorth).toBe(nw3.netWorth);
    expect(novKpisAfterGoal.totalExpense).toBe(novKpisAfterBill.totalExpense);

    // -------------------------------------------------------------------------
    // Step 5: Build privacy-filtered shared report -> create -> fetch -> revoke
    // -------------------------------------------------------------------------
    const { novRange, octRange } = getNovemberKpis();
    const snapshot = buildSharedReportSnapshot({
      title: 'Kasım 2026 Özet Raporu',
      periodType: 'monthly',
      range: novRange,
      prevRange: octRange,
      transactions: step4State.transactions,
      categories: step4State.categories,
      budgets: step4State.budgets,
      baseCurrency: step4State.settings.baseCurrency,
      monthStartDay: step4State.settings.monthStartDay,
      rates: ratesListToMap(step4State.exchangeRates),
      includeTransactions: false,
      includeNotes: false,
      generatedAt: '2026-11-20T15:00:00.000Z',
    });

    const createdReport = await createSharedReport(
      {
        title: snapshot.title,
        periodType: 'monthly',
        startDate: novRange.startDate,
        endDate: novRange.endDate,
        includeTransactions: false,
        includeNotes: false,
        snapshot,
        expiresInDays: 7,
        userId: null,
      },
      '2026-11-20T15:00:00.000Z',
    );

    const listedReports = await listSharedReports(null);
    expect(listedReports.some((r) => r.id === createdReport.id)).toBe(true);

    const fetchedOk = await fetchPublicSharedReport(
      createdReport.shareToken,
      '2026-11-20T15:05:00.000Z',
    );
    expect(fetchedOk.status).toBe('ok');
    if (fetchedOk.status === 'ok') {
      expect(fetchedOk.report.viewCount).toBe(1);
      expect(fetchedOk.report.snapshotJson.kpis.totalIncome).toBeGreaterThan(0);
      expect(fetchedOk.report.snapshotJson.kpis.totalExpense).toBe(novKpisAfterGoal.totalExpense);
      expect(fetchedOk.report.snapshotJson.incomeExpenseSeries.length).toBeGreaterThan(0);
      expect(fetchedOk.report.snapshotJson.cumulativeCashFlowSeries.length).toBeGreaterThan(0);
      expect(fetchedOk.report.snapshotJson.expenseBreakdown.length).toBeGreaterThan(0);
      expect(fetchedOk.report.snapshotJson.transactions).toEqual([]);
    }

    await revokeSharedReport(createdReport.id, null);
    const fetchedRevoked = await fetchPublicSharedReport(
      createdReport.shareToken,
      '2026-11-20T15:10:00.000Z',
    );
    expect(fetchedRevoked).toEqual({ status: 'revoked' });

    // -------------------------------------------------------------------------
    // Step 6: Export CSV & JSON backup -> wipe -> restore -> verify round-trip
    // -------------------------------------------------------------------------
    const csv = generateTransactionsCsv(
      step4State.transactions,
      step4State.accounts,
      step4State.categories,
    );
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.slice(1).split('\r\n')[0]).toBe(
      'Tarih,Tür,Tutar,Para Birimi,Ana Para Birimi Tutarı,Hesap,Hedef Hesap,Kategori,Not,Etiketler',
    );
    expect(csv).toContain('E2E Akıllı Saat Taksiti (1/3)');

    const preBackupSnapshot = step4State.getDataSnapshot();
    const backupJson = exportBackupJson(preBackupSnapshot);
    const parsedBackup = parseBackupJson(backupJson);

    useFinanceStore.getState().clearAllData();
    expect(useFinanceStore.getState().transactions).toHaveLength(0);

    useFinanceStore.getState().restoreFromBackup(parsedBackup, 'replace');
    const restoredSnapshot = useFinanceStore.getState().getDataSnapshot();

    const normalizeSnapshotForRoundTrip = (snap: typeof preBackupSnapshot) => ({
      ...snap,
      transactions: snap.transactions.map((tx) => ({
        ...tx,
        receiptUri: null,
      })),
    });

    expect(restoredSnapshot).toEqual(normalizeSnapshotForRoundTrip(preBackupSnapshot));
    expect(getCurrentNetWorth().netWorth).toBe(nw4.netWorth);
  });
});
