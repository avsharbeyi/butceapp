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
  Transaction,
  UserSettings,
} from '@/domain/types';

export type SnakeRow = Record<string, unknown>;

function compareIsoUpdatedAt(a: string, b: string): number {
  const aMs = Date.parse(a);
  const bMs = Date.parse(b);
  if (Number.isFinite(aMs) && Number.isFinite(bMs)) {
    if (aMs !== bMs) {
      return aMs - bMs;
    }
    return 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

function pickNewerLww<T extends { updatedAt: string }>(localItem: T, remoteItem: T): T {
  return compareIsoUpdatedAt(localItem.updatedAt, remoteItem.updatedAt) > 0
    ? localItem
    : remoteItem;
}

function stripDemo<T extends { isDemo?: boolean }>(items: T[]): T[] {
  return items.filter((item) => item.isDemo !== true);
}

function normalizeCategoryKey(category: Pick<Category, 'name' | 'type'>): string {
  return `${category.name.trim().toLocaleLowerCase('tr-TR')}|${category.type}`;
}

/**
 * Deduplicates local categories against remote categories using normalized Turkish
 * `name + '|' + type`, preserving remote IDs and returning an `idRemap` for local foreign keys.
 */
export function deduplicateCategoriesByNameType(
  local: Category[],
  remote: Category[],
): { merged: Category[]; idRemap: Record<string, string> } {
  const idRemap: Record<string, string> = {};
  const mergedById = new Map<string, Category>();
  const canonicalByKey = new Map<string, Category>();

  for (const rCat of remote) {
    mergedById.set(rCat.id, rCat);
    const key = normalizeCategoryKey(rCat);
    const existing = canonicalByKey.get(key);
    if (!existing || (existing.deletedAt !== null && rCat.deletedAt === null)) {
      canonicalByKey.set(key, rCat);
    }
  }

  for (const lCat of local) {
    const sameIdRemote = mergedById.get(lCat.id);
    if (sameIdRemote) {
      const winner = pickNewerLww(lCat, sameIdRemote);
      mergedById.set(lCat.id, winner);
      const key = normalizeCategoryKey(winner);
      const existingCanon = canonicalByKey.get(key);
      if (!existingCanon || existingCanon.id === winner.id) {
        canonicalByKey.set(key, winner);
      }
      continue;
    }

    const key = normalizeCategoryKey(lCat);
    const matchingRemote = canonicalByKey.get(key);

    if (matchingRemote && (matchingRemote.deletedAt === null || lCat.deletedAt !== null)) {
      if (lCat.id !== matchingRemote.id) {
        idRemap[lCat.id] = matchingRemote.id;
      }
      continue;
    }

    mergedById.set(lCat.id, lCat);
    if (!matchingRemote || (matchingRemote.deletedAt !== null && lCat.deletedAt === null)) {
      canonicalByKey.set(key, lCat);
    }
  }

  return {
    merged: Array.from(mergedById.values()),
    idRemap,
  };
}

/**
 * Resolves conflicts between local and remote entity lists strictly by latest `updatedAt`,
 * preserving soft-delete tombstones (`deletedAt !== null`).
 */
export function mergeLwwEntities<T extends { id: string; updatedAt: string }>(
  local: T[],
  remote: T[],
): T[] {
  const byId = new Map<string, T>();

  for (const item of remote) {
    byId.set(item.id, item);
  }

  for (const item of local) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
    } else {
      byId.set(item.id, pickNewerLww(item, existing));
    }
  }

  return Array.from(byId.values());
}

function mergeBudgetsDeduplicated(local: Budget[], remote: Budget[]): Budget[] {
  const lwwMerged = mergeLwwEntities(local, remote);
  const remoteActiveIdByKey = new Map<string, string>();
  for (const budget of remote) {
    if (budget.deletedAt === null) {
      const key = `${budget.categoryId ?? 'general'}|${budget.month}`;
      if (!remoteActiveIdByKey.has(key)) {
        remoteActiveIdByKey.set(key, budget.id);
      }
    }
  }

  const activeByKey = new Map<string, Budget>();
  const tombstones: Budget[] = [];

  for (const budget of lwwMerged) {
    if (budget.deletedAt !== null) {
      tombstones.push(budget);
      continue;
    }
    const key = `${budget.categoryId ?? 'general'}|${budget.month}`;
    const existing = activeByKey.get(key);
    const winner = existing ? pickNewerLww(budget, existing) : budget;
    const canonicalRemoteId = remoteActiveIdByKey.get(key);
    activeByKey.set(
      key,
      canonicalRemoteId && winner.id !== canonicalRemoteId
        ? { ...winner, id: canonicalRemoteId }
        : winner,
    );
  }

  return [...Array.from(activeByKey.values()), ...tombstones];
}

