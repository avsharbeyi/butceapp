import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { computeBudgetProgress } from '@/domain/analytics';
import { convertAmount, getRateToBase, ratesListToMap } from '@/domain/currency';
import {
  buildDemoDataset,
  createDefaultCategories,
  createDefaultExchangeRates,
  DEFAULT_SETTINGS,
} from '@/domain/defaults';
import {
  buildInstallmentTransactions,
  generateEntityId,
  recomputeDebtPaidAmount,
  recomputeGoalAmount,
} from '@/domain/ledger';
import { formatMoney, roundMoney, subMoney } from '@/domain/money';
import { addMonthsClamped, getFiscalMonthKey, parseIsoDate } from '@/domain/periods';
import { advanceRuleDate, processDueRecurringRules } from '@/domain/recurring';
import type {
  Account,
  Budget,
  Category,
  CurrencyCode,
  Debt,
  ExchangeRate,
  FinanceDataSnapshot,
  InstallmentPlan,
  RecurringRule,
  SavingsGoal,
  SyncEntityName,
  SyncQueueItem,
  Transaction,
  UserSettings,
} from '@/domain/types';
import { fetchLiveRates } from '@/services/fxService';
import { mergeLwwEntities } from '@/services/syncEngine';

export interface AlertBannerItem {
  id: string;
  level: 'warning' | 'danger' | 'info';
  title: string;
  message: string;
  createdAt: string;
}

export interface PendingRecurringItem {
  rule: RecurringRule;
  dueDate: string;
}

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'offline' | 'error';

export type NewAccountInput = Omit<
  Account,
  'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt'
> & {
  userId?: string | null;
};

export type NewCategoryInput = Omit<
  Category,
  'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'isDefault' | 'sortOrder'
> & {
  userId?: string | null;
  isDefault?: boolean;
  sortOrder?: number;
};

export type NewTransactionInput = Omit<
  Transaction,
  | 'id'
  | 'userId'
  | 'createdAt'
  | 'updatedAt'
  | 'deletedAt'
  | 'exchangeRateToBase'
  | 'baseAmount'
  | 'tags'
> & {
  userId?: string | null;
  tags?: string[];
  exchangeRateToBase?: number;
  baseAmount?: number;
};

export type NewInstallmentPlanInput = Omit<
  InstallmentPlan,
  'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt'
> & {
  userId?: string | null;
};

export type NewRecurringRuleInput = Omit<
  RecurringRule,
  'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt'
> & {
  userId?: string | null;
};

export type UpsertBudgetInput = {
  categoryId: string | null;
  month: string;
  limitAmount: number;
  currency: CurrencyCode;
  alert80Sent?: boolean;
  alert100Sent?: boolean;
};

export type NewGoalInput = Omit<
  SavingsGoal,
  'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'isCompleted' | 'currentAmount'
> & {
  userId?: string | null;
  currentAmount?: number;
};

export type NewDebtInput = Omit<
  Debt,
  'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'isSettled' | 'paidAmount'
> & {
  userId?: string | null;
  paidAmount?: number;
};

export interface FinanceStoreState extends FinanceDataSnapshot {
  syncQueue: SyncQueueItem[];
  pendingApprovals: PendingRecurringItem[];
  alertQueue: AlertBannerItem[];
  lastSyncedAt: string | null;
  hasHydrated: boolean;
  syncStatus: SyncStatus;

  addAccount: (input: NewAccountInput) => Account;
  updateAccount: (id: string, patch: Partial<Account>) => void;
  archiveAccount: (id: string, isArchived?: boolean) => void;
  deleteAccount: (id: string) => void;

  addTransaction: (input: NewTransactionInput) => Transaction;
  updateTransaction: (id: string, patch: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;

  addInstallmentPlan: (input: NewInstallmentPlanInput) => {
    plan: InstallmentPlan;
    transactions: Transaction[];
  };
  deleteInstallmentPlan: (id: string) => void;

  addRecurringRule: (input: NewRecurringRuleInput) => RecurringRule;
  updateRecurringRule: (id: string, patch: Partial<RecurringRule>) => void;
  deleteRecurringRule: (id: string) => void;
  runDueRecurringRules: (asOfDate?: string) => {
    createdTransactions: Transaction[];
    pendingApprovals: PendingRecurringItem[];
  };
  approvePendingRecurring: (ruleId: string, dueDate: string) => Transaction | null;
  dismissPendingRecurring: (ruleId: string, dueDate: string) => void;

  upsertBudget: (input: UpsertBudgetInput) => Budget;
  deleteBudget: (id: string) => void;
  copyPreviousMonthBudgets: (targetMonthKey: string) => Budget[];

  addGoal: (input: NewGoalInput) => SavingsGoal;
  updateGoal: (id: string, patch: Partial<SavingsGoal>) => void;
  contributeToGoal: (params: {
    goalId: string;
    amount: number;
    accountId?: string;
    direction: 'deposit' | 'withdraw';
    date?: string;
    note?: string;
  }) => Transaction;
  deleteGoal: (id: string) => void;

  addDebt: (input: NewDebtInput) => Debt;
  updateDebt: (id: string, patch: Partial<Debt>) => void;
  recordDebtPayment: (params: {
    debtId: string;
    amount: number;
    accountId?: string;
    date?: string;
    note?: string;
  }) => Transaction;
  deleteDebt: (id: string) => void;

  addCategory: (input: NewCategoryInput) => Category;
  updateCategory: (id: string, patch: Partial<Category>) => void;
  deleteCategory: (id: string) => void;

  setManualRate: (currencyCode: CurrencyCode, rateToTry: number) => void;
  resetRateToAuto: (currencyCode: CurrencyCode) => void;
  refreshLiveRates: () => Promise<ExchangeRate[]>;

  updateSettings: (patch: Partial<UserSettings>) => void;
  dismissAlert: (id: string) => void;
  setSyncStatus: (status: SyncStatus) => void;
  clearSyncQueue: (processedIds?: string[]) => void;

  loadDemoData: (anchorDate?: string) => void;
  clearAllData: () => void;
  restoreFromBackup: (backup: FinanceDataSnapshot, mode: 'merge' | 'replace') => void;
  applyCloudState: (state: FinanceDataSnapshot) => void;
  clearUserLocalDataOnSignOut: () => void;
  getDataSnapshot: () => FinanceDataSnapshot;
}

const memoryStorage = new Map<string, string>();

function canUseNativeOrWebAsyncStorage(): boolean {
  const hasWindow = typeof window !== 'undefined';
  const isReactNative =
    typeof navigator !== 'undefined' &&
    (navigator as { product?: string }).product === 'ReactNative';
  return hasWindow || isReactNative;
}

const safeAsyncStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (!canUseNativeOrWebAsyncStorage()) {
      return memoryStorage.get(name) ?? null;
    }
    try {
      const mod = await import('@react-native-async-storage/async-storage');
      return await mod.default.getItem(name);
    } catch {
      return memoryStorage.get(name) ?? null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    memoryStorage.set(name, value);
    if (!canUseNativeOrWebAsyncStorage()) {
      return;
    }
    try {
      const mod = await import('@react-native-async-storage/async-storage');
      await mod.default.setItem(name, value);
    } catch {
      // Fallback already persisted in memoryStorage
    }
  },
  removeItem: async (name: string): Promise<void> => {
    memoryStorage.delete(name);
    if (!canUseNativeOrWebAsyncStorage()) {
      return;
    }
    try {
      const mod = await import('@react-native-async-storage/async-storage');
      await mod.default.removeItem(name);
    } catch {
      // Fallback already cleared in memoryStorage
    }
  },
};

