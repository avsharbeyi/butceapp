-- Bütçe Pro - Supabase PostgreSQL Şeması, RLS Politikaları, RPC ve Storage Ayarları
-- Supabase Dashboard > SQL Editor üzerinden tek seferde çalıştırılabilir.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- LWW senkronizasyonu ile uyumlu updated_at yardımcı tetikleyicisi
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 1. ACCOUNTS (Hesaplar / Cüzdanlar)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('cash', 'bank', 'credit_card', 'investment')),
  currency text NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU')),
  initial_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  credit_limit NUMERIC(14, 2),
  statement_day integer CHECK (statement_day BETWEEN 1 AND 28),
  due_day integer CHECK (due_day BETWEEN 1 AND 28),
  color text NOT NULL DEFAULT '#3B82F6',
  icon text NOT NULL DEFAULT 'wallet',
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS accounts_user_updated_idx
  ON public.accounts (user_id, updated_at);

CREATE TRIGGER set_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 2. CATEGORIES (Kategoriler)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  icon text NOT NULL DEFAULT 'tag',
  color text NOT NULL DEFAULT '#64748B',
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS categories_user_updated_idx
  ON public.categories (user_id, updated_at);

CREATE TRIGGER set_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 3. INSTALLMENT_PLANS (Taksit Planları)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.installment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  total_amount NUMERIC(14, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU')),
  installment_count integer NOT NULL CHECK (installment_count BETWEEN 2 AND 24),
  start_date date NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS installment_plans_user_updated_idx
  ON public.installment_plans (user_id, updated_at);

CREATE TRIGGER set_installment_plans_updated_at
  BEFORE UPDATE ON public.installment_plans
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 4. RECURRING_RULES (Düzenli Gelir / Fatura / Abonelikler)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.recurring_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  amount NUMERIC(14, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU')),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  frequency text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  next_run_date date NOT NULL,
  auto_create boolean NOT NULL DEFAULT true,
  remind_days_before integer NOT NULL DEFAULT 2,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS recurring_rules_user_updated_idx
  ON public.recurring_rules (user_id, updated_at);

CREATE TRIGGER set_recurring_rules_updated_at
  BEFORE UPDATE ON public.recurring_rules
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 5. SAVINGS_GOALS (Birikim Hedefleri / Kumbara)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.savings_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_amount NUMERIC(14, 2) NOT NULL,
  current_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU')),
  target_date date,
  icon text NOT NULL DEFAULT 'piggy-bank',
  color text NOT NULL DEFAULT '#10B981',
  is_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS savings_goals_user_updated_idx
  ON public.savings_goals (user_id, updated_at);

CREATE TRIGGER set_savings_goals_updated_at
  BEFORE UPDATE ON public.savings_goals
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 6. DEBTS (Borç-Alacak Defteri)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_name text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('owed_by_me', 'owed_to_me')),
  total_amount NUMERIC(14, 2) NOT NULL,
  paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU')),
  due_date date,
  note text,
  is_settled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS debts_user_updated_idx
  ON public.debts (user_id, updated_at);

CREATE TRIGGER set_debts_updated_at
  BEFORE UPDATE ON public.debts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 7. TRANSACTIONS (İşlemler)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  amount NUMERIC(14, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU')),
  exchange_rate_to_base numeric(18, 6) NOT NULL DEFAULT 1,
  base_amount NUMERIC(14, 2) NOT NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  to_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  to_amount NUMERIC(14, 2),
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  date date NOT NULL,
  note text,
  tags text[] NOT NULL DEFAULT '{}',
  receipt_uri text,
  installment_plan_id uuid REFERENCES public.installment_plans(id) ON DELETE SET NULL,
  installment_number integer,
  recurring_rule_id uuid REFERENCES public.recurring_rules(id) ON DELETE SET NULL,
  debt_id uuid REFERENCES public.debts(id) ON DELETE SET NULL,
  goal_id uuid REFERENCES public.savings_goals(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (account_id IS NOT NULL OR to_account_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS transactions_user_updated_idx
  ON public.transactions (user_id, updated_at);

CREATE INDEX IF NOT EXISTS transactions_user_date_idx
  ON public.transactions (user_id, date);

CREATE TRIGGER set_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 8. BUDGETS (Bütçe Limitleri)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  month text NOT NULL,
  limit_amount NUMERIC(14, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU')),
  alert_80_sent boolean NOT NULL DEFAULT false,
  alert_100_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS budgets_user_updated_idx
  ON public.budgets (user_id, updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS budgets_user_category_month_unique_idx
  ON public.budgets (
    user_id,
    coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    month
  )
  WHERE deleted_at IS NULL;

CREATE TRIGGER set_budgets_updated_at
  BEFORE UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 9. SHARED_REPORTS (Başkalarına Açılan Paylaşılabilir Raporlar)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.shared_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_token text NOT NULL UNIQUE,
  title text NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'yearly', 'custom')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  include_transactions boolean NOT NULL DEFAULT false,
  include_notes boolean NOT NULL DEFAULT false,
  snapshot_json jsonb NOT NULL,
  expires_at timestamptz,
  is_revoked boolean NOT NULL DEFAULT false,
  view_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS shared_reports_user_updated_idx
  ON public.shared_reports (user_id, updated_at);

CREATE TRIGGER set_shared_reports_updated_at
  BEFORE UPDATE ON public.shared_reports
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 10. USER_SETTINGS (Kullanıcı Ayarları)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  base_currency text NOT NULL DEFAULT 'TRY' CHECK (base_currency IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU')),
  theme text NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark')),
  privacy_mode boolean NOT NULL DEFAULT false,
  app_lock_enabled boolean NOT NULL DEFAULT false,
  notifications_enabled boolean NOT NULL DEFAULT true,
  month_start_day integer NOT NULL DEFAULT 1 CHECK (month_start_day BETWEEN 1 AND 28),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS user_settings_user_updated_idx
  ON public.user_settings (user_id, updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS user_settings_user_unique_idx
  ON public.user_settings (user_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER set_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 11. EXCHANGE_RATES (Döviz ve Altın Kurları)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  currency text NOT NULL CHECK (currency IN ('TRY', 'USD', 'EUR', 'GBP', 'XAU')),
  rate_to_try numeric(18, 6) NOT NULL,
  source text NOT NULL DEFAULT 'live' CHECK (source IN ('live', 'manual', 'default')),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS exchange_rates_user_updated_idx
  ON public.exchange_rates (user_id, updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS exchange_rates_user_currency_unique_idx
  ON public.exchange_rates (user_id, currency)
  WHERE deleted_at IS NULL;

CREATE TRIGGER set_exchange_rates_updated_at
  BEFORE UPDATE ON public.exchange_rates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) - Tüm 11 Tablo İçin Sahip Bazlı İzolasyon
-- ============================================================================
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

-- accounts
CREATE POLICY accounts_select_own ON public.accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY accounts_insert_own ON public.accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY accounts_update_own ON public.accounts FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY accounts_delete_own ON public.accounts FOR DELETE USING (auth.uid() = user_id);

-- categories
CREATE POLICY categories_select_own ON public.categories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY categories_insert_own ON public.categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY categories_update_own ON public.categories FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY categories_delete_own ON public.categories FOR DELETE USING (auth.uid() = user_id);

-- installment_plans
CREATE POLICY installment_plans_select_own ON public.installment_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY installment_plans_insert_own ON public.installment_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY installment_plans_update_own ON public.installment_plans FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY installment_plans_delete_own ON public.installment_plans FOR DELETE USING (auth.uid() = user_id);

-- recurring_rules
CREATE POLICY recurring_rules_select_own ON public.recurring_rules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY recurring_rules_insert_own ON public.recurring_rules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY recurring_rules_update_own ON public.recurring_rules FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY recurring_rules_delete_own ON public.recurring_rules FOR DELETE USING (auth.uid() = user_id);

-- savings_goals
CREATE POLICY savings_goals_select_own ON public.savings_goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY savings_goals_insert_own ON public.savings_goals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY savings_goals_update_own ON public.savings_goals FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY savings_goals_delete_own ON public.savings_goals FOR DELETE USING (auth.uid() = user_id);

-- debts
CREATE POLICY debts_select_own ON public.debts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY debts_insert_own ON public.debts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY debts_update_own ON public.debts FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY debts_delete_own ON public.debts FOR DELETE USING (auth.uid() = user_id);

-- transactions
CREATE POLICY transactions_select_own ON public.transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY transactions_insert_own ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY transactions_update_own ON public.transactions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY transactions_delete_own ON public.transactions FOR DELETE USING (auth.uid() = user_id);

-- budgets
CREATE POLICY budgets_select_own ON public.budgets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY budgets_insert_own ON public.budgets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY budgets_update_own ON public.budgets FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY budgets_delete_own ON public.budgets FOR DELETE USING (auth.uid() = user_id);

-- shared_reports (doğrudan tablo erişimi sadece sahibine açık)
CREATE POLICY shared_reports_select_own ON public.shared_reports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY shared_reports_insert_own ON public.shared_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY shared_reports_update_own ON public.shared_reports FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY shared_reports_delete_own ON public.shared_reports FOR DELETE USING (auth.uid() = user_id);

-- user_settings
CREATE POLICY user_settings_select_own ON public.user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY user_settings_insert_own ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_settings_update_own ON public.user_settings FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_settings_delete_own ON public.user_settings FOR DELETE USING (auth.uid() = user_id);

-- exchange_rates
CREATE POLICY exchange_rates_select_own ON public.exchange_rates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY exchange_rates_insert_own ON public.exchange_rates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY exchange_rates_update_own ON public.exchange_rates FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY exchange_rates_delete_own ON public.exchange_rates FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- SECURITY DEFINER RPC: get_shared_report(p_token)
-- Ham finansal tabloları açmadan yalnızca filtrelenmiş snapshot_json döndürür.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_shared_report(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report public.shared_reports%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT *
  INTO v_report
  FROM public.shared_reports
  WHERE share_token = p_token
    AND deleted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_report.is_revoked THEN
    RETURN jsonb_build_object('status', 'revoked');
  END IF;

  IF v_report.expires_at IS NOT NULL AND v_report.expires_at <= now() THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  UPDATE public.shared_reports
  SET view_count = view_count + 1
  WHERE id = v_report.id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'report', jsonb_build_object(
      'id', v_report.id,
      'title', v_report.title,
      'period_type', v_report.period_type,
      'start_date', v_report.start_date,
      'end_date', v_report.end_date,
      'include_transactions', v_report.include_transactions,
      'include_notes', v_report.include_notes,
      'snapshot_json', v_report.snapshot_json,
      'created_at', v_report.created_at,
      'expires_at', v_report.expires_at
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_shared_report(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_report(text) TO anon, authenticated;

-- ============================================================================
-- STORAGE BUCKET: receipts (Özel / Private Fiş Fotoğrafları)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO UPDATE SET public = false;

CREATE POLICY receipts_select_own
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY receipts_insert_own
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY receipts_update_own
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY receipts_delete_own
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