function mergeExchangeRates(local: ExchangeRate[], remote: ExchangeRate[]): ExchangeRate[] {
  const byCode = new Map<CurrencyCode, ExchangeRate>();
  for (const rate of remote) {
    byCode.set(rate.currencyCode, rate);
  }
  for (const rate of local) {
    const existing = byCode.get(rate.currencyCode);
    if (!existing) {
      byCode.set(rate.currencyCode, rate);
    } else {
      byCode.set(rate.currencyCode, pickNewerLww(rate, existing));
    }
  }
  return Array.from(byCode.values());
}

function diffForUpload<T extends { id: string; updatedAt: string }>(
  merged: T[],
  remote: T[],
): T[] {
  const remoteById = new Map<string, T>();
  for (const item of remote) {
    remoteById.set(item.id, item);
  }

  return merged.filter((item) => {
    const remoteItem = remoteById.get(item.id);
    if (!remoteItem) {
      return true;
    }
    return compareIsoUpdatedAt(item.updatedAt, remoteItem.updatedAt) > 0;
  });
}

function remapCategoryId(
  categoryId: string | null | undefined,
  idRemap: Record<string, string>,
): string | null {
  if (!categoryId) {
    return categoryId ?? null;
  }
  return idRemap[categoryId] ?? categoryId;
}

/**
 * Merges local data into remote cloud state while isolating demo records (`isDemo: true`),
 * deduplicating categories by `name + type`, and remapping local real foreign keys.
 */