function enqueueSyncOps(
  queue: SyncQueueItem[],
  items: Array<{ entity: SyncEntityName; recordId: string; op: 'upsert' | 'delete'; updatedAt: string }>,
): SyncQueueItem[] {
  if (items.length === 0) {
    return queue;
  }
  const next = [...queue];
  for (const item of items) {
    const existingIdx = next.findIndex(
      (q) => q.entity === item.entity && q.recordId === item.recordId,
    );
    const entry: SyncQueueItem = {
      id: generateEntityId(),
      entity: item.entity,
      recordId: item.recordId,
      op: item.op,
      updatedAt: item.updatedAt,
    };
    if (existingIdx >= 0) {
      next[existingIdx] = entry;
    } else {
      next.push(entry);
    }
  }
  return next;
}

function reconcileGoalsAndDebts(params: {
  prevTransactions: Transaction[];
  nextTransactions: Transaction[];
  goals: SavingsGoal[];
  debts: Debt[];
  affectedGoalIds: Set<string>;
  affectedDebtIds: Set<string>;
  nowIso: string;
}): {
  goals: SavingsGoal[];
  debts: Debt[];
  syncItems: Array<{ entity: SyncEntityName; recordId: string; op: 'upsert'; updatedAt: string }>;
} {
  const { prevTransactions, nextTransactions, affectedGoalIds, affectedDebtIds, nowIso } = params;
  const syncItems: Array<{ entity: SyncEntityName; recordId: string; op: 'upsert'; updatedAt: string }> = [];

  const goals = params.goals.map((goal) => {
    if (!affectedGoalIds.has(goal.id)) {
      return goal;
    }
    const priorLinked = recomputeGoalAmount(goal, prevTransactions, 0);
    const manualOffset = Math.max(0, subMoney(goal.currentAmount, priorLinked));
    const currentAmount = recomputeGoalAmount(goal, nextTransactions, manualOffset);
    const isCompleted = currentAmount >= goal.targetAmount;
    if (currentAmount === goal.currentAmount && isCompleted === goal.isCompleted) {
      return goal;
    }
    if (!goal.isDemo) {
      syncItems.push({ entity: 'savings_goals', recordId: goal.id, op: 'upsert', updatedAt: nowIso });
    }
    return {
      ...goal,
      currentAmount,
      isCompleted,
      updatedAt: nowIso,
    };
  });

  const debts = params.debts.map((debt) => {
    if (!affectedDebtIds.has(debt.id)) {
      return debt;
    }
    const priorLinked = recomputeDebtPaidAmount(debt, prevTransactions, 0);
    const manualOffset = Math.max(0, subMoney(debt.paidAmount, priorLinked));
    const paidAmount = recomputeDebtPaidAmount(debt, nextTransactions, manualOffset);
    const isSettled = paidAmount >= debt.totalAmount;
    if (paidAmount === debt.paidAmount && isSettled === debt.isSettled) {
      return debt;
    }
    if (!debt.isDemo) {
      syncItems.push({ entity: 'debts', recordId: debt.id, op: 'upsert', updatedAt: nowIso });
    }
    return {
      ...debt,
      paidAmount,
      isSettled,
      updatedAt: nowIso,
    };
  });

  return { goals, debts, syncItems };
}

function evaluateBudgetAlertsForMonths(params: {
  budgets: Budget[];
  transactions: Transaction[];
  categories: Category[];
  monthKeys: Set<string>;
  monthStartDay: number;
  rates: Record<CurrencyCode, number>;
  nowIso: string;
}): {
  budgets: Budget[];
  newAlerts: AlertBannerItem[];
  syncItems: Array<{ entity: SyncEntityName; recordId: string; op: 'upsert'; updatedAt: string }>;
} {
  let nextBudgets = params.budgets;
  const newAlerts: AlertBannerItem[] = [];
  const syncItems: Array<{ entity: SyncEntityName; recordId: string; op: 'upsert'; updatedAt: string }> = [];

  for (const monthKey of params.monthKeys) {
    const progressItems = computeBudgetProgress(
      nextBudgets,
      params.transactions,
      params.categories,
      monthKey,
      params.monthStartDay,
      params.rates,
    );

    for (const item of progressItems) {
      if (item.limit <= 0) {
        continue;
      }

      if (item.pct >= 100 && !item.budget.alert100Sent) {
        nextBudgets = nextBudgets.map((b) =>
          b.id === item.budget.id
            ? { ...b, alert80Sent: true, alert100Sent: true, updatedAt: params.nowIso }
            : b,
        );
        newAlerts.push({
          id: generateEntityId(),
          level: 'danger',
          title: 'Bütçe Limiti Aşıldı',
          message: `${item.categoryName} bütçeniz %${Math.round(item.pct)} seviyesine ulaştı (${formatMoney(item.spent, item.budget.currency)} / ${formatMoney(item.limit, item.budget.currency)}).`,
          createdAt: params.nowIso,
        });
        if (!item.budget.isDemo) {
          syncItems.push({ entity: 'budgets', recordId: item.budget.id, op: 'upsert', updatedAt: params.nowIso });
        }
      } else if (item.pct >= 80 && item.pct < 100 && !item.budget.alert80Sent) {
        nextBudgets = nextBudgets.map((b) =>
          b.id === item.budget.id
            ? { ...b, alert80Sent: true, updatedAt: params.nowIso }
            : b,
        );
        newAlerts.push({
          id: generateEntityId(),
          level: 'warning',
          title: 'Bütçe Sınırına Yaklaşıldı',
          message: `${item.categoryName} bütçenizin %${Math.round(item.pct)} kadarı harcandı (${formatMoney(item.spent, item.budget.currency)} / ${formatMoney(item.limit, item.budget.currency)}).`,
          createdAt: params.nowIso,
        });
        if (!item.budget.isDemo) {
          syncItems.push({ entity: 'budgets', recordId: item.budget.id, op: 'upsert', updatedAt: params.nowIso });
        }
      }
    }
  }

  return { budgets: nextBudgets, newAlerts, syncItems };
}

function createEmptyInitialData(): FinanceDataSnapshot {
  const nowIso = new Date().toISOString();
  return {
    accounts: [],
    categories: createDefaultCategories(null, nowIso),
    transactions: [],
    installmentPlans: [],
    recurringRules: [],
    budgets: [],
    savingsGoals: [],
    debts: [],
    exchangeRates: createDefaultExchangeRates(nowIso),
    settings: { ...DEFAULT_SETTINGS },
  };
}

