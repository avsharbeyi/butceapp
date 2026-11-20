# Kişisel Finans ve Bütçe Yönetimi Mobil Uygulaması — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-platform (Android, iOS via Expo Go, and Web) Turkish personal finance mobile app with multi-account/credit-card/installment accounting, recurring rules, monthly budgets, savings goals, debts, multi-currency live FX, rich daily/weekly/monthly/yearly interactive SVG charts, PDF/CSV/JSON export, PIN/biometric lock, offline-first Supabase sync (Email+Password & Google Sign-In), and revocable read-only shareable financial report links.

**Architecture:** Offline-first React Native (Expo Router + TypeScript) app backed by a pure, deterministic domain engine (`src/domain/*`), a persisted Zustand store (`src/store/useFinanceStore.ts`), cross-platform SVG charts (`react-native-svg`), and an optional Supabase cloud backend (PostgreSQL + RLS + `get_shared_report` RPC + private `receipts` Storage). When `.env` credentials are absent, the app runs seamlessly in Local/Demo mode with zero crashes.

**Tech Stack:** Expo (SDK latest) + Expo Router + TypeScript, Zustand + `@react-native-async-storage/async-storage`, `react-native-svg`, `lucide-react-native`, `@supabase/supabase-js`, `expo-auth-session`, `expo-web-browser`, `expo-crypto`, `expo-secure-store`, `expo-local-authentication`, `expo-image-picker`, `expo-print`, `expo-sharing`, `expo-file-system`, `expo-notifications`, Vitest (unit tests).

**Spec:** `docs/superpowers/specs/2026-11-20-kisisel-finans-design.md`

## Global Constraints

- **Project root:** `C:\Users\Atmaca\.gemini\antigravity\scratch\butce-app` (Windows, Node v26, Git; run npm/npx via `npm.cmd` / `npx.cmd` in PowerShell).
- **Platforms:** Must run cleanly on Android Expo Go, iOS Expo Go, and Expo Web (`npx.cmd expo export --platform web` must succeed with zero errors). No Skia/native-only dependencies that break Expo Go or Web.
- **Language & locale:** 100% Turkish UI copy, `tr-TR` number/date formatting (`1.250,50 ₺`), default base currency `TRY`, supported currencies `TRY | USD | EUR | GBP | XAU`.
- **Accounting invariants (2A):** `Net Worth = (Cash + Bank + Investment) + Savings Goals - Credit Card Total Debt (including unmatured future installments)`. Personal debts (`owed_by_me` / `owed_to_me`) are displayed separately and excluded from Net Worth. Transfers (account-to-account, card bill payoff, goal deposits/withdrawals) NEVER count as Income or Expense.
- **Valuation:** Account balances and Net Worth use current/manual FX rates (mark-to-market); period Income/Expense reports use transaction-time `base_amount`.
- **Auth & Sharing:** Support Email+Password AND Google Sign-In (1B). Shared reports (`/shared/[token]`) expose ONLY filtered `snapshot_json` via `SECURITY DEFINER` RPC `get_shared_report(p_token)` — raw financial tables remain strictly private under RLS (`auth.uid() = user_id`).
- **Zero-config startup:** App must launch and work end-to-end in Local/Demo mode even when `.env` Supabase/Google keys are unset.

## Review Focus

1. **Month-end installment & recurring date clamping:** A 3-month installment or monthly recurring rule starting on `2026-01-31` must generate `2026-01-31`, `2026-02-28`, `2026-03-31` (or `2028-02-29` in a leap year), never overflowing February into March 3. *(Pinned in Task 2 & Task 3)*
2. **Multi-period catch-up on recurring rules:** When the app is unopened for 3 billing periods, `processDueRecurringRules` must emit all 3 missed occurrences up to `asOfDate` and advance `next_run_date` past `asOfDate` without skipping or looping infinitely. *(Pinned in Task 3)*
3. **Shared report privacy stripping:** `buildSharedReportSnapshot` must return an empty `transactions` array when `includeTransactions: false`, and must strip `note`, `tags`, and `receiptUri` from every shared transaction when `includeNotes: false`. *(Pinned in Task 4)*
4. **CSV UTF-8 BOM & formula-injection safety:** `generateTransactionsCsv` must prepend UTF-8 BOM (`\uFEFF`), properly quote Turkish notes containing commas/quotes/newlines, and neutralize leading `=`, `+`, `-`, `@` characters so Excel opens it cleanly and safely. *(Pinned in Task 5)*
5. **Demo isolation & category deduplication on cloud login:** `mergeLocalIntoCloud` must drop every record with `is_demo: true`, deduplicate default categories by `name + type` against cloud categories, and remap local real transactions/budgets/rules to the surviving cloud category IDs without orphaned foreign keys. *(Pinned in Task 5)*

---

## File Structure