export function mergeLocalIntoCloud(
  localState: FinanceDataSnapshot,
  remoteState: FinanceDataSnapshot,
  mode: 'merge' | 'cloud_only',
): { nextState: FinanceDataSnapshot; toUpload: FinanceDataSnapshot } {
  const cleanRemote: FinanceDataSnapshot = {
    accounts: stripDemo(remoteState.accounts),
    categories: stripDemo(remoteState.categories),
    transactions: stripDemo(remoteState.transactions),
    installmentPlans: stripDemo(remoteState.installmentPlans),
    recurringRules: stripDemo(remoteState.recurringRules),
    budgets: stripDemo(remoteState.budgets),
    savingsGoals: stripDemo(remoteState.savingsGoals),
    debts: stripDemo(remoteState.debts),
    exchangeRates: remoteState.exchangeRates,
    settings: remoteState.settings,
  };

  if (mode === 'cloud_only') {
    return {
      nextState: cleanRemote,
      toUpload: {
        accounts: [],
        categories: [],
        transactions: [],
        installmentPlans: [],
        recurringRules: [],
        budgets: [],
        savingsGoals: [],
        debts: [],
        exchangeRates: [],
        settings: cleanRemote.settings,
      },
    };
  }

  const cleanLocal: FinanceDataSnapshot = {
    accounts: stripDemo(localState.accounts),
    categories: stripDemo(localState.categories),
    transactions: stripDemo(localState.transactions),
    installmentPlans: stripDemo(localState.installmentPlans),
    recurringRules: stripDemo(localState.recurringRules),
    budgets: stripDemo(localState.budgets),
    savingsGoals: stripDemo(localState.savingsGoals),
    debts: stripDemo(localState.debts),
    exchangeRates: localState.exchangeRates,
    settings: localState.settings,
  };

  const { merged: categories, idRemap } = deduplicateCategoriesByNameType(
    cleanLocal.categories,
    cleanRemote.categories,
  );

  const remappedLocalTransactions = cleanLocal.transactions.map((tx) => ({
    ...tx,
    categoryId: remapCategoryId(tx.categoryId, idRemap),
  }));

  const remappedLocalBudgets = cleanLocal.budgets.map((budget) => ({
    ...budget,
    categoryId: remapCategoryId(budget.categoryId, idRemap),
  }));

  const remappedLocalPlans = cleanLocal.installmentPlans.map((plan) => ({
    ...plan,
    categoryId: remapCategoryId(plan.categoryId, idRemap) ?? plan.categoryId,
  }));

  const remappedLocalRules = cleanLocal.recurringRules.map((rule) => ({
    ...rule,
    categoryId: remapCategoryId(rule.categoryId, idRemap) ?? rule.categoryId,
  }));

  const accounts = mergeLwwEntities(cleanLocal.accounts, cleanRemote.accounts);
  const transactions = mergeLwwEntities(remappedLocalTransactions, cleanRemote.transactions);
  const installmentPlans = mergeLwwEntities(remappedLocalPlans, cleanRemote.installmentPlans);
  const recurringRules = mergeLwwEntities(remappedLocalRules, cleanRemote.recurringRules);
  const budgets = mergeBudgetsDeduplicated(remappedLocalBudgets, cleanRemote.budgets);
  const savingsGoals = mergeLwwEntities(cleanLocal.savingsGoals, cleanRemote.savingsGoals);
  const debts = mergeLwwEntities(cleanLocal.debts, cleanRemote.debts);
  const exchangeRates = mergeExchangeRates(cleanLocal.exchangeRates, cleanRemote.exchangeRates);

  const nextState: FinanceDataSnapshot = {
    accounts,
    categories,
    transactions,
    installmentPlans,
    recurringRules,
    budgets,
    savingsGoals,
    debts,
    exchangeRates,
    settings: cleanRemote.settings ?? cleanLocal.settings,
  };

  const remoteRateByCode = new Map(cleanRemote.exchangeRates.map((r) => [r.currencyCode, r]));
  const ratesToUpload = exchangeRates.filter((rate) => {
    const remoteRate = remoteRateByCode.get(rate.currencyCode);
    if (!remoteRate) {
      return true;
    }
    return compareIsoUpdatedAt(rate.updatedAt, remoteRate.updatedAt) > 0;
  });

  const toUpload: FinanceDataSnapshot = {
    accounts: diffForUpload(accounts, cleanRemote.accounts),
    categories: diffForUpload(categories, cleanRemote.categories),
    transactions: diffForUpload(transactions, cleanRemote.transactions),
    installmentPlans: diffForUpload(installmentPlans, cleanRemote.installmentPlans),
    recurringRules: diffForUpload(recurringRules, cleanRemote.recurringRules),
    budgets: diffForUpload(budgets, cleanRemote.budgets),
    savingsGoals: diffForUpload(savingsGoals, cleanRemote.savingsGoals),
    debts: diffForUpload(debts, cleanRemote.debts),
    exchangeRates: ratesToUpload,
    settings: nextState.settings,
  };

  return { nextState, toUpload };
}

// ============================================================================
// Explicit camelCase <-> snake_case Supabase row mappers (Pre-Flight Ruling 2)
// ============================================================================

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = asNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function toSnakeAccountRow(account: Account, userId: string): SnakeRow {
  return {
    id: account.id,
    user_id: userId,
    name: account.name,
    type: account.type,
    currency: account.currency,
    initial_balance: account.initialBalance,
    credit_limit: account.creditLimit ?? null,
    statement_day: account.statementDay ?? null,
    due_day: account.dueDay ?? null,
    color: account.color,
    icon: account.icon,
    is_archived: account.isArchived,
    created_at: account.createdAt,
    updated_at: account.updatedAt,
    deleted_at: account.deletedAt,
  };
}

export function fromSnakeAccountRow(row: SnakeRow): Account {
  return {
    id: asString(row.id),
    userId: asNullableString(row.user_id),
    name: asString(row.name),
    type: asString(row.type, 'bank') as Account['type'],
    currency: asString(row.currency, 'TRY') as CurrencyCode,
    initialBalance: asNumber(row.initial_balance),
    creditLimit: asNullableNumber(row.credit_limit),
    statementDay: asNullableNumber(row.statement_day),
    dueDay: asNullableNumber(row.due_day),
    color: asString(row.color, '#3B82F6'),
    icon: asString(row.icon, 'wallet'),
    isArchived: asBoolean(row.is_archived, false),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at),
  };
}