export const useFinanceStore = create<FinanceStoreState>()(
  persist(
    (set, get) => ({
      ...createEmptyInitialData(),
      syncQueue: [],
      pendingApprovals: [],
      alertQueue: [],
      lastSyncedAt: null,
      hasHydrated: false,
      syncStatus: 'local',

      addAccount: (input) => {
        const nowIso = new Date().toISOString();
        const account: Account = {
          ...input,
          id: generateEntityId(),
          userId: input.userId ?? null,
          initialBalance: roundMoney(input.initialBalance),
          createdAt: nowIso,
          updatedAt: nowIso,
          deletedAt: null,
        };
        set((state) => ({
          accounts: [...state.accounts, account],
          syncQueue: account.isDemo
            ? state.syncQueue
            : enqueueSyncOps(state.syncQueue, [
                { entity: 'accounts', recordId: account.id, op: 'upsert', updatedAt: nowIso },
              ]),
        }));
        return account;
      },

      updateAccount: (id, patch) => {
        const nowIso = new Date().toISOString();
        set((state) => {
          const target = state.accounts.find((a) => a.id === id);
          if (!target) {
            return state;
          }
          const updated: Account = {
            ...target,
            ...patch,
            initialBalance:
              patch.initialBalance !== undefined
                ? roundMoney(patch.initialBalance)
                : target.initialBalance,
            updatedAt: nowIso,
          };
          return {
            accounts: state.accounts.map((a) => (a.id === id ? updated : a)),
            syncQueue: updated.isDemo
              ? state.syncQueue
              : enqueueSyncOps(state.syncQueue, [
                  { entity: 'accounts', recordId: id, op: 'upsert', updatedAt: nowIso },
                ]),
          };
        });
      },

      archiveAccount: (id, isArchived = true) => {
        get().updateAccount(id, { isArchived });
      },

      deleteAccount: (id) => {
        const nowIso = new Date().toISOString();
        set((state) => {
          const target = state.accounts.find((a) => a.id === id);
          if (!target) {
            return state;
          }
          return {
            accounts: state.accounts.map((a) =>
              a.id === id ? { ...a, deletedAt: nowIso, updatedAt: nowIso } : a,
            ),
            syncQueue: target.isDemo
              ? state.syncQueue
              : enqueueSyncOps(state.syncQueue, [
                  { entity: 'accounts', recordId: id, op: 'delete', updatedAt: nowIso },
                ]),
          };
        });
      },

      addTransaction: (input) => {
        const nowIso = new Date().toISOString();
        const state = get();
        const rates = ratesListToMap(state.exchangeRates);
        const amount = roundMoney(input.amount);
        const exchangeRateToBase =
          input.exchangeRateToBase ?? getRateToBase(input.currency, state.settings.baseCurrency, rates);
        const baseAmount =
          input.baseAmount ??
          convertAmount(amount, input.currency, state.settings.baseCurrency, rates);

        const tx: Transaction = {
          ...input,
          id: generateEntityId(),
          userId: input.userId ?? null,
          amount,
          toAmount: input.toAmount != null ? roundMoney(input.toAmount) : input.toAmount,
          exchangeRateToBase,
          baseAmount,
          tags: input.tags ?? [],
          createdAt: nowIso,
          updatedAt: nowIso,
          deletedAt: null,
        };

        set((curr) => {
          const nextTransactions = [...curr.transactions, tx];
          const syncOps: Array<{
            entity: SyncEntityName;
            recordId: string;
            op: 'upsert' | 'delete';
            updatedAt: string;
          }> = [];
          if (!tx.isDemo) {
            syncOps.push({ entity: 'transactions', recordId: tx.id, op: 'upsert', updatedAt: nowIso });
          }

          const affectedGoalIds = new Set<string>(tx.goalId ? [tx.goalId] : []);
          const affectedDebtIds = new Set<string>(tx.debtId ? [tx.debtId] : []);
          const reconciled = reconcileGoalsAndDebts({
            prevTransactions: curr.transactions,
            nextTransactions,
            goals: curr.savingsGoals,
            debts: curr.debts,
            affectedGoalIds,
            affectedDebtIds,
            nowIso,
          });
          syncOps.push(...reconciled.syncItems);

          let nextBudgets = curr.budgets;
          let nextAlerts = curr.alertQueue;
          if (tx.type === 'expense') {
            const monthKeys = new Set([getFiscalMonthKey(tx.date, curr.settings.monthStartDay)]);
            const evaluated = evaluateBudgetAlertsForMonths({
              budgets: curr.budgets,
              transactions: nextTransactions,
              categories: curr.categories,
              monthKeys,
              monthStartDay: curr.settings.monthStartDay,
              rates: ratesListToMap(curr.exchangeRates),
              nowIso,
            });
            nextBudgets = evaluated.budgets;
            if (evaluated.newAlerts.length > 0) {
              nextAlerts = [...curr.alertQueue, ...evaluated.newAlerts];
            }
            syncOps.push(...evaluated.syncItems);
          }

          return {
            transactions: nextTransactions,
            savingsGoals: reconciled.goals,
            debts: reconciled.debts,
            budgets: nextBudgets,
            alertQueue: nextAlerts,
            syncQueue: enqueueSyncOps(curr.syncQueue, syncOps),
          };
        });

        return tx;
      },

      updateTransaction: (id, patch) => {
        const nowIso = new Date().toISOString();
        set((curr) => {
          const oldTx = curr.transactions.find((t) => t.id === id);
          if (!oldTx) {
            return curr;
          }

          const rates = ratesListToMap(curr.exchangeRates);
          const nextCurrency = patch.currency ?? oldTx.currency;
          const nextAmount = patch.amount !== undefined ? roundMoney(patch.amount) : oldTx.amount;
          const shouldRevalue = patch.amount !== undefined || patch.currency !== undefined;

          const exchangeRateToBase =
            patch.exchangeRateToBase ??
            (shouldRevalue
              ? getRateToBase(nextCurrency, curr.settings.baseCurrency, rates)
              : oldTx.exchangeRateToBase);

          const baseAmount =
            patch.baseAmount ??
            (shouldRevalue
              ? convertAmount(nextAmount, nextCurrency, curr.settings.baseCurrency, rates)
              : oldTx.baseAmount);

          const updatedTx: Transaction = {
            ...oldTx,
            ...patch,
            amount: nextAmount,
            currency: nextCurrency,
            toAmount:
              patch.toAmount !== undefined
                ? patch.toAmount != null
                  ? roundMoney(patch.toAmount)
                  : null
                : oldTx.toAmount,
            exchangeRateToBase,
            baseAmount,
            updatedAt: nowIso,
          };

          const nextTransactions = curr.transactions.map((t) => (t.id === id ? updatedTx : t));
          const syncOps: Array<{
            entity: SyncEntityName;
            recordId: string;
            op: 'upsert' | 'delete';
            updatedAt: string;
          }> = [];
          if (!updatedTx.isDemo) {
            syncOps.push({ entity: 'transactions', recordId: id, op: 'upsert', updatedAt: nowIso });
          }

          const affectedGoalIds = new Set<string>();
          if (oldTx.goalId) affectedGoalIds.add(oldTx.goalId);
          if (updatedTx.goalId) affectedGoalIds.add(updatedTx.goalId);

          const affectedDebtIds = new Set<string>();
          if (oldTx.debtId) affectedDebtIds.add(oldTx.debtId);
          if (updatedTx.debtId) affectedDebtIds.add(updatedTx.debtId);

          const reconciled = reconcileGoalsAndDebts({
            prevTransactions: curr.transactions,
            nextTransactions,
            goals: curr.savingsGoals,
            debts: curr.debts,
            affectedGoalIds,
            affectedDebtIds,
            nowIso,
          });
          syncOps.push(...reconciled.syncItems);

          let nextBudgets = curr.budgets;
          let nextAlerts = curr.alertQueue;
          if (updatedTx.type === 'expense' && updatedTx.deletedAt === null) {
            const monthKeys = new Set([getFiscalMonthKey(updatedTx.date, curr.settings.monthStartDay)]);
            const evaluated = evaluateBudgetAlertsForMonths({
              budgets: curr.budgets,
              transactions: nextTransactions,
              categories: curr.categories,
              monthKeys,
              monthStartDay: curr.settings.monthStartDay,
              rates,
              nowIso,
            });
            nextBudgets = evaluated.budgets;
            if (evaluated.newAlerts.length > 0) {
              nextAlerts = [...curr.alertQueue, ...evaluated.newAlerts];
            }
            syncOps.push(...evaluated.syncItems);
          }

          return {
            transactions: nextTransactions,
            savingsGoals: reconciled.goals,
            debts: reconciled.debts,
            budgets: nextBudgets,
            alertQueue: nextAlerts,
            syncQueue: enqueueSyncOps(curr.syncQueue, syncOps),
          };
        });
      },

      deleteTransaction: (id) => {
        const nowIso = new Date().toISOString();
        set((curr) => {
          const oldTx = curr.transactions.find((t) => t.id === id);
          if (!oldTx || oldTx.deletedAt !== null) {
            return curr;
          }

          const nextTransactions = curr.transactions.map((t) =>
            t.id === id ? { ...t, deletedAt: nowIso, updatedAt: nowIso } : t,
          );

          const syncOps: Array<{
            entity: SyncEntityName;
            recordId: string;
            op: 'upsert' | 'delete';
            updatedAt: string;
          }> = [];
          if (!oldTx.isDemo) {
            syncOps.push({ entity: 'transactions', recordId: id, op: 'delete', updatedAt: nowIso });
          }

          const affectedGoalIds = new Set<string>(oldTx.goalId ? [oldTx.goalId] : []);
          const affectedDebtIds = new Set<string>(oldTx.debtId ? [oldTx.debtId] : []);
          const reconciled = reconcileGoalsAndDebts({
            prevTransactions: curr.transactions,
            nextTransactions,
            goals: curr.savingsGoals,
            debts: curr.debts,
            affectedGoalIds,
            affectedDebtIds,
            nowIso,
          });
          syncOps.push(...reconciled.syncItems);

          return {
            transactions: nextTransactions,
            savingsGoals: reconciled.goals,
            debts: reconciled.debts,
            syncQueue: enqueueSyncOps(curr.syncQueue, syncOps),
          };
        });
      },

      addInstallmentPlan: (input) => {
        const nowIso = new Date().toISOString();
        const state = get();
        const rates = ratesListToMap(state.exchangeRates);
        const plan: InstallmentPlan = {
          ...input,
          id: generateEntityId(),
          userId: input.userId ?? null,
          totalAmount: roundMoney(input.totalAmount),
          createdAt: nowIso,
          updatedAt: nowIso,
          deletedAt: null,
        };
        const generatedTxs = buildInstallmentTransactions(
          plan,
          rates,
          state.settings.baseCurrency,
          plan.userId,
        );

        set((curr) => {
          const nextTransactions = [...curr.transactions, ...generatedTxs];
          const syncOps: Array<{
            entity: SyncEntityName;
            recordId: string;
            op: 'upsert' | 'delete';
            updatedAt: string;
          }> = [];

          if (!plan.isDemo) {
            syncOps.push({
              entity: 'installment_plans',
              recordId: plan.id,
              op: 'upsert',
              updatedAt: nowIso,
            });
            for (const tx of generatedTxs) {
              syncOps.push({ entity: 'transactions', recordId: tx.id, op: 'upsert', updatedAt: nowIso });
            }
          }

          const monthKeys = new Set(
            generatedTxs.map((tx) => getFiscalMonthKey(tx.date, curr.settings.monthStartDay)),
          );
          const evaluated = evaluateBudgetAlertsForMonths({
            budgets: curr.budgets,
            transactions: nextTransactions,
            categories: curr.categories,
            monthKeys,
            monthStartDay: curr.settings.monthStartDay,
            rates: ratesListToMap(curr.exchangeRates),
            nowIso,
          });
          syncOps.push(...evaluated.syncItems);

          return {
            installmentPlans: [...curr.installmentPlans, plan],
            transactions: nextTransactions,
            budgets: evaluated.budgets,
            alertQueue:
              evaluated.newAlerts.length > 0
                ? [...curr.alertQueue, ...evaluated.newAlerts]
                : curr.alertQueue,
            syncQueue: enqueueSyncOps(curr.syncQueue, syncOps),
          };
        });

        return { plan, transactions: generatedTxs };
      },

      deleteInstallmentPlan: (id) => {
        const nowIso = new Date().toISOString();
        set((curr) => {
          const plan = curr.installmentPlans.find((p) => p.id === id);
          if (!plan) {
            return curr;
          }

          const syncOps: Array<{
            entity: SyncEntityName;
            recordId: string;
            op: 'upsert' | 'delete';
            updatedAt: string;
          }> = [];
          if (!plan.isDemo) {
            syncOps.push({
              entity: 'installment_plans',
              recordId: id,
              op: 'delete',
              updatedAt: nowIso,
            });
          }

          const nextTransactions = curr.transactions.map((tx) => {
            if (tx.installmentPlanId === id && tx.deletedAt === null) {
              if (!tx.isDemo) {
                syncOps.push({
                  entity: 'transactions',
                  recordId: tx.id,
                  op: 'delete',
                  updatedAt: nowIso,
                });
              }
              return { ...tx, deletedAt: nowIso, updatedAt: nowIso };
            }
            return tx;
          });

          return {
            installmentPlans: curr.installmentPlans.map((p) =>
              p.id === id ? { ...p, deletedAt: nowIso, updatedAt: nowIso } : p,
            ),
            transactions: nextTransactions,
            syncQueue: enqueueSyncOps(curr.syncQueue, syncOps),
          };
        });
      },

      addRecurringRule: (input) => {
        const nowIso = new Date().toISOString();
        const rule: RecurringRule = {
          ...input,
          id: generateEntityId(),
          userId: input.userId ?? null,
          amount: roundMoney(input.amount),
          createdAt: nowIso,
          updatedAt: nowIso,
          deletedAt: null,
        };
        set((curr) => ({
          recurringRules: [...curr.recurringRules, rule],
          syncQueue: rule.isDemo
            ? curr.syncQueue
            : enqueueSyncOps(curr.syncQueue, [
                { entity: 'recurring_rules', recordId: rule.id, op: 'upsert', updatedAt: nowIso },
              ]),
        }));
        return rule;
      },

      updateRecurringRule: (id, patch) => {
        const nowIso = new Date().toISOString();
        set((curr) => {
          const target = curr.recurringRules.find((r) => r.id === id);
          if (!target) {
            return curr;
          }
          const updated: RecurringRule = {
            ...target,
            ...patch,
            amount: patch.amount !== undefined ? roundMoney(patch.amount) : target.amount,
            updatedAt: nowIso,
          };
          return {
            recurringRules: curr.recurringRules.map((r) => (r.id === id ? updated : r)),
            syncQueue: updated.isDemo
              ? curr.syncQueue
              : enqueueSyncOps(curr.syncQueue, [
                  { entity: 'recurring_rules', recordId: id, op: 'upsert', updatedAt: nowIso },
                ]),
          };
        });
      },

      deleteRecurringRule: (id) => {
        const nowIso = new Date().toISOString();
        set((curr) => {
          const target = curr.recurringRules.find((r) => r.id === id);
          if (!target) {
            return curr;
          }
          return {
            recurringRules: curr.recurringRules.map((r) =>
              r.id === id ? { ...r, deletedAt: nowIso, updatedAt: nowIso } : r,
            ),
            pendingApprovals: curr.pendingApprovals.filter((p) => p.rule.id !== id),
            syncQueue: target.isDemo
              ? curr.syncQueue
              : enqueueSyncOps(curr.syncQueue, [
                  { entity: 'recurring_rules', recordId: id, op: 'delete', updatedAt: nowIso },
                ]),
          };
        });
      },

      runDueRecurringRules: (asOfDate = new Date().toISOString().slice(0, 10)) => {
        const nowIso = new Date().toISOString();
        const curr = get();
        const rates = ratesListToMap(curr.exchangeRates);
        const result = processDueRecurringRules(
          curr.recurringRules,
          asOfDate,
          rates,
          curr.settings.baseCurrency,
          nowIso,
        );

        const existingKeys = new Set(
          curr.pendingApprovals.map((p) => `${p.rule.id}|${p.dueDate}`),
        );
        const mergedPending = [...curr.pendingApprovals];
        for (const item of result.pendingApprovals) {
          const key = `${item.rule.id}|${item.dueDate}`;
          if (!existingKeys.has(key)) {
            existingKeys.add(key);
            mergedPending.push(item);
          }
        }

        const syncOps: Array<{
          entity: SyncEntityName;
          recordId: string;
          op: 'upsert' | 'delete';
          updatedAt: string;
        }> = [];

        for (const tx of result.createdTransactions) {
          if (!tx.isDemo) {
            syncOps.push({ entity: 'transactions', recordId: tx.id, op: 'upsert', updatedAt: nowIso });
          }
        }
        result.updatedRules.forEach((rule, idx) => {
          const prev = curr.recurringRules[idx];
          if (prev && rule.nextRunDate !== prev.nextRunDate && !rule.isDemo) {
            syncOps.push({
              entity: 'recurring_rules',
              recordId: rule.id,
              op: 'upsert',
              updatedAt: nowIso,
            });
          }
        });

        const nextTransactions = [...curr.transactions, ...result.createdTransactions];
        const expenseMonths = new Set(
          result.createdTransactions
            .filter((t) => t.type === 'expense')
            .map((t) => getFiscalMonthKey(t.date, curr.settings.monthStartDay)),
        );

        const evaluated = evaluateBudgetAlertsForMonths({
          budgets: curr.budgets,
          transactions: nextTransactions,
          categories: curr.categories,
          monthKeys: expenseMonths,
          monthStartDay: curr.settings.monthStartDay,
          rates,
          nowIso,
        });
        syncOps.push(...evaluated.syncItems);

        set({
          transactions: nextTransactions,
          recurringRules: result.updatedRules,
          pendingApprovals: mergedPending,
          budgets: evaluated.budgets,
          alertQueue:
            evaluated.newAlerts.length > 0
              ? [...curr.alertQueue, ...evaluated.newAlerts]
              : curr.alertQueue,
          syncQueue: enqueueSyncOps(curr.syncQueue, syncOps),
        });

        return {
          createdTransactions: result.createdTransactions,
          pendingApprovals: mergedPending,
        };
      },

      approvePendingRecurring: (ruleId, dueDate) => {
        const curr = get();
        const rule = curr.recurringRules.find((r) => r.id === ruleId && r.deletedAt === null);
        if (!rule) {
          return null;
        }

        const created = get().addTransaction({
          userId: rule.userId,
          type: rule.type,
          amount: rule.amount,
          currency: rule.currency,
          accountId: rule.accountId,
          categoryId: rule.categoryId,
          date: dueDate,
          note: rule.title,
          tags: ['tekrar'],
          recurringRuleId: rule.id,
          isDemo: rule.isDemo,
        });

        const nowIso = new Date().toISOString();
        set((state) => {
          const nextRules = state.recurringRules.map((r) => {
            if (r.id !== ruleId) return r;
            const anchorDay = parseIsoDate(r.nextRunDate).day;
            const nextRunDate =
              dueDate >= r.nextRunDate
                ? advanceRuleDate(dueDate, r.frequency, anchorDay)
                : r.nextRunDate;
            return { ...r, nextRunDate, updatedAt: nowIso };
          });
          return {
            recurringRules: nextRules,
            pendingApprovals: state.pendingApprovals.filter(
              (p) => !(p.rule.id === ruleId && p.dueDate === dueDate),
            ),
            syncQueue: rule.isDemo
              ? state.syncQueue
              : enqueueSyncOps(state.syncQueue, [
                  { entity: 'recurring_rules', recordId: ruleId, op: 'upsert', updatedAt: nowIso },
                ]),
          };
        });

        return created;
      },

      dismissPendingRecurring: (ruleId, dueDate) => {
        const nowIso = new Date().toISOString();
        set((state) => {
          const rule = state.recurringRules.find((r) => r.id === ruleId);
          const nextRules = state.recurringRules.map((r) => {
            if (r.id !== ruleId) return r;
            const anchorDay = parseIsoDate(r.nextRunDate).day;
            const nextRunDate =
              dueDate >= r.nextRunDate
                ? advanceRuleDate(dueDate, r.frequency, anchorDay)
                : r.nextRunDate;
            return { ...r, nextRunDate, updatedAt: nowIso };
          });
          return {
            recurringRules: nextRules,
            pendingApprovals: state.pendingApprovals.filter(
              (p) => !(p.rule.id === ruleId && p.dueDate === dueDate),
            ),
            syncQueue:
              rule && !rule.isDemo
                ? enqueueSyncOps(state.syncQueue, [
                    { entity: 'recurring_rules', recordId: ruleId, op: 'upsert', updatedAt: nowIso },
                  ])
                : state.syncQueue,
          };
        });
      },

      upsertBudget: (input) => {
        const nowIso = new Date().toISOString();
        const curr = get();
        const existing = curr.budgets.find(
          (b) =>
            b.deletedAt === null &&
            b.month === input.month &&
            (b.categoryId ?? null) === (input.categoryId ?? null),
        );

        if (existing) {
          const updated: Budget = {
            ...existing,
            limitAmount: roundMoney(input.limitAmount),
            currency: input.currency,
            alert80Sent: input.alert80Sent ?? existing.alert80Sent,
            alert100Sent: input.alert100Sent ?? existing.alert100Sent,
            updatedAt: nowIso,
          };
          set((state) => ({
            budgets: state.budgets.map((b) => (b.id === existing.id ? updated : b)),
            syncQueue: updated.isDemo
              ? state.syncQueue
              : enqueueSyncOps(state.syncQueue, [
                  { entity: 'budgets', recordId: updated.id, op: 'upsert', updatedAt: nowIso },
                ]),
          }));
          return updated;
        }

        const created: Budget = {
          id: generateEntityId(),
          userId: null,
          categoryId: input.categoryId ?? null,
          month: input.month,
          limitAmount: roundMoney(input.limitAmount),
          currency: input.currency,
          alert80Sent: input.alert80Sent ?? false,
          alert100Sent: input.alert100Sent ?? false,
          createdAt: nowIso,
          updatedAt: nowIso,
          deletedAt: null,
        };
        set((state) => ({
          budgets: [...state.budgets, created],
          syncQueue: enqueueSyncOps(state.syncQueue, [
            { entity: 'budgets', recordId: created.id, op: 'upsert', updatedAt: nowIso },
          ]),
        }));
        return created;
      },

      deleteBudget: (id) => {
        const nowIso = new Date().toISOString();
        set((state) => {
          const target = state.budgets.find((b) => b.id === id);
          if (!target) return state;
          return {
            budgets: state.budgets.map((b) =>
              b.id === id ? { ...b, deletedAt: nowIso, updatedAt: nowIso } : b,
            ),
            syncQueue: target.isDemo
              ? state.syncQueue
              : enqueueSyncOps(state.syncQueue, [
                  { entity: 'budgets', recordId: id, op: 'delete', updatedAt: nowIso },
                ]),
          };
        });
      },

      copyPreviousMonthBudgets: (targetMonthKey) => {
        const nowIso = new Date().toISOString();
        const prevMonthKey = addMonthsClamped(`${targetMonthKey}-01`, -1).slice(0, 7);
        const curr = get();
        const prevBudgets = curr.budgets.filter(
          (b) => b.deletedAt === null && b.month === prevMonthKey,
        );
        const existingTargetKeys = new Set(
          curr.budgets
            .filter((b) => b.deletedAt === null && b.month === targetMonthKey)
            .map((b) => b.categoryId ?? 'general'),
        );

        const created: Budget[] = [];
        for (const prev of prevBudgets) {
          const key = prev.categoryId ?? 'general';
          if (existingTargetKeys.has(key)) {
            continue;
          }
          created.push({
            id: generateEntityId(),
            userId: prev.userId,
            categoryId: prev.categoryId,
            month: targetMonthKey,
            limitAmount: prev.limitAmount,
            currency: prev.currency,
            alert80Sent: false,
            alert100Sent: false,
            createdAt: nowIso,
            updatedAt: nowIso,
            deletedAt: null,
          });
        }

        if (created.length > 0) {
          set((state) => ({
            budgets: [...state.budgets, ...created],
            syncQueue: enqueueSyncOps(
              state.syncQueue,
              created.map((b) => ({
                entity: 'budgets' as const,
                recordId: b.id,
                op: 'upsert' as const,
                updatedAt: nowIso,
              })),
            ),
          }));
        }

        return created;
      },

      addGoal: (input) => {
        const nowIso = new Date().toISOString();
        const currentAmount = roundMoney(input.currentAmount ?? 0);
        const targetAmount = roundMoney(input.targetAmount);
        const goal: SavingsGoal = {
          ...input,
          id: generateEntityId(),
          userId: input.userId ?? null,
          targetAmount,
          currentAmount,
          isCompleted: currentAmount >= targetAmount,
          createdAt: nowIso,
          updatedAt: nowIso,
          deletedAt: null,
        };
        set((state) => ({
          savingsGoals: [...state.savingsGoals, goal],
          syncQueue: goal.isDemo
            ? state.syncQueue
            : enqueueSyncOps(state.syncQueue, [
                { entity: 'savings_goals', recordId: goal.id, op: 'upsert', updatedAt: nowIso },
              ]),
        }));
        return goal;
      },

      updateGoal: (id, patch) => {
        const nowIso = new Date().toISOString();
        set((state) => {
          const target = state.savingsGoals.find((g) => g.id === id);
          if (!target) return state;
          const nextTarget =
            patch.targetAmount !== undefined ? roundMoney(patch.targetAmount) : target.targetAmount;
          const nextCurrent =
            patch.currentAmount !== undefined ? roundMoney(patch.currentAmount) : target.currentAmount;
          const updated: SavingsGoal = {
            ...target,
            ...patch,
            targetAmount: nextTarget,
            currentAmount: nextCurrent,
            isCompleted: patch.isCompleted ?? nextCurrent >= nextTarget,
            updatedAt: nowIso,
          };
          return {
            savingsGoals: state.savingsGoals.map((g) => (g.id === id ? updated : g)),
            syncQueue: updated.isDemo
              ? state.syncQueue
              : enqueueSyncOps(state.syncQueue, [
                  { entity: 'savings_goals', recordId: id, op: 'upsert', updatedAt: nowIso },
                ]),
          };
        });
      },

      contributeToGoal: ({ goalId, amount, accountId, direction, date, note }) => {
        const state = get();
        const goal = state.savingsGoals.find((g) => g.id === goalId && g.deletedAt === null);
        if (!goal) {
          throw new Error('Birikim hedefi bulunamadı.');
        }

        const safeAmount = roundMoney(amount);
        const txDate = date ?? new Date().toISOString().slice(0, 10);
        const isDeposit = direction === 'deposit';

        return get().addTransaction({
          userId: goal.userId,
          type: 'transfer',
          amount: safeAmount,
          currency: goal.currency,
          accountId: isDeposit ? (accountId ?? '') : '',
          toAccountId: isDeposit ? null : accountId || 'goal-withdraw',
          toAmount: isDeposit ? null : safeAmount,
          categoryId: null,
          goalId: goal.id,
          date: txDate,
          note:
            note ??
            (isDeposit ? `${goal.name} kumbara aktarımı` : `${goal.name} kumbara çekimi`),
          tags: ['birikim'],
          isDemo: goal.isDemo,
        });
      },

      deleteGoal: (id) => {
        const nowIso = new Date().toISOString();
        set((state) => {
          const target = state.savingsGoals.find((g) => g.id === id);
          if (!target) return state;
          return {
            savingsGoals: state.savingsGoals.map((g) =>
              g.id === id ? { ...g, deletedAt: nowIso, updatedAt: nowIso } : g,
            ),
            syncQueue: target.isDemo
              ? state.syncQueue
              : enqueueSyncOps(state.syncQueue, [
                  { entity: 'savings_goals', recordId: id, op: 'delete', updatedAt: nowIso },
                ]),
          };
        });
      },

      addDebt: (input) => {
        const nowIso = new Date().toISOString();
        const totalAmount = roundMoney(input.totalAmount);
        const paidAmount = roundMoney(input.paidAmount ?? 0);
        const debt: Debt = {
          ...input,
          id: generateEntityId(),
          userId: input.userId ?? null,
          totalAmount,
          paidAmount,
          isSettled: paidAmount >= totalAmount,
          createdAt: nowIso,
          updatedAt: nowIso,
          deletedAt: null,
        };
        set((state) => ({
          debts: [...state.debts, debt],
          syncQueue: debt.isDemo
            ? state.syncQueue
            : enqueueSyncOps(state.syncQueue, [
                { entity: 'debts', recordId: debt.id, op: 'upsert', updatedAt: nowIso },
              ]),
        }));
        return debt;
      },

      updateDebt: (id, patch) => {
        const nowIso = new Date().toISOString();
        set((state) => {
          const target = state.debts.find((d) => d.id === id);
          if (!target) return state;
          const totalAmount =
            patch.totalAmount !== undefined ? roundMoney(patch.totalAmount) : target.totalAmount;
          const paidAmount =
            patch.paidAmount !== undefined ? roundMoney(patch.paidAmount) : target.paidAmount;
          const updated: Debt = {
            ...target,
            ...patch,
            totalAmount,
            paidAmount,
            isSettled: patch.isSettled ?? paidAmount >= totalAmount,
            updatedAt: nowIso,
          };
          return {
            debts: state.debts.map((d) => (d.id === id ? updated : d)),
            syncQueue: updated.isDemo
              ? state.syncQueue
              : enqueueSyncOps(state.syncQueue, [
                  { entity: 'debts', recordId: id, op: 'upsert', updatedAt: nowIso },
                ]),
          };
        });
      },

      recordDebtPayment: ({ debtId, amount, accountId, date, note }) => {
        const state = get();
        const debt = state.debts.find((d) => d.id === debtId && d.deletedAt === null);
        if (!debt) {
          throw new Error('Borç/alacak kaydı bulunamadı.');
        }

        const txType = debt.direction === 'owed_to_me' ? 'income' : 'expense';
        const targetCategoryName =
          debt.direction === 'owed_to_me' ? 'Alacak Tahsilatı' : 'Borç Ödeme';
        const matchedCat = state.categories.find(
          (c) => c.deletedAt === null && c.type === txType && c.name === targetCategoryName,
        );

        return get().addTransaction({
          userId: debt.userId,
          type: txType,
          amount: roundMoney(amount),
          currency: debt.currency,
          accountId: accountId ?? '',
          categoryId: matchedCat?.id ?? null,
          debtId: debt.id,
          date: date ?? new Date().toISOString().slice(0, 10),
          note:
            note ??
            (debt.direction === 'owed_to_me'
              ? `${debt.personName} alacak tahsilatı`
              : `${debt.personName} borç ödemesi`),
          tags: [debt.direction === 'owed_to_me' ? 'alacak' : 'borç'],
          isDemo: debt.isDemo,
        });
      },

      deleteDebt: (id) => {
        const nowIso = new Date().toISOString();
        set((state) => {
          const target = state.debts.find((d) => d.id === id);
          if (!target) return state;
          return {
            debts: state.debts.map((d) =>
              d.id === id ? { ...d, deletedAt: nowIso, updatedAt: nowIso } : d,
            ),
            syncQueue: target.isDemo
              ? state.syncQueue
              : enqueueSyncOps(state.syncQueue, [
                  { entity: 'debts', recordId: id, op: 'delete', updatedAt: nowIso },
                ]),
          };
        });
      },

      addCategory: (input) => {
        const nowIso = new Date().toISOString();
        const state = get();
        const maxOrder = state.categories
          .filter((c) => c.type === input.type)
          .reduce((max, c) => Math.max(max, c.sortOrder), 0);

        const category: Category = {
          ...input,
          id: generateEntityId(),
          userId: input.userId ?? null,
          isDefault: input.isDefault ?? false,
          sortOrder: input.sortOrder ?? maxOrder + 1,
          createdAt: nowIso,
          updatedAt: nowIso,
          deletedAt: null,
        };

        set((curr) => ({
          categories: [...curr.categories, category],
          syncQueue: category.isDemo
            ? curr.syncQueue
            : enqueueSyncOps(curr.syncQueue, [
                { entity: 'categories', recordId: category.id, op: 'upsert', updatedAt: nowIso },
              ]),
        }));
        return category;
      },

      updateCategory: (id, patch) => {
        const nowIso = new Date().toISOString();
        set((state) => {
          const target = state.categories.find((c) => c.id === id);
          if (!target) return state;
          const updated: Category = { ...target, ...patch, updatedAt: nowIso };
          return {
            categories: state.categories.map((c) => (c.id === id ? updated : c)),
            syncQueue: updated.isDemo
              ? state.syncQueue
              : enqueueSyncOps(state.syncQueue, [
                  { entity: 'categories', recordId: id, op: 'upsert', updatedAt: nowIso },
                ]),
          };
        });
      },

      deleteCategory: (id) => {
        const nowIso = new Date().toISOString();
        set((state) => {
          const target = state.categories.find((c) => c.id === id);
          if (!target) return state;
          return {
            categories: state.categories.map((c) =>
              c.id === id ? { ...c, deletedAt: nowIso, updatedAt: nowIso } : c,
            ),
            syncQueue: target.isDemo
              ? state.syncQueue
              : enqueueSyncOps(state.syncQueue, [
                  { entity: 'categories', recordId: id, op: 'delete', updatedAt: nowIso },
                ]),
          };
        });
      },

      setManualRate: (currencyCode, rateToTry) => {
        if (currencyCode === 'TRY' || !Number.isFinite(rateToTry) || rateToTry <= 0) {
          return;
        }
        const nowIso = new Date().toISOString();
        set((state) => {
          const exists = state.exchangeRates.some((r) => r.currencyCode === currencyCode);
          const nextRates: ExchangeRate[] = exists
            ? state.exchangeRates.map((r) =>
                r.currencyCode === currencyCode
                  ? { ...r, rateToTry, source: 'manual', updatedAt: nowIso }
                  : r,
              )
            : [
                ...state.exchangeRates,
                { currencyCode, rateToTry, source: 'manual', updatedAt: nowIso },
              ];
          return { exchangeRates: nextRates };
        });
      },

      resetRateToAuto: (currencyCode) => {
        const nowIso = new Date().toISOString();
        set((state) => ({
          exchangeRates: state.exchangeRates.map((r) =>
            r.currencyCode === currencyCode ? { ...r, source: 'auto', updatedAt: nowIso } : r,
          ),
        }));
      },

      refreshLiveRates: async () => {
        const updated = await fetchLiveRates(get().exchangeRates);
        set({ exchangeRates: updated });
        return updated;
      },

      updateSettings: (patch) => {
        const nowIso = new Date().toISOString();
        set((state) => {
          const prevBase = state.settings.baseCurrency;
          const nextSettings: UserSettings = { ...state.settings, ...patch };
          const syncOps: Array<{
            entity: SyncEntityName;
            recordId: string;
            op: 'upsert' | 'delete';
            updatedAt: string;
          }> = [
            {
              entity: 'user_settings',
              recordId: 'user_settings',
              op: 'upsert',
              updatedAt: nowIso,
            },
          ];

          let nextBudgets = state.budgets;
          let nextAlerts = state.alertQueue;

          if (patch.baseCurrency && patch.baseCurrency !== prevBase) {
            const nextBase = patch.baseCurrency;
            const rates = ratesListToMap(state.exchangeRates);

            nextBudgets = state.budgets.map((budget) => {
              if (budget.deletedAt !== null || budget.currency === nextBase) {
                return budget;
              }
              if (!budget.isDemo) {
                syncOps.push({
                  entity: 'budgets',
                  recordId: budget.id,
                  op: 'upsert',
                  updatedAt: nowIso,
                });
              }
              return {
                ...budget,
                limitAmount: convertAmount(budget.limitAmount, budget.currency, nextBase, rates),
                currency: nextBase,
                updatedAt: nowIso,
              };
            });

            nextAlerts = [
              ...state.alertQueue,
              {
                id: generateEntityId(),
                level: 'info',
                title: 'Ana Para Birimi Güncellendi',
                message: `Ana para birimi ${nextBase} olarak değiştirildi ve aktif bütçe limitleri güncel kurlarla dönüştürüldü.`,
                createdAt: nowIso,
              },
            ];
          }

          return {
            settings: nextSettings,
            budgets: nextBudgets,
            alertQueue: nextAlerts,
            syncQueue: enqueueSyncOps(state.syncQueue, syncOps),
          };
        });
      },

      dismissAlert: (id) => {
        set((state) => ({
          alertQueue: state.alertQueue.filter((a) => a.id !== id),
        }));
      },

      setSyncStatus: (syncStatus) => {
        set({ syncStatus });
      },

      clearSyncQueue: (processedIds) => {
        set((state) => {
          if (!processedIds) {
            return { syncQueue: [] };
          }
          const idSet = new Set(processedIds);
          return { syncQueue: state.syncQueue.filter((item) => !idSet.has(item.id)) };
        });
      },

      loadDemoData: (anchorDate) => {
        const demo = buildDemoDataset(anchorDate);
        set({
          ...demo,
          syncQueue: [],
          pendingApprovals: [],
          alertQueue: [],
          syncStatus: 'local',
        });
      },

      clearAllData: () => {
        set({
          ...createEmptyInitialData(),
          syncQueue: [],
          pendingApprovals: [],
          alertQueue: [],
          lastSyncedAt: null,
          syncStatus: 'local',
        });
      },

      restoreFromBackup: (backup, mode) => {
        const nowIso = new Date().toISOString();
        set((state) => {
          const syncOps: Array<{
            entity: SyncEntityName;
            recordId: string;
            op: 'upsert' | 'delete';
            updatedAt: string;
          }> = [];

          if (mode === 'merge') {
            const accounts = mergeLwwEntities(state.accounts, backup.accounts);
            const categories = mergeLwwEntities(state.categories, backup.categories);
            const transactions = mergeLwwEntities(state.transactions, backup.transactions);
            const installmentPlans = mergeLwwEntities(
              state.installmentPlans,
              backup.installmentPlans,
            );
            const recurringRules = mergeLwwEntities(state.recurringRules, backup.recurringRules);
            const budgets = mergeLwwEntities(state.budgets, backup.budgets);
            const savingsGoals = mergeLwwEntities(state.savingsGoals, backup.savingsGoals);
            const debts = mergeLwwEntities(state.debts, backup.debts);

            const rateMap = new Map(state.exchangeRates.map((r) => [r.currencyCode, r]));
            for (const rate of backup.exchangeRates) {
              const existing = rateMap.get(rate.currencyCode);
              if (!existing || rate.updatedAt > existing.updatedAt) {
                rateMap.set(rate.currencyCode, rate);
              }
            }

            const pushUpserts = (entity: SyncEntityName, list: Array<{ id: string; isDemo?: boolean }>) => {
              for (const item of list) {
                if (!item.isDemo) {
                  syncOps.push({ entity, recordId: item.id, op: 'upsert', updatedAt: nowIso });
                }
              }
            };
            pushUpserts('accounts', backup.accounts);
            pushUpserts('categories', backup.categories);
            pushUpserts('transactions', backup.transactions);
            pushUpserts('installment_plans', backup.installmentPlans);
            pushUpserts('recurring_rules', backup.recurringRules);
            pushUpserts('budgets', backup.budgets);
            pushUpserts('savings_goals', backup.savingsGoals);
            pushUpserts('debts', backup.debts);

            return {
              accounts,
              categories,
              transactions,
              installmentPlans,
              recurringRules,
              budgets,
              savingsGoals,
              debts,
              exchangeRates: Array.from(rateMap.values()),
              syncQueue: enqueueSyncOps(state.syncQueue, syncOps),
            };
          }

          // 'replace' mode: soft-delete missing local records so cloud tombstones propagate
          const replaceCollection = <T extends { id: string; deletedAt: string | null; updatedAt: string; isDemo?: boolean }>(
            entity: SyncEntityName,
            current: T[],
            incoming: T[],
          ): T[] => {
            const incomingIds = new Set(incoming.map((item) => item.id));
            const tombstones: T[] = [];

            for (const existing of current) {
              if (!incomingIds.has(existing.id)) {
                if (existing.deletedAt === null) {
                  tombstones.push({ ...existing, deletedAt: nowIso, updatedAt: nowIso });
                  if (!existing.isDemo) {
                    syncOps.push({
                      entity,
                      recordId: existing.id,
                      op: 'delete',
                      updatedAt: nowIso,
                    });
                  }
                } else {
                  tombstones.push(existing);
                }
              }
            }

            for (const item of incoming) {
              if (!item.isDemo) {
                syncOps.push({
                  entity,
                  recordId: item.id,
                  op: item.deletedAt ? 'delete' : 'upsert',
                  updatedAt: nowIso,
                });
              }
            }

            return [...incoming, ...tombstones];
          };

          const accounts = replaceCollection('accounts', state.accounts, backup.accounts);
          const categories = replaceCollection('categories', state.categories, backup.categories);
          const transactions = replaceCollection(
            'transactions',
            state.transactions,
            backup.transactions,
          );
          const installmentPlans = replaceCollection(
            'installment_plans',
            state.installmentPlans,
            backup.installmentPlans,
          );
          const recurringRules = replaceCollection(
            'recurring_rules',
            state.recurringRules,
            backup.recurringRules,
          );
          const budgets = replaceCollection('budgets', state.budgets, backup.budgets);
          const savingsGoals = replaceCollection(
            'savings_goals',
            state.savingsGoals,
            backup.savingsGoals,
          );
          const debts = replaceCollection('debts', state.debts, backup.debts);

          return {
            accounts,
            categories,
            transactions,
            installmentPlans,
            recurringRules,
            budgets,
            savingsGoals,
            debts,
            exchangeRates:
              backup.exchangeRates.length > 0 ? backup.exchangeRates : state.exchangeRates,
            settings: { ...DEFAULT_SETTINGS, ...backup.settings },
            pendingApprovals: [],
            syncQueue: enqueueSyncOps(state.syncQueue, syncOps),
          };
        });
      },

      applyCloudState: (cloudState) => {
        set({
          ...cloudState,
          syncQueue: [],
          pendingApprovals: [],
          lastSyncedAt: new Date().toISOString(),
          syncStatus: 'synced',
        });
      },

      clearUserLocalDataOnSignOut: () => {
        set({
          ...createEmptyInitialData(),
          syncQueue: [],
          pendingApprovals: [],
          alertQueue: [],
          lastSyncedAt: null,
          syncStatus: 'local',
        });
      },

      getDataSnapshot: () => {
        const state = get();
        return {
          accounts: state.accounts,
          categories: state.categories,
          transactions: state.transactions,
          installmentPlans: state.installmentPlans,
          recurringRules: state.recurringRules,
          budgets: state.budgets,
          savingsGoals: state.savingsGoals,
          debts: state.debts,
          exchangeRates: state.exchangeRates,
          settings: state.settings,
        };
      },
    }),
    {
      name: 'butce-pro-finance-store-v1',
      storage: createJSONStorage(() => safeAsyncStorage),
      partialize: (state) => ({
        accounts: state.accounts,
        categories: state.categories,
        transactions: state.transactions,
        installmentPlans: state.installmentPlans,
        recurringRules: state.recurringRules,
        budgets: state.budgets,
        savingsGoals: state.savingsGoals,
        debts: state.debts,
        exchangeRates: state.exchangeRates,
        settings: state.settings,
        syncQueue: state.syncQueue,
        pendingApprovals: state.pendingApprovals,
        lastSyncedAt: state.lastSyncedAt,
      }),
      onRehydrateStorage: () => () => {
        useFinanceStore.setState({ hasHydrated: true });
      },
    },
  ),
);