- `package.json`, `tsconfig.json`, `app.json`, `vitest.config.ts`, `.env.example`, `.gitignore` — Expo Router + TypeScript + Vitest config
- `supabase/schema.sql`, `SUPABASE_SETUP.md` — Full PostgreSQL schema, RLS, `get_shared_report` RPC, Storage policies, Turkish setup guide
- `src/domain/types.ts` — All entity, report, filter, and sync TypeScript interfaces
- `src/domain/money.ts` — Integer-kuruş math, installment splitting, `tr-TR` formatting, privacy masking
- `src/domain/periods.ts` — Clamped month addition, fiscal month (`month_start_day`) ranges, period bucketing
- `src/domain/currency.ts` — Cross-rate conversion & default FX/gold rates
- `src/domain/defaults.ts` — Seed Turkish categories (7 income, 13 expense), default settings, rich demo dataset (`is_demo: true`)
- `src/domain/ledger.ts` — Account balances, credit card total debt/available limit/statement due, 2A Net Worth, installment builder, goal/debt recomputation
- `src/domain/recurring.ts` — Multi-period due rule scanner (auto-create + pending approval)
- `src/domain/analytics.ts` — KPIs, deltas, bar/area/donut/budget/calendar aggregations, EOM forecast, privacy-safe shared report snapshot builder
- `src/services/supabase.ts` — Null-safe Supabase client & config check
- `src/services/fxService.ts` — Live free FX/gold rate fetcher preserving manual overrides
- `src/services/syncEngine.ts` — Offline queue, push/pull LWW sync, demo-filtering cloud merge with category remap
- `src/services/exportService.ts` — CSV (UTF-8 BOM), HTML→PDF (`expo-print`/`window.print`), structured JSON backup & upsert/replace restore
- `src/services/authService.ts` — Email+Password + Google OAuth (`expo-auth-session`) + sign-out
- `src/services/sharedReportService.ts` — Create/list/revoke/fetch shared reports (Supabase RPC + local preview fallback)
- `src/services/securityService.ts` — SHA-256 PIN store & biometric authentication (web-safe)
- `src/services/notificationService.ts` — Local scheduled/immediate alerts (web-safe banner fallback)
- `src/store/useFinanceStore.ts` — Persisted Zustand store with optimistic CRUD, ledger reconciliation, budget 80%/100% triggers
- `src/theme/theme.ts` — Dark/Light fintech color tokens, typography, responsive layout helpers
- `src/components/ui/*` — `Card`, `MoneyText`, `SegmentedControl`, `Chip`, `EmptyState`, `ConfirmModal`, `LockScreenOverlay`
- `src/components/charts/*` — `IncomeExpenseBarChart`, `CashFlowAreaChart`, `CategoryDonutChart`, `BudgetProgressBars`, `SpendingCalendar`
- `src/components/QuickAddModal.tsx`, `src/components/ShareReportModal.tsx`
- `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/transactions.tsx`, `app/(tabs)/reports.tsx`, `app/(tabs)/plan.tsx`
- `app/plan/*.tsx` — `accounts`, `budgets`, `installments`, `recurring`, `goals`, `debts`, `shared-reports`, `rates`, `settings`
- `app/shared/[token].tsx` — Public, login-free, read-only shared report viewer

---

### Task 1: Project Scaffold, Tooling & Supabase Schema/Setup Docs