export function toSnakeCategoryRow(category: Category, userId: string): SnakeRow {
  return {
    id: category.id,
    user_id: userId,
    name: category.name,
    type: category.type,
    icon: category.icon,
    color: category.color,
    is_default: category.isDefault,
    sort_order: category.sortOrder,
    created_at: category.createdAt,
    updated_at: category.updatedAt,
    deleted_at: category.deletedAt,
  };
}

export function fromSnakeCategoryRow(row: SnakeRow): Category {
  return {
    id: asString(row.id),
    userId: asNullableString(row.user_id),
    name: asString(row.name),
    type: asString(row.type, 'expense') as Category['type'],
    icon: asString(row.icon, 'tag'),
    color: asString(row.color, '#64748B'),
    isDefault: asBoolean(row.is_default, false),
    sortOrder: asNumber(row.sort_order, 0),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at),
  };
}

export function toSnakeTransactionRow(tx: Transaction, userId: string): SnakeRow {
  return {
    id: tx.id,
    user_id: userId,
    type: tx.type,
    amount: tx.amount,
    currency: tx.currency,
    exchange_rate_to_base: tx.exchangeRateToBase,
    base_amount: tx.baseAmount,
    account_id: tx.accountId ? tx.accountId : null,
    to_account_id: tx.toAccountId ? tx.toAccountId : null,
    to_amount: tx.toAmount ?? null,
    category_id: tx.categoryId ?? null,
    date: tx.date,
    note: tx.note ?? null,
    tags: tx.tags,
    receipt_uri: tx.receiptUri ?? null,
    installment_plan_id: tx.installmentPlanId ?? null,
    installment_number: tx.installmentNumber ?? null,
    recurring_rule_id: tx.recurringRuleId ?? null,
    debt_id: tx.debtId ?? null,
    goal_id: tx.goalId ?? null,
    created_at: tx.createdAt,
    updated_at: tx.updatedAt,
    deleted_at: tx.deletedAt,
  };
}

export function fromSnakeTransactionRow(row: SnakeRow): Transaction {
  return {
    id: asString(row.id),
    userId: asNullableString(row.user_id),
    type: asString(row.type, 'expense') as Transaction['type'],
    amount: asNumber(row.amount),
    currency: asString(row.currency, 'TRY') as CurrencyCode,
    exchangeRateToBase: asNumber(row.exchange_rate_to_base, 1),
    baseAmount: asNumber(row.base_amount),
    accountId: asNullableString(row.account_id) ?? '',
    toAccountId: asNullableString(row.to_account_id),
    toAmount: asNullableNumber(row.to_amount),
    categoryId: asNullableString(row.category_id),
    date: asString(row.date),
    note: typeof row.note === 'string' ? row.note : undefined,
    tags: asStringArray(row.tags),
    receiptUri: asNullableString(row.receipt_uri),
    installmentPlanId: asNullableString(row.installment_plan_id),
    installmentNumber: asNullableNumber(row.installment_number),
    recurringRuleId: asNullableString(row.recurring_rule_id),
    debtId: asNullableString(row.debt_id),
    goalId: asNullableString(row.goal_id),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at),
  };
}

export function toSnakeInstallmentPlanRow(plan: InstallmentPlan, userId: string): SnakeRow {
  return {
    id: plan.id,
    user_id: userId,
    title: plan.title,
    account_id: plan.accountId,
    category_id: plan.categoryId,
    total_amount: plan.totalAmount,
    currency: plan.currency,
    installment_count: plan.installmentCount,
    start_date: plan.startDate,
    note: plan.note ?? null,
    created_at: plan.createdAt,
    updated_at: plan.updatedAt,
    deleted_at: plan.deletedAt,
  };
}

export function fromSnakeInstallmentPlanRow(row: SnakeRow): InstallmentPlan {
  return {
    id: asString(row.id),
    userId: asNullableString(row.user_id),
    title: asString(row.title),
    accountId: asString(row.account_id),
    categoryId: asString(row.category_id),
    totalAmount: asNumber(row.total_amount),
    currency: asString(row.currency, 'TRY') as CurrencyCode,
    installmentCount: asNumber(row.installment_count, 2),
    startDate: asString(row.start_date),
    note: typeof row.note === 'string' ? row.note : undefined,
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at),
  };
}

