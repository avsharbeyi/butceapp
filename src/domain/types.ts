export type CurrencyCode = 'TRY' | 'USD' | 'EUR' | 'GBP' | 'XAU';

export type AccountType = 'cash' | 'bank' | 'credit_card' | 'investment';

export type TransactionType = 'income' | 'expense' | 'transfer';

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type PeriodType = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface BaseEntity {
  id: string;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isDemo?: boolean;
}

export interface Account extends BaseEntity {
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  initialBalance: number;
  creditLimit?: number | null;
  statementDay?: number | null;
  dueDay?: number | null;
  color: string;
  icon: string;
  isArchived: boolean;
}

export interface Category extends BaseEntity {
  name: string;
  type: 'income' | 'expense';
  icon: string;
  color: string;
  isDefault: boolean;
  sortOrder: number;
}

export interface Transaction extends BaseEntity {
  type: TransactionType;
  amount: number;
  currency: CurrencyCode;
  exchangeRateToBase: number;
  baseAmount: number;
  accountId: string;
  toAccountId?: string | null;
  toAmount?: number | null;
  categoryId?: string | null;
  date: string;
  note?: string;
  tags: string[];
  receiptUri?: string | null;
  installmentPlanId?: string | null;
  installmentNumber?: number | null;
  recurringRuleId?: string | null;
  debtId?: string | null;
  goalId?: string | null;
}

export interface InstallmentPlan extends BaseEntity {
  title: string;
  accountId: string;
  categoryId: string;
  totalAmount: number;
  currency: CurrencyCode;
  installmentCount: number;
  startDate: string;
  note?: string;
}

export interface RecurringRule extends BaseEntity {
  title: string;
  type: 'income' | 'expense';
  amount: number;
  currency: CurrencyCode;
  accountId: string;
  categoryId: string;
  frequency: Frequency;
  nextRunDate: string;
  autoCreate: boolean;
  remindDaysBefore: number;
  isActive: boolean;
}

export interface Budget extends BaseEntity {
  categoryId: string | null;
  month: string;
  limitAmount: number;
  currency: CurrencyCode;
  alert80Sent: boolean;
  alert100Sent: boolean;
}

export interface SavingsGoal extends BaseEntity {
  name: string;
  targetAmount: number;
  currentAmount: number;
  currency: CurrencyCode;
  targetDate?: string | null;
  icon: string;
  color: string;
  isCompleted: boolean;
}

export interface Debt extends BaseEntity {
  personName: string;
  direction: 'owed_by_me' | 'owed_to_me';
  totalAmount: number;
  paidAmount: number;
  currency: CurrencyCode;
  dueDate?: string | null;
  note?: string;
  isSettled: boolean;
}

export interface ExchangeRate {
  currencyCode: CurrencyCode;
  rateToTry: number;
  source: 'auto' | 'manual';
  updatedAt: string;
}

export interface UserSettings {
  baseCurrency: CurrencyCode;
  theme: ThemeMode;
  privacyMode: boolean;
  appLockEnabled: boolean;
  notificationsEnabled: boolean;
  monthStartDay: number;
}

export type SyncEntityName =
  | 'accounts'
  | 'categories'
  | 'transactions'
  | 'installment_plans'
  | 'recurring_rules'
  | 'budgets'
  | 'savings_goals'
  | 'debts'
  | 'user_settings';

export interface SyncQueueItem {
  id: string;
  entity: SyncEntityName;
  recordId: string;
  op: 'upsert' | 'delete';
  updatedAt: string;
}

export interface PeriodKPIs {
  totalIncome: number;
  totalExpense: number;
  netCashFlow: number;
  savingsRate: number;
  dailyAverageExpense: number;
  incomeDeltaPct: number;
  expenseDeltaPct: number;
  netDeltaPct: number;
}

export interface CategoryBreakdownItem {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  amount: number;
  sharePct: number;
  count: number;
}

export interface CategoryMover {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  currentAmount: number;
  previousAmount: number;
  deltaAmount: number;
  deltaPct: number;
}

export interface BudgetProgressItem {
  budget: Budget;
  categoryName: string;
  categoryColor: string;
  spent: number;
  limit: number;
  pct: number;
  status: 'ok' | 'warning' | 'exceeded';
}

export interface SharedReportTransaction {
  id: string;
  date: string;
  type: TransactionType;
  categoryName: string;
  baseAmount: number;
  currency: CurrencyCode;
  note?: string;
  tags?: string[];
}

export interface ReportSnapshot {
  title: string;
  periodType: PeriodType;
  range: DateRange;
  baseCurrency: CurrencyCode;
  includeTransactions: boolean;
  includeNotes: boolean;
  kpis: PeriodKPIs;
  incomeExpenseSeries: Array<{
    key: string;
    label: string;
    income: number;
    expense: number;
    net: number;
  }>;
  cumulativeCashFlowSeries: Array<{
    key: string;
    label: string;
    cumulativeNet: number;
  }>;
  expenseBreakdown: CategoryBreakdownItem[];
  incomeBreakdown: CategoryBreakdownItem[];
  budgetProgress: BudgetProgressItem[];
  transactions: SharedReportTransaction[];
  generatedAt: string;
}

export interface SharedReport extends BaseEntity {
  shareToken: string;
  title: string;
  periodType: PeriodType;
  startDate: string;
  endDate: string;
  includeTransactions: boolean;
  includeNotes: boolean;
  snapshotJson: ReportSnapshot;
  expiresAt: string | null;
  isRevoked: boolean;
  viewCount: number;
}

export interface FinanceDataSnapshot {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  installmentPlans: InstallmentPlan[];
  recurringRules: RecurringRule[];
  budgets: Budget[];
  savingsGoals: SavingsGoal[];
  debts: Debt[];
  exchangeRates: ExchangeRate[];
  settings: UserSettings;
}