**Files:**
- Create: `package.json`, `app.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `.gitignore`
- Create: `supabase/schema.sql`
- Create: `SUPABASE_SETUP.md`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: Working Expo Router + TypeScript + Vitest workspace; SQL schema matching all 10 entities in spec §5.2 (`accounts`, `categories`, `transactions`, `installment_plans`, `recurring_rules`, `budgets`, `savings_goals`, `debts`, `shared_reports`, `user_settings`, plus `exchange_rates`), RLS policies (`auth.uid() = user_id`), private `receipts` bucket policies, and `get_shared_report(p_token text)` `SECURITY DEFINER` RPC returning `jsonb`.

- [ ] **Step 1: Initialize git repo and scaffold Expo TypeScript project**

Run in `C:\Users\Atmaca\.gemini\antigravity\scratch\butce-app`:
- Initialize git (`git init`) if not already initialized.
- Create Expo project files (`package.json`, `app.json` with scheme `"butceapp"`, web bundler `"metro"`, `plugins: ["expo-router"]`, `tsconfig.json` extending `expo/tsconfig.base` with `strict: true` and `@/*` path alias to `src/*`).
- Install runtime packages via `npx.cmd expo install`: `expo-router`, `expo-linking`, `expo-constants`, `expo-status-bar`, `react-native-safe-area-context`, `react-native-screens`, `react-native-svg`, `react-dom`, `react-native-web`, `@react-native-async-storage/async-storage`, `expo-secure-store`, `expo-local-authentication`, `expo-image-picker`, `expo-print`, `expo-sharing`, `expo-file-system`, `expo-notifications`, `expo-auth-session`, `expo-web-browser`, `expo-crypto`, `lucide-react-native`, `zustand`, `@supabase/supabase-js`.
- Install dev packages via `npm.cmd install -D`: `vitest`, `typescript`, `@types/react`.
- Configure `vitest.config.ts` with `@/` alias to `src/` and `test.environment: 'node'`.

- [ ] **Step 2: Create `.env.example`, `.gitignore`, `supabase/schema.sql`, and `SUPABASE_SETUP.md`**

- `.env.example`: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_WEB_BASE_URL`.
- `supabase/schema.sql`:
  - All tables from spec §5.2 with `NUMERIC(14, 2)` money fields, `uuid primary key`, `user_id uuid references auth.users(id)`, `created_at`, `updated_at`, `deleted_at` soft-delete columns, and indexes on `(user_id, updated_at)` and `(user_id, date)`.
  - `budgets` unique constraint on `(user_id, coalesce(category_id, '00000000-0000-0000-0000-000000000000'), month)` where `deleted_at IS NULL`.
  - Enable RLS on every table with `auth.uid() = user_id` policies for SELECT/INSERT/UPDATE/DELETE.
  - `shared_reports` table (RLS owner-only for direct table access) + `CREATE OR REPLACE FUNCTION public.get_shared_report(p_token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER` that increments `view_count`, checks `is_revoked = false` and `(expires_at IS NULL OR expires_at > now())`, and returns `{ title, period_type, start_date, end_date, snapshot_json, created_at, expires_at }` (or `NULL` if invalid/expired/revoked); grant `EXECUTE` to `anon, authenticated`.
  - Private `receipts` storage bucket + owner-only folder policy `(storage.foldername(name))[1] = auth.uid()::text`.
- `SUPABASE_SETUP.md`: Step-by-step Turkish guide covering Supabase project creation, running `supabase/schema.sql`, enabling Email+Password and Google OAuth (Google Cloud Client ID + Supabase Redirect URI for Expo Go & Web), copying keys into `.env`, and optional free Vercel/Netlify deployment for live `/shared/[token]` links.

- [ ] **Step 3: Write and run smoke test + typecheck**

Create `tests/smoke.test.ts` asserting `1 + 1 === 2`, run `npx.cmd vitest run` and `npx.cmd tsc --noEmit`.
Expected: PASS with 0 TS errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Expo TypeScript project, Vitest, and Supabase schema"
```

---

### Task 2: Domain Types, Money Arithmetic, Fiscal Periods, Currency & Defaults

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/money.ts`
- Create: `src/domain/periods.ts`
- Create: `src/domain/currency.ts`
- Create: `src/domain/defaults.ts`
- Test: `tests/domain/money-periods-currency.test.ts`

**Interfaces:**
- Produces:
  - Types in `src/domain/types.ts`: `CurrencyCode` (`'TRY' | 'USD' | 'EUR' | 'GBP' | 'XAU'`), `AccountType`, `TransactionType`, `Frequency`, `PeriodType`, `Account`, `Category`, `Transaction`, `InstallmentPlan`, `RecurringRule`, `Budget`, `SavingsGoal`, `Debt`, `SharedReport`, `ExchangeRate`, `UserSettings`, `SyncQueueItem`, `ReportSnapshot`, `DateRange`.
  - `src/domain/money.ts`: `toKurus(amount: number): number`, `fromKurus(kurus: number): number`, `roundMoney(amount: number): number`, `addMoney(a: number, b: number): number`, `subMoney(a: number, b: number): number`, `splitInstallmentAmounts(totalAmount: number, count: number): number[]`, `formatMoney(amount: number, currency: CurrencyCode, privacyMode?: boolean): string`, `formatPercent(ratio: number): string`.
  - `src/domain/periods.ts`: `addMonthsClamped(isoDate: string, months: number): string`, `getFiscalMonthRange(monthKey: string, monthStartDay: number): DateRange`, `getFiscalMonthKey(isoDate: string, monthStartDay: number): string`, `getPeriodRange(periodType: PeriodType, anchorDate: string, monthStartDay: number, customRange?: DateRange): DateRange`, `getPreviousPeriodRange(periodType: PeriodType, currentRange: DateRange, monthStartDay: number): DateRange`, `getBucketsForPeriod(periodType: PeriodType, range: DateRange): Array<{ key: string; label: string; startDate: string; endDate: string }>`.
  - `src/domain/currency.ts`: `DEFAULT_EXCHANGE_RATES: Record<CurrencyCode, number>`, `getRateToBase(from: CurrencyCode, base: CurrencyCode, rates: Record<CurrencyCode, number>): number`, `convertAmount(amount: number, from: CurrencyCode, to: CurrencyCode, rates: Record<CurrencyCode, number>): number`.
  - `src/domain/defaults.ts`: `DEFAULT_SETTINGS: UserSettings`, `createDefaultCategories(userId?: string | null): Category[]`, `buildDemoDataset(anchorDate?: string): DemoDataset`.

- [ ] **Step 1: Write failing tests in `tests/domain/money-periods-currency.test.ts`**

Include tests asserting:
- `splitInstallmentAmounts(100, 3)` returns `[33.34, 33.33, 33.33]` (exact remainder on first installment, sum equals `100.00`).
- `addMoney(0.1, 0.2)` returns `0.3` (no float drift).
- `formatMoney(1250.5, 'TRY')` formats `tr-TR` with `₺`; `formatMoney(1250.5, 'TRY', true)` returns `'•••• ₺'`.
- **Review Focus #1:** `addMonthsClamped('2026-01-31', 1)` returns `'2026-02-28'`, `addMonthsClamped('2026-01-31', 2)` returns `'2026-03-31'`, `addMonthsClamped('2028-01-31', 1)` returns `'2028-02-29'`.
- `getFiscalMonthRange('2026-11', 15)` returns `{ startDate: '2026-11-15', endDate: '2026-12-14' }`; `getFiscalMonthKey('2026-11-14', 15)` returns `'2026-10'`; `getFiscalMonthKey('2026-11-15', 15)` returns `'2026-11'`.
- `getPeriodRange('yearly', '2026-11-20', 15)` returns `{ startDate: '2026-01-01', endDate: '2026-12-31' }` (yearly ignores `month_start_day` per spec).
- `convertAmount(100, 'USD', 'EUR', { TRY: 1, USD: 40, EUR: 44, GBP: 50, XAU: 3500 })` returns `90.91`.
- `createDefaultCategories()` returns 7 income + 13 expense Turkish categories; `buildDemoDataset()` marks every entity `isDemo: true` with realistic accounts, installments, budgets, goals, debts, and transactions.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run tests/domain/money-periods-currency.test.ts`
Expected: FAIL with missing modules.

- [ ] **Step 3: Implement `types.ts`, `money.ts`, `periods.ts`, `currency.ts`, and `defaults.ts`**

Implement exact exported interfaces and pure functions. Keep all date calculations timezone-safe using `YYYY-MM-DD` integer parsing (`Date.UTC`) so local timezone offsets never shift a day.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx.cmd vitest run tests/domain/money-periods-currency.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain tests/domain/money-periods-currency.test.ts
git commit -m "feat(domain): add types, kurus money math, fiscal periods, currency, and demo defaults"
```

---

### Task 3: Accounting Ledger Engine & Recurring Rule Processor

**Files:**
- Create: `src/domain/ledger.ts`
- Create: `src/domain/recurring.ts`
- Test: `tests/domain/ledger-recurring.test.ts`

**Interfaces:**
- Consumes: `src/domain/types.ts`, `src/domain/money.ts`, `src/domain/periods.ts`, `src/domain/currency.ts`.
- Produces:
  - `src/domain/ledger.ts`:
    - `computeAccountBalance(account: Account, transactions: Transaction[], asOfDate: string): number`
    - `computeCreditCardSummary(account: Account, transactions: Transaction[], asOfDate: string): { totalDebt: number; availableLimit: number; statementDue: number; maturedDebt: number; statementStart: string; statementEnd: string; nextDueDate: string }`
    - `computeNetWorth(params: { accounts: Account[]; goals: SavingsGoal[]; debts: Debt[]; transactions: Transaction[]; rates: Record<CurrencyCode, number>; baseCurrency: CurrencyCode; asOfDate: string }): { netWorth: number; totalAssets: number; totalGoals: number; totalCardDebt: number; owedToMe: number; owedByMe: number; netDebtPosition: number }`
    - `buildInstallmentTransactions(plan: InstallmentPlan, rates: Record<CurrencyCode, number>, baseCurrency: CurrencyCode, userId?: string | null): Transaction[]`
    - `recomputeGoalAmount(goal: SavingsGoal, transactions: Transaction[]): number`
    - `recomputeDebtPaidAmount(debt: Debt, transactions: Transaction[]): number`
  - `src/domain/recurring.ts`:
    - `advanceRuleDate(isoDate: string, frequency: Frequency): string`
    - `processDueRecurringRules(rules: RecurringRule[], asOfDate: string, rates: Record<CurrencyCode, number>, baseCurrency: CurrencyCode): { createdTransactions: Transaction[]; pendingApprovals: Array<{ rule: RecurringRule; dueDate: string }>; updatedRules: RecurringRule[] }`

- [ ] **Step 1: Write failing tests in `tests/domain/ledger-recurring.test.ts`**

Include tests asserting:
- Normal account (`bank`) balance includes `initialBalance + income + incoming transfer - expense - outgoing transfer` for active (`!deletedAt`) transactions with `date <= asOfDate`; future transactions are excluded.
- **2A Credit card & Net Worth test:** Credit card with limit `50_000`, `statementDay: 15`, `dueDay: 25`, 3-month installment of `3_000` starting `2026-11-10` (3x `1_000` on `2026-11-10`, `2026-12-10`, `2027-01-10`), plus card payoff transfer of `400` on `2026-11-16`:
  - `totalDebt === 2_600`, `availableLimit === 47_400`, `statementDue === 600` (transactions in `(2026-10-15, 2026-11-15]` minus payment on `2026-11-16`), `maturedDebt === 600`.
  - `computeNetWorth` with Bank `10_000 TRY`, USD account `100 USD` (rate `40` → `4_000 TRY` mark-to-market), Goal `2_000 TRY`, Card `totalDebt: 2_600`, Debt `owed_by_me: 1_500`, Debt `owed_to_me: 500`: returns `netWorth === 13_400` (`10_000 + 4_000 + 2_000 - 2_600`), `owedByMe === 1_500`, `owedToMe === 500`, `netDebtPosition === -1_000`.
- **Goal & Debt recomputation:** Transfer with `goalId` adds to goal without affecting expenses; deleting/editing that transaction updates `recomputeGoalAmount` deterministically. Same for `recomputeDebtPaidAmount` on `debtId` transactions.
- **Review Focus #1 (Installment month-end):** `buildInstallmentTransactions` starting `2026-01-31` with `installmentCount: 3`, `totalAmount: 100` produces dates `['2026-01-31', '2026-02-28', '2026-03-31']`, amounts `[33.34, 33.33, 33.33]`, notes containing `'1/3'`, `'2/3'`, `'3/3'`.
- **Review Focus #2 (Multi-period recurring catch-up):** Active monthly rule with `nextRunDate: '2026-08-31'`, `autoCreate: true`, `asOfDate: '2026-11-20'` creates 3 transactions (`2026-08-31`, `2026-09-30`, `2026-10-31`) and advances `nextRunDate` to `'2026-11-30'`. When `autoCreate: false`, returns 3 `pendingApprovals` and leaves `createdTransactions` empty.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run tests/domain/ledger-recurring.test.ts`
Expected: FAIL with missing modules.

- [ ] **Step 3: Implement `src/domain/ledger.ts` and `src/domain/recurring.ts`**

Implement exact deterministic formulas matching spec §5.2.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx.cmd vitest run tests/domain/ledger-recurring.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/ledger.ts src/domain/recurring.ts tests/domain/ledger-recurring.test.ts
git commit -m "feat(domain): implement accounting ledger, credit card, installment, and recurring engine"
```

---

### Task 4: Analytics, Reporting, Calendar & Shared Report Snapshot Engine

**Files:**
- Create: `src/domain/analytics.ts`
- Test: `tests/domain/analytics.test.ts`

**Interfaces:**
- Consumes: `src/domain/types.ts`, `src/domain/money.ts`, `src/domain/periods.ts`, `src/domain/currency.ts`.
- Produces (`src/domain/analytics.ts`):
  - `filterReportTransactions(transactions: Transaction[], range: DateRange, filters?: { accountId?: string; categoryId?: string; search?: string; tag?: string; type?: TransactionType; minAmount?: number; maxAmount?: number }): Transaction[]`
  - `computePeriodKPIs(transactions: Transaction[], range: DateRange, prevRange: DateRange): PeriodKPIs` (`totalIncome`, `totalExpense`, `netCashFlow`, `savingsRate`, `dailyAverageExpense`, `incomeDeltaPct`, `expenseDeltaPct`, `netDeltaPct`)
  - `computeIncomeExpenseSeries(transactions: Transaction[], periodType: PeriodType, range: DateRange): Array<{ key: string; label: string; income: number; expense: number; net: number }>`
  - `computeCumulativeCashFlowSeries(transactions: Transaction[], periodType: PeriodType, range: DateRange): Array<{ key: string; label: string; cumulativeNet: number }>`
  - `computeCategoryBreakdown(transactions: Transaction[], categories: Category[], type: 'income' | 'expense'): Array<{ categoryId: string; name: string; color: string; icon: string; amount: number; sharePct: number; count: number }>`
  - `computeCategoryMovers(currentTx: Transaction[], prevTx: Transaction[], categories: Category[]): { topIncreased: CategoryMover[]; topDecreased: CategoryMover[] }`
  - `computeBudgetProgress(budgets: Budget[], transactions: Transaction[], categories: Category[], monthKey: string, monthStartDay: number, rates: Record<CurrencyCode, number>): Array<{ budget: Budget; categoryName: string; categoryColor: string; spent: number; limit: number; pct: number; status: 'ok' | 'warning' | 'exceeded' }>`
  - `computeEndOfMonthForecast(transactions: Transaction[], monthRange: DateRange, asOfDate: string): { spentSoFar: number; elapsedDays: number; totalDays: number; projectedTotal: number }`
  - `computeCalendarDailySummary(transactions: Transaction[], year: number, monthIndex0: number): Record<string, { income: number; expense: number; net: number; intensity: 0 | 1 | 2 | 3 | 4 }>`
  - `buildSharedReportSnapshot(params: { title: string; periodType: PeriodType; range: DateRange; prevRange: DateRange; transactions: Transaction[]; categories: Category[]; budgets: Budget[]; baseCurrency: CurrencyCode; monthStartDay: number; rates: Record<CurrencyCode, number>; includeTransactions: boolean; includeNotes: boolean }): ReportSnapshot`

- [ ] **Step 1: Write failing tests in `tests/domain/analytics.test.ts`**

Include tests asserting:
- Transfers (card payments, account transfers, goal deposits) are strictly excluded from `computePeriodKPIs`, `computeIncomeExpenseSeries`, and `computeCategoryBreakdown`.
- `computePeriodKPIs` uses transaction-time `baseAmount`, calculates `savingsRate = (income - expense) / income * 100` (0 when income is 0), and computes `%` deltas vs `prevRange`.
- `computeBudgetProgress` converts multi-currency expenses (e.g., `10 USD` + `500 TRY`) into the budget's currency (`TRY`), sets status `'ok'` (`<80%`), `'warning'` (`80–99.99%`), `'exceeded'` (`>=100%`), and evaluates general budget (`categoryId === null`).
- `computeEndOfMonthForecast` on day 15 of a 30-day month with `15_000` spent projects `30_000`.
- `computeCalendarDailySummary` groups by calendar day (`1–31`) regardless of `monthStartDay` and assigns intensity `0..4`.
- **Review Focus #3 (Shared report privacy):**
  - When `includeTransactions: false`, `snapshot.transactions` is `[]` while KPIs and charts are populated.
  - When `includeTransactions: true, includeNotes: false`, `snapshot.transactions` includes date, type, categoryName, baseAmount, currency, but `note`, `tags`, and `receiptUri` are strictly `undefined` / omitted.
  - When `includeTransactions: true, includeNotes: true`, `note` is present while `receiptUri` is still never leaked publicly.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run tests/domain/analytics.test.ts`
Expected: FAIL with missing module.

- [ ] **Step 3: Implement `src/domain/analytics.ts`**

Implement all pure analytics and snapshot functions cleanly.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx.cmd vitest run tests/domain/analytics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/analytics.ts tests/domain/analytics.test.ts
git commit -m "feat(domain): implement analytics, budgets, calendar heatmap, and shared report snapshot engine"
```

---

### Task 5: Offline-First Store, Sync Engine, Live FX & Export/Backup Services

**Files:**
- Create: `src/services/fxService.ts`
- Create: `src/services/syncEngine.ts`
- Create: `src/services/exportService.ts`
- Create: `src/store/useFinanceStore.ts`
- Test: `tests/services/sync-export-store.test.ts`

**Interfaces:**
- Consumes: `src/domain/*`, `@react-native-async-storage/async-storage`, `zustand`.
- Produces:
  - `src/services/fxService.ts`: `fetchLiveRates(existingRates: ExchangeRate[]): Promise<ExchangeRate[]>` (fetches `open.er-api.com/v6/latest/TRY` + gold fallback, preserves `source: 'manual'` entries, gracefully returns cached rates on network error).
  - `src/services/syncEngine.ts`: `deduplicateCategoriesByNameType(local: Category[], remote: Category[]): { merged: Category[]; idRemap: Record<string, string> }`, `mergeLocalIntoCloud(localState: FinanceDataSnapshot, remoteState: FinanceDataSnapshot, mode: 'merge' | 'cloud_only'): { nextState: FinanceDataSnapshot; toUpload: FinanceDataSnapshot }`, `mergeLwwEntities<T extends { id: string; updatedAt: string }>(local: T[], remote: T[]): T[]`.
  - `src/services/exportService.ts`: `generateTransactionsCsv(transactions: Transaction[], accounts: Account[], categories: Category[]): string`, `generateReportHtml(snapshot: ReportSnapshot): string`, `exportBackupJson(state: FinanceDataSnapshot): string`, `parseBackupJson(raw: string): FinanceDataSnapshot`, `shareCsvFile(...)`, `sharePdfReport(...)`, `shareJsonBackup(...)` (cross-platform: Web download/print, Native `expo-file-system` + `expo-print` + `expo-sharing`).
  - `src/store/useFinanceStore.ts`: Zustand store exposing full state + actions (`addAccount`, `updateAccount`, `archiveAccount`, `addTransaction`, `updateTransaction`, `deleteTransaction`, `addInstallmentPlan`, `deleteInstallmentPlan`, `addRecurringRule`, `updateRecurringRule`, `deleteRecurringRule`, `runDueRecurringRules`, `approvePendingRecurring`, `upsertBudget`, `deleteBudget`, `copyPreviousMonthBudgets`, `addGoal`, `contributeToGoal`, `deleteGoal`, `addDebt`, `recordDebtPayment`, `deleteDebt`, `addCategory`, `updateCategory`, `deleteCategory`, `setManualRate`, `refreshLiveRates`, `updateSettings`, `loadDemoData`, `clearAllData`, `restoreFromBackup`, `clearUserLocalDataOnSignOut`) + `alertQueue` (budget 80%/100% triggered alerts).

- [ ] **Step 1: Write failing tests in `tests/services/sync-export-store.test.ts`**

Include tests asserting:
- **Review Focus #4 (CSV safety):** `generateTransactionsCsv` starts with `\uFEFF`, properly quotes `"Market, ""özel"" not\nsatır 2"`, and prefixes leading `=SUM(A1)`, `+123`, `-123`, `@cmd` with `'` to prevent Excel formula injection.
- **Review Focus #5 (Demo isolation & category dedup):** `mergeLocalIntoCloud` with mixed `isDemo: true` and `isDemo: false` local transactions + duplicate default `'Market'` (`expense`) category drops every `isDemo: true` item from both `nextState` and `toUpload`, keeps remote `'Market'` ID, and remaps the local real transaction's `categoryId` to the remote `'Market'` ID.
- `mergeLwwEntities` resolves conflicts strictly by latest `updatedAt` (including soft-delete `deletedAt` tombstones).
- `parseBackupJson` rejects malformed JSON cleanly; store `restoreFromBackup(backup, 'merge')` upserts while `restoreFromBackup(backup, 'replace')` soft-deletes missing records (for cloud tombstone propagation).
- Store integration: adding an expense that pushes a category budget from `75%` to `85%` sets `alert80Sent = true` and enqueues a Turkish warning alert; deleting a `goalId` transfer automatically restores `goal.currentAmount`; `copyPreviousMonthBudgets` copies prior month limits cleanly with reset alert flags.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run tests/services/sync-export-store.test.ts`
Expected: FAIL with missing modules.

- [ ] **Step 3: Implement `fxService.ts`, `syncEngine.ts`, `exportService.ts`, and `useFinanceStore.ts`**

Ensure `useFinanceStore` uses a safe storage wrapper (AsyncStorage in RN/Web, in-memory fallback in Vitest Node environment) so store tests run deterministically in Node without mocking gymnastics.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx.cmd vitest run tests/services/sync-export-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/fxService.ts src/services/syncEngine.ts src/services/exportService.ts src/store/useFinanceStore.ts tests/services/sync-export-store.test.ts
git commit -m "feat(store): implement offline-first store, LWW sync engine, live FX, and CSV/PDF/JSON export"
```

---

### Task 6: Supabase Client, Auth (Email + Google), Shared Reports Service, Security & Notifications

**Files:**
- Create: `src/services/supabase.ts`
- Create: `src/services/authService.ts`
- Create: `src/services/sharedReportService.ts`
- Create: `src/services/securityService.ts`
- Create: `src/services/notificationService.ts`
- Test: `tests/services/auth-share-security.test.ts`

**Interfaces:**
- Consumes: `@supabase/supabase-js`, `expo-auth-session`, `expo-web-browser`, `expo-crypto`, `expo-secure-store`, `expo-local-authentication`, `expo-notifications`, `src/domain/types.ts`, `src/services/syncEngine.ts`.
- Produces:
  - `src/services/supabase.ts`: `isSupabaseConfigured(): boolean`, `getSupabaseClient(): SupabaseClient | null`, `getWebBaseUrl(): string`.
  - `src/services/authService.ts`: `signInWithEmail(email, password)`, `signUpWithEmail(email, password)`, `resetPassword(email)`, `signInWithGoogle()` (Expo AuthSession + Supabase OAuth on native & web), `signOut()`, `getCurrentSession()`, `syncWithSupabase(store, mode?)`.
  - `src/services/sharedReportService.ts`: `generateShareToken(): string`, `createSharedReport(params): Promise<SharedReport>`, `listSharedReports(): Promise<SharedReport[]>`, `revokeSharedReport(id: string): Promise<void>`, `fetchPublicSharedReport(token: string): Promise<{ status: 'ok'; report: SharedReport } | { status: 'not_found' | 'expired' | 'revoked' }>`, `buildShareUrl(token: string): string` (persists to Supabase when signed in AND falls back to local AsyncStorage registry in Local/Demo mode so `/shared/[token]` works immediately in local testing too!).
  - `src/services/securityService.ts`: `hashPin(pin: string): Promise<string>`, `savePin(pin: string): Promise<void>`, `verifyPin(pin: string): Promise<boolean>`, `clearPin(): Promise<void>`, `hasPin(): Promise<boolean>`, `authenticateWithBiometrics(): Promise<boolean>`, `isBiometricAvailable(): Promise<boolean>`.
  - `src/services/notificationService.ts`: `requestNotificationPermission(): Promise<boolean>`, `notifyBudgetThreshold(categoryName: string, pct: number): Promise<void>`, `scheduleUpcomingReminders(rules: RecurringRule[], accounts: Account[]): Promise<void>`.

- [ ] **Step 1: Write failing tests in `tests/services/auth-share-security.test.ts`**

Include tests asserting:
- `isSupabaseConfigured()` returns `false` and `getSupabaseClient()` returns `null` when env vars are missing (never throws).
- `generateShareToken()` produces a URL-safe random token >= 32 chars with uniqueness across calls.
- `createSharedReport` → `fetchPublicSharedReport(token)` returns `{ status: 'ok', report }` in local mode; after `revokeSharedReport(id)` it returns `{ status: 'revoked' }`; an expired report returns `{ status: 'expired' }`; unknown token returns `{ status: 'not_found' }`.
- `hashPin('1234')` produces deterministic SHA-256 hex digest different from plaintext; `savePin` + `verifyPin('1234')` returns `true`, `verifyPin('0000')` returns `false`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run tests/services/auth-share-security.test.ts`
Expected: FAIL with missing modules.

- [ ] **Step 3: Implement `supabase.ts`, `authService.ts`, `sharedReportService.ts`, `securityService.ts`, `notificationService.ts`**

Ensure every native module (`expo-secure-store`, `expo-local-authentication`, `expo-notifications`) guards `Platform.OS === 'web'` and Node test environments safely.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx.cmd vitest run tests/services/auth-share-security.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/supabase.ts src/services/authService.ts src/services/sharedReportService.ts src/services/securityService.ts src/services/notificationService.ts tests/services/auth-share-security.test.ts
git commit -m "feat(services): add Supabase client, Email+Google auth, shared reports, PIN/biometrics, and notifications"
```

---

### Task 7: Design System, Reusable UI, Interactive SVG Charts & Core Modals

**Files:**
- Create: `src/theme/theme.ts`
- Create: `src/components/ui/Card.tsx`, `src/components/ui/MoneyText.tsx`, `src/components/ui/SegmentedControl.tsx`, `src/components/ui/Chip.tsx`, `src/components/ui/EmptyState.tsx`, `src/components/ui/ConfirmModal.tsx`, `src/components/ui/LockScreenOverlay.tsx`
- Create: `src/components/charts/IncomeExpenseBarChart.tsx`, `src/components/charts/CashFlowAreaChart.tsx`, `src/components/charts/CategoryDonutChart.tsx`, `src/components/charts/BudgetProgressBars.tsx`, `src/components/charts/SpendingCalendar.tsx`
- Create: `src/components/QuickAddModal.tsx`, `src/components/ShareReportModal.tsx`
- Test: `tests/components/chart-math.test.ts`

**Interfaces:**
- Consumes: `src/domain/*`, `src/store/useFinanceStore.ts`, `src/services/sharedReportService.ts`, `src/services/exportService.ts`, `src/services/securityService.ts`, `react-native-svg`, `lucide-react-native`.
- Produces:
  - `useTheme()` hook returning dark (`#0B1120` bg / `#111827` surface) and light (`#F8FAFC` bg / `#FFFFFF` surface) palettes with semantic `#10B981` income, `#EF4444` expense, `#3B82F6` transfer/accent, `#F59E0B` warning.
  - All 5 interactive chart/calendar components with tap-to-inspect tooltip state (and `onSelectCategory` on Donut, `onSelectDate` on SpendingCalendar).
  - `QuickAddModal` (`visible`, `onClose`, `initialTransaction?`, `initialType?`) supporting Expense/Income/Transfer, custom numpad, currency selector, account/toAccount, category chips, date, note, tags, 2–24 installments, recurring toggle, and receipt photo picker (`expo-image-picker`).
  - `ShareReportModal` (`visible`, `onClose`, `snapshotParams`) with title input, expiry selector (`7 gün` / `30 gün` / `Süresiz`), privacy toggles (`İşlem listesini dahil et`, `Notları gizle`), live link creation + copy/share, and direct PDF/CSV export buttons.

- [ ] **Step 1: Write failing tests for chart geometry helpers in `tests/components/chart-math.test.ts`**

Test pure chart scaling/arc helpers (bar heights clamped safely when max is 0, donut arc angles summing to 360° with single-slice full circle handling, area chart negative & positive y-axis normalization).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run tests/components/chart-math.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement theme, UI primitives, 5 interactive SVG chart/calendar components, `QuickAddModal`, and `ShareReportModal`**

Ensure `MoneyText` uses `fontVariant: ['tabular-nums']` and automatically masks amounts when `privacyMode` is active. Ensure responsive max-width container support for Web/tablet screens.

- [ ] **Step 4: Run tests and TypeScript check**

Run: `npx.cmd vitest run tests/components/chart-math.test.ts && npx.cmd tsc --noEmit`
Expected: PASS with 0 TS errors.

- [ ] **Step 5: Commit**

```bash
git add src/theme src/components tests/components/chart-math.test.ts
git commit -m "feat(ui): build fintech theme, interactive SVG charts, QuickAddModal, and ShareReportModal"
```

---

### Task 8: App Shell & 4 Primary Tabs (Dashboard, Transactions, Reports, Plan Hub)

**Files:**
- Create: `app/_layout.tsx`
- Create: `app/(tabs)/_layout.tsx`
- Create: `app/(tabs)/index.tsx`
- Create: `app/(tabs)/transactions.tsx`
- Create: `app/(tabs)/reports.tsx`
- Create: `app/(tabs)/plan.tsx`

**Interfaces:**
- Consumes: `src/theme/theme.ts`, `src/store/useFinanceStore.ts`, `src/domain/ledger.ts`, `src/domain/analytics.ts`, `src/components/ui/*`, `src/components/charts/*`, `src/components/QuickAddModal.tsx`, `src/components/ShareReportModal.tsx`.
- Produces: Complete 5-slot Bottom Tab Bar navigation (`Özet`, `İşlemler`, center `+` Quick Add trigger, `Raporlar`, `Planla`), root startup lifecycle (recurring rule scan, live FX refresh, app lock gate on background return, in-app budget alert banner).

- [ ] **Step 1: Implement `app/_layout.tsx` and `app/(tabs)/_layout.tsx`**

- Root layout handles hydration, `runDueRecurringRules()`, background `refreshLiveRates()`, AppState lock trigger (`LockScreenOverlay`), in-app budget warning banner, and registers Stack routes for `(tabs)`, `plan/*`, and `shared/[token]`.
- Tabs layout renders the 5-slot bottom bar with the elevated center `+` button opening `QuickAddModal`.

- [ ] **Step 2: Implement `app/(tabs)/index.tsx` (Özet / Dashboard)**

- Header with sync status badge (`Bulut Bağlı` / `Çevrimdışı` / `Yerel Demo Modu`), Privacy Mode eye toggle, and Settings shortcut.
- First-run onboarding banner if zero accounts exist offering "Örnek Veriyle Dene" (1-tap demo load) or "İlk Hesabını Ekle".
- **Net Varlık Kartı (2A):** Net worth hero figure, monthly Income / Expense / Net pills, separate **Borç / Alacak Özeti** row.
- Horizontal Account & Credit Card strip (showing used/available limit bar on credit cards).
- **Aylık Bütçe Nabzı:** General budget bar, end-of-month forecast text (*"Bu hızla ay sonu tahmini: ...₺"*), top 3 categories nearest limit.
- **Yaklaşan Ödemeler & Onay Bekleyenler:** Next 7 days recurring rules, card due dates, upcoming debts, plus 1-tap approve button for `autoCreate: false` rules.
- **Son İşlemler:** Latest 5 transactions with tap-to-edit and "Tümünü Gör".

- [ ] **Step 3: Implement `app/(tabs)/transactions.tsx` (İşlemler)**

- Segmented toggle: **Liste | Takvim**.
- Search bar + filter chips (Type, Account, Category, Date period, Clear filters).
- List view grouped by day with daily net header, category icon/color badge, installment badge (`2/6`), receipt indicator, tap to edit/delete/preview receipt.
- Calendar view using `SpendingCalendar` showing daily `+gelir/-gider` + intensity color; tapping any day shows that day's transactions below.

- [ ] **Step 4: Implement `app/(tabs)/reports.tsx` (Raporlar & Grafikler)**

- Period selector: **Günlük | Haftalık | Aylık | Yıllık | Özel** + `< Önceki | Sonraki >` navigation + account filter + **Paylaş / Dışa Aktar** button (opens `ShareReportModal`).
- KPI cards (Toplam Gelir, Toplam Gider, Net Tasarruf, Tasarruf Oranı %, Günlük Ortalama) with previous-period `%` delta badges.
- All 4 interactive charts: `IncomeExpenseBarChart`, `CashFlowAreaChart`, `CategoryDonutChart` (Gider/Gelir toggle + tap slice to view matching transactions), `BudgetProgressBars`, plus **Önceki Dönem Kıyaslama** card (top 3 increased / top 3 decreased categories).

- [ ] **Step 5: Implement `app/(tabs)/plan.tsx` (Planla Hub)**

- Clean fintech grid/list linking to all 9 management screens with live summary badges (e.g., active accounts count, active installments monthly load, active shared links count).

- [ ] **Step 6: Verify TypeScript compilation**

Run: `npx.cmd tsc --noEmit`
Expected: PASS with 0 errors.

- [ ] **Step 7: Commit**

```bash
git add app/_layout.tsx app/(tabs)
git commit -m "feat(screens): implement app shell and Dashboard, Transactions, Reports, and Plan Hub tabs"
```

---

### Task 9: Plan Sub-Screens (Accounts, Budgets, Installments, Recurring, Goals, Debts, FX, Settings)

**Files:**
- Create: `app/plan/_layout.tsx`
- Create: `app/plan/accounts.tsx`
- Create: `app/plan/budgets.tsx`
- Create: `app/plan/installments.tsx`
- Create: `app/plan/recurring.tsx`
- Create: `app/plan/goals.tsx`
- Create: `app/plan/debts.tsx`
- Create: `app/plan/rates.tsx`
- Create: `app/plan/settings.tsx`

**Interfaces:**
- Consumes: `src/store/useFinanceStore.ts`, `src/domain/ledger.ts`, `src/domain/analytics.ts`, `src/services/authService.ts`, `src/services/exportService.ts`, `src/services/securityService.ts`, `src/services/notificationService.ts`, `src/components/ui/*`.
- Produces: Full CRUD & settings management for every feature in spec §5.3.6 and §5.4.

- [ ] **Step 1: Implement `app/plan/_layout.tsx`, `accounts.tsx`, `budgets.tsx`, `installments.tsx`, `recurring.tsx`**

- `accounts.tsx`: List active/archived accounts with balances; credit cards display limit bar, statement due, next due date, and **"Kart Borcu Öde"** quick transfer button; create/edit/archive modal.
- `budgets.tsx`: Month switcher, general monthly budget + per-category budgets with progress bars, **"Önceki Aydan Kopyala"** button, add/edit/delete limit modal.
- `installments.tsx`: Active installment plans showing paid vs remaining count (`3/6`), remaining total, monthly installment load summary, and delete-plan option.
- `recurring.tsx`: Active/paused recurring income/bills/subscriptions, frequency, next run date, `autoCreate` toggle, create/edit/delete modal.

- [ ] **Step 2: Implement `goals.tsx`, `debts.tsx`, `rates.tsx`, `settings.tsx`**

- `goals.tsx`: Savings goals (Kumbara) cards with progress bar, target date, **"Para Ekle / Çek"** modal (optional source account creating a non-expense `transfer` with `goalId`).
- `debts.tsx`: Segmented tabs (`Borçlarım` / `Alacaklarım`), remaining balance, due date, **"Ödeme Kaydet"** partial-payment modal with toggle to create linked account transaction (`Borç Ödeme` / `Alacak Tahsilatı`).
- `rates.tsx`: Live TRY/USD/EUR/GBP/XAU table with last-updated timestamp, **"Kurları Güncelle"** button, and manual override editor + "Otomatiğe Dön" reset.
- `settings.tsx`:
  - **Bulut Hesabı:** Email+Password Sign In / Sign Up / Password Reset + **Google ile Giriş** button; when `.env` not configured, shows clear status badge + link to setup steps while keeping Local/Demo mode active; when signed in, shows user email, "Şimdi Eşitle" button, local-to-cloud merge/replace prompt if local real data existed, and Sign Out button (wiping local user data).
  - **Tercihler:** Theme (`Sistem` / `Koyu` / `Açık`), Base Currency (`TRY`/`USD`/`EUR`/`GBP`/`XAU` with re-valuation notice), Month Start Day (`1–28`), Privacy Mode default, Notification toggle.
  - **Güvenlik:** PIN setup/change/remove + Biometric Lock toggle (hidden cleanly on Web).
  - **Veri & Kategoriler:** Custom Category manager (add/edit/delete), **JSON Yedek İndir/Paylaş**, **JSON Yedekten Geri Yükle** (Birleştir vs Sıfırla & Yükle), **Örnek Demo Verisi Yükle**, **Tüm Verileri Sıfırla**.

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx.cmd tsc --noEmit`
Expected: PASS with 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/plan
git commit -m "feat(screens): implement Accounts, Budgets, Installments, Recurring, Goals, Debts, FX, and Settings screens"
```

---

### Task 10: Public Read-Only Shared Report Viewer (`/shared/[token]`), Shared Reports Manager & End-to-End Verification

**Files:**
- Create: `app/plan/shared-reports.tsx`
- Create: `app/shared/[token].tsx`
- Test: `tests/integration/end-to-end-flow.test.ts`

**Interfaces:**
- Consumes: `src/services/sharedReportService.ts`, `src/domain/analytics.ts`, `src/components/charts/*`, `src/components/ui/*`, `src/theme/theme.ts`.
- Produces:
  - `app/plan/shared-reports.tsx`: Lists user's created shared links with title, period, expiry status, privacy badge, view count, Copy/Open link button, and 1-tap **İptal Et (Revoke)** button.
  - `app/shared/[token].tsx`: Login-free, responsive read-only report page displaying report header/period, KPI summary strip, interactive `IncomeExpenseBarChart`, `CategoryDonutChart`, `BudgetProgressBars`, and (only if `snapshot.includeTransactions`) filtered read-only transaction list; clean Turkish state screens for expired/revoked/not-found tokens.

- [ ] **Step 1: Write integration test `tests/integration/end-to-end-flow.test.ts`**

Simulate a complete user journey in the store & services:
1. Load demo data → verify 2A Net Worth reconciles exactly.
2. Add a 3-month credit card installment → verify credit card `totalDebt` drops Net Worth immediately while current month's expense increases by only 1/3.
3. Pay credit card bill via transfer → verify card debt decreases and Monthly Expense stays unchanged.
4. Contribute to a Savings Goal from bank account → verify Monthly Expense stays unchanged and Net Worth stays unchanged.
5. Create a privacy-filtered shared report (`includeTransactions: false`) → fetch it via `fetchPublicSharedReport(token)` → verify KPIs/charts exist and `transactions` is empty → revoke it → verify `status === 'revoked'`.
6. Export CSV + JSON backup → verify BOM & valid round-trip restore.

- [ ] **Step 2: Implement `app/plan/shared-reports.tsx` and `app/shared/[token].tsx`**

Wire both screens cleanly with responsive desktop/mobile layout.

- [ ] **Step 3: Run full automated verification suite**

Run:
1. `npx.cmd vitest run` — Expected: 100% PASS across all unit & integration tests.
2. `npx.cmd tsc --noEmit` — Expected: 0 TypeScript errors.
3. `npx.cmd expo export --platform web` — Expected: Clean Web bundle build in `dist/` with 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/plan/shared-reports.tsx app/shared tests/integration/end-to-end-flow.test.ts
git commit -m "feat(sharing): add shared report manager, public read-only viewer, and end-to-end tests"
```