export function toSnakeRecurringRuleRow(rule: RecurringRule, userId: string): SnakeRow {
  return {
    id: rule.id,
    user_id: userId,
    title: rule.title,
    type: rule.type,
    amount: rule.amount,
    currency: rule.currency,
    account_id: rule.accountId,
    category_id: rule.categoryId,
    frequency: rule.frequency,
    next_run_date: rule.nextRunDate,
    auto_create: rule.autoCreate,
    remind_days_before: rule.remindDaysBefore,
    is_active: rule.isActive,
    created_at: rule.createdAt,
    updated_at: rule.updatedAt,
    deleted_at: rule.deletedAt,
  };
}

export function fromSnakeRecurringRuleRow(row: SnakeRow): RecurringRule {
  return {
    id: asString(row.id),
    userId: asNullableString(row.user_id),
    title: asString(row.title),
    type: asString(row.type, 'expense') as RecurringRule['type'],
    amount: asNumber(row.amount),
    currency: asString(row.currency, 'TRY') as CurrencyCode,
    accountId: asString(row.account_id),
    categoryId: asString(row.category_id),
    frequency: asString(row.frequency, 'monthly') as RecurringRule['frequency'],
    nextRunDate: asString(row.next_run_date),
    autoCreate: asBoolean(row.auto_create, true),
    remindDaysBefore: asNumber(row.remind_days_before, 2),
    isActive: asBoolean(row.is_active, true),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at),
  };
}

export function toSnakeBudgetRow(budget: Budget, userId: string): SnakeRow {
  return {
    id: budget.id,
    user_id: userId,
    category_id: budget.categoryId ?? null,
    month: budget.month,
    limit_amount: budget.limitAmount,
    currency: budget.currency,
    alert_80_sent: budget.alert80Sent,
    alert_100_sent: budget.alert100Sent,
    created_at: budget.createdAt,
    updated_at: budget.updatedAt,
    deleted_at: budget.deletedAt,
  };
}

export function fromSnakeBudgetRow(row: SnakeRow): Budget {
  return {
    id: asString(row.id),
    userId: asNullableString(row.user_id),
    categoryId: asNullableString(row.category_id),
    month: asString(row.month),
    limitAmount: asNumber(row.limit_amount),
    currency: asString(row.currency, 'TRY') as CurrencyCode,
    alert80Sent: asBoolean(row.alert_80_sent, false),
    alert100Sent: asBoolean(row.alert_100_sent, false),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at),
  };
}

export function toSnakeSavingsGoalRow(goal: SavingsGoal, userId: string): SnakeRow {
  return {
    id: goal.id,
    user_id: userId,
    name: goal.name,
    target_amount: goal.targetAmount,
    current_amount: goal.currentAmount,
    currency: goal.currency,
    target_date: goal.targetDate ?? null,
    icon: goal.icon,
    color: goal.color,
    is_completed: goal.isCompleted,
    created_at: goal.createdAt,
    updated_at: goal.updatedAt,
    deleted_at: goal.deletedAt,
  };
}

export function fromSnakeSavingsGoalRow(row: SnakeRow): SavingsGoal {
  return {
    id: asString(row.id),
    userId: asNullableString(row.user_id),
    name: asString(row.name),
    targetAmount: asNumber(row.target_amount),
    currentAmount: asNumber(row.current_amount),
    currency: asString(row.currency, 'TRY') as CurrencyCode,
    targetDate: asNullableString(row.target_date),
    icon: asString(row.icon, 'piggy-bank'),
    color: asString(row.color, '#10B981'),
    isCompleted: asBoolean(row.is_completed, false),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at),
  };
}

export function toSnakeDebtRow(debt: Debt, userId: string): SnakeRow {
  return {
    id: debt.id,
    user_id: userId,
    person_name: debt.personName,
    direction: debt.direction,
    total_amount: debt.totalAmount,
    paid_amount: debt.paidAmount,
    currency: debt.currency,
    due_date: debt.dueDate ?? null,
    note: debt.note ?? null,
    is_settled: debt.isSettled,
    created_at: debt.createdAt,
    updated_at: debt.updatedAt,
    deleted_at: debt.deletedAt,
  };
}

export function fromSnakeDebtRow(row: SnakeRow): Debt {
  return {
    id: asString(row.id),
    userId: asNullableString(row.user_id),
    personName: asString(row.person_name),
    direction: asString(row.direction, 'owed_by_me') as Debt['direction'],
    totalAmount: asNumber(row.total_amount),
    paidAmount: asNumber(row.paid_amount),
    currency: asString(row.currency, 'TRY') as CurrencyCode,
    dueDate: asNullableString(row.due_date),
    note: typeof row.note === 'string' ? row.note : undefined,
    isSettled: asBoolean(row.is_settled, false),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at),
  };
}

export function toSnakeUserSettingsRow(settings: UserSettings, userId: string): SnakeRow {
  return {
    user_id: userId,
    base_currency: settings.baseCurrency,
    theme: settings.theme,
    privacy_mode: settings.privacyMode,
    app_lock_enabled: settings.appLockEnabled,
    notifications_enabled: settings.notificationsEnabled,
    month_start_day: settings.monthStartDay,
  };
}

export function fromSnakeUserSettingsRow(row: SnakeRow): UserSettings {
  return {
    baseCurrency: asString(row.base_currency, 'TRY') as CurrencyCode,
    theme: asString(row.theme, 'system') as UserSettings['theme'],
    privacyMode: asBoolean(row.privacy_mode, false),
    appLockEnabled: asBoolean(row.app_lock_enabled, false),
    notificationsEnabled: asBoolean(row.notifications_enabled, true),
    monthStartDay: asNumber(row.month_start_day, 1),
  };
}

export function toSnakeExchangeRateRow(rate: ExchangeRate, userId: string): SnakeRow {
  return {
    user_id: userId,
    currency: rate.currencyCode,
    rate_to_try: rate.rateToTry,
    source: rate.source === 'manual' ? 'manual' : 'live',
    fetched_at: rate.updatedAt,
    updated_at: rate.updatedAt,
  };
}

export function fromSnakeExchangeRateRow(row: SnakeRow): ExchangeRate {
  return {
    currencyCode: asString(row.currency, 'TRY') as CurrencyCode,
    rateToTry: asNumber(row.rate_to_try, 1),
    source: row.source === 'manual' ? 'manual' : 'auto',
    updatedAt: asString(row.updated_at ?? row.fetched_at, new Date().toISOString()),
  };
}

/** Dispatches camelCase entity -> snake_case Supabase row conversion by table name. */
export function toSnakeRow(
  entity: SyncEntityName,
  record: unknown,
  userId: string,
): SnakeRow {
  switch (entity) {
    case 'accounts':
      return toSnakeAccountRow(record as Account, userId);
    case 'categories':
      return toSnakeCategoryRow(record as Category, userId);
    case 'transactions':
      return toSnakeTransactionRow(record as Transaction, userId);
    case 'installment_plans':
      return toSnakeInstallmentPlanRow(record as InstallmentPlan, userId);
    case 'recurring_rules':
      return toSnakeRecurringRuleRow(record as RecurringRule, userId);
    case 'budgets':
      return toSnakeBudgetRow(record as Budget, userId);
    case 'savings_goals':
      return toSnakeSavingsGoalRow(record as SavingsGoal, userId);
    case 'debts':
      return toSnakeDebtRow(record as Debt, userId);
    case 'user_settings':
      return toSnakeUserSettingsRow(record as UserSettings, userId);
  }
}

/** Dispatches snake_case Supabase row -> camelCase domain entity conversion by table name. */
export function fromSnakeRow(entity: SyncEntityName, row: SnakeRow): unknown {
  switch (entity) {
    case 'accounts':
      return fromSnakeAccountRow(row);
    case 'categories':
      return fromSnakeCategoryRow(row);
    case 'transactions':
      return fromSnakeTransactionRow(row);
    case 'installment_plans':
      return fromSnakeInstallmentPlanRow(row);
    case 'recurring_rules':
      return fromSnakeRecurringRuleRow(row);
    case 'budgets':
      return fromSnakeBudgetRow(row);
    case 'savings_goals':
      return fromSnakeSavingsGoalRow(row);
    case 'debts':
      return fromSnakeDebtRow(row);
    case 'user_settings':
      return fromSnakeUserSettingsRow(row);
  }
}
