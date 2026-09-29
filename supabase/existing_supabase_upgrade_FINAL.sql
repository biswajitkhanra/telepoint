-- ============================================================================
-- TELEPOINT / EMI PORTAL — SINGLE CONSOLIDATED UPGRADE (migrations 001 .. 030
-- + the 2026-09-29 repair). File: supabase/existing_supabase_upgrade_FINAL.sql
--
-- WHAT THIS IS
--   ONE file that brings an EXISTING database to the final state of the whole
--   migrations/ folder plus every fix made on 2026-09-29. It is safe to run on
--   the live database as it is now, and safe to run again at any time.
--
--   It includes:
--     * migrations 001-029: columns, tables, constraints, indexes, the view,
--       every function (latest definition of each), triggers, RLS, grants, cron;
--     * migration 030: device-management tables + policies (for the Android
--       apps); empty tables, no data;
--     * recalc_customer_fines / approve_payment_request from change #127
--       (git da7fc01): a COMPLETE customer with an unpaid fine STAYS COMPLETE,
--       which is how the live database behaved before 2026-09-29;
--     * fine_utr / fine_mode stamping on approval (migrations 019 / 021);
--     * Supabase Security Advisor fixes: pinned search_path, no direct API
--       execution of trigger / internal functions, emi_schedule_state view
--       obeys RLS (security_invoker).
--
--   It does NOT contain the one-time data restores of 2026-09-29 (139 EMI rows,
--   43 customers). Those already ran and are confirmed by backup comparison;
--   they live in supabase/restore_after_bad_upgrade_2026-09-29.sql and
--   supabase/fix_reopened_customers_2026-09-29.sql for the record only.
--
-- SOURCE OF TRUTH (in this order)
--   1. What the CURRENT web app calls / reads  (app/, components/, lib/)
--   2. The LATEST migration that defines each object (migrations/001 .. 030),
--      with #127 (da7fc01) for the two functions named above
--   3. fresh_supabase_schema.sql — ONLY to recognise and keep the trigger
--      binding of databases that were provisioned from it (see SECTION 9)
--
-- DATA SAFETY
--   * The script executes no DELETE, no TRUNCATE, no DROP TABLE, no DROP COLUMN.
--     (The two "DELETE FROM emi_schedule" lines below live inside the
--     generate_emi_schedule / fn_generate_emi_schedule bodies copied verbatim
--     from migration 024; they run only when a customer's EMI terms are
--     edited, exactly as they did before this script.)
--   * No UPDATE of any financial value (amounts, statuses, dates, UTRs).
--   * The ONLY row writes:
--       - customers.customer_code is filled where it is NULL (migration 025's
--         own backfill, NULL-only — an existing code is never changed);
--       - the fine_settings id=1 row is inserted ONLY if it is missing
--         (001/010, ON CONFLICT DO NOTHING — existing settings untouched).
--   * Duplicate PENDING payment requests are never deleted: the one-PENDING
--     unique index is skipped and every conflicting row is listed.
--   * Data problems are only DETECTED and REPORTED in the final report
--     (SECTION 13) — never "fixed" automatically.
--
-- HOW TO RUN
--   Supabase -> SQL Editor -> New query -> paste the WHOLE file -> Run.
--   Every step is idempotent: if it ever stops on an error, nothing is lost —
--   fix what the message says and run the whole file again.
--   The last statement returns a report table — read every non-OK row.
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 0: PRE-FLIGHT — must be an existing EMI Portal database
-- ============================================================================
DO $$
DECLARE t TEXT; missing TEXT := '';
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','retailers','customers','emi_schedule',
                           'payment_requests','payment_request_items','audit_log','fine_settings']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      missing := missing || ' ' || t;
    END IF;
  END LOOP;
  IF missing <> '' THEN
    RAISE EXCEPTION 'Not an existing EMI Portal database — missing core tables:%. Nothing was changed.', missing;
  END IF;
END $$;

-- ============================================================================
-- SECTION 1: EXTENSIONS + IST TIMEZONE            (001, 026, 015)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 015: ALTER DATABASE postgres SET timezone TO 'Asia/Kolkata'
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Asia/Kolkata');
END $$;

-- ============================================================================
-- SECTION 2: COLUMNS + TABLES (additive only — IF NOT EXISTS everywhere)
-- ============================================================================

-- retailers (002, 004)
ALTER TABLE retailers ADD COLUMN IF NOT EXISTS retail_pin TEXT;
ALTER TABLE retailers ADD COLUMN IF NOT EXISTS mobile     TEXT;

-- customers (002, 006, 007, 010, 025, 027)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_photo_url  TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS aadhaar_front_url   TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS aadhaar_back_url    TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bill_photo_url      TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS settlement_amount   NUMERIC(12,2);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS settlement_date     DATE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS settled_by          UUID REFERENCES auth.users(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS emi_start_date      DATE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS emi_card_photo_url  TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_locked           BOOLEAN DEFAULT FALSE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS lock_provider       TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS lock_device_id      TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS google_drive_docs   TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_code       TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS first_emi_charge_paid_amount NUMERIC(12,2) DEFAULT 0;

-- emi_schedule (002, 007/010, 014, 019, 021, 022)
ALTER TABLE emi_schedule ADD COLUMN IF NOT EXISTS collected_by_role       TEXT
  CHECK (collected_by_role IN ('admin', 'retailer'));
ALTER TABLE emi_schedule ADD COLUMN IF NOT EXISTS collected_by_user_id    UUID REFERENCES auth.users(id);
ALTER TABLE emi_schedule ADD COLUMN IF NOT EXISTS fine_last_calculated_at TIMESTAMPTZ;
ALTER TABLE emi_schedule ADD COLUMN IF NOT EXISTS fine_paid_amount        NUMERIC(12,2) DEFAULT 0;
ALTER TABLE emi_schedule ADD COLUMN IF NOT EXISTS fine_paid_at            TIMESTAMPTZ;
ALTER TABLE emi_schedule ADD COLUMN IF NOT EXISTS utr                     TEXT;
ALTER TABLE emi_schedule ADD COLUMN IF NOT EXISTS partial_paid_amount     NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE emi_schedule ADD COLUMN IF NOT EXISTS partial_paid_at         TIMESTAMPTZ;
ALTER TABLE emi_schedule ADD COLUMN IF NOT EXISTS fine_utr                TEXT;
ALTER TABLE emi_schedule ADD COLUMN IF NOT EXISTS fine_mode               TEXT;
ALTER TABLE emi_schedule ADD COLUMN IF NOT EXISTS collection_requested_at TIMESTAMPTZ;

COMMENT ON COLUMN emi_schedule.fine_utr IS
  'Transaction reference (UTR) for the fine payment applied to this EMI. '
  'Mirrors payment_requests.utr so per-EMI views can show the fine UTR even '
  'for fine-only payments where the principal utr column stays NULL.';
COMMENT ON COLUMN emi_schedule.fine_mode IS
  'Payment method (CASH / UPI) for the fine payment applied to this EMI. '
  'Mirrors payment_requests.mode so per-EMI views can show the fine''s method '
  'independently of the principal payment.';
COMMENT ON COLUMN emi_schedule.collection_requested_at IS
  'When collection was first initiated for this EMI. Drives fine eligibility '
  '(<= due_date → no fine). NULL = not yet collected / reset on rejection.';

-- fine_settings (010). The singleton row is only inserted if it is missing.
ALTER TABLE fine_settings ADD COLUMN IF NOT EXISTS weekly_fine_increment NUMERIC(12,2) DEFAULT 25;
INSERT INTO fine_settings (id, default_fine_amount) VALUES (1, 450) ON CONFLICT DO NOTHING;

-- payment_requests (002, 004, 007, 015)
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS selected_emi_nos     INT[];
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS scheduled_emi_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS collected_by_role    TEXT
  CHECK (collected_by_role IN ('admin', 'retailer'));
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS collected_by_user_id UUID REFERENCES auth.users(id);
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS fine_for_emi_no      INT;
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS fine_due_date        DATE;
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS utr                  TEXT;
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS fine_breakdown       JSONB;

COMMENT ON COLUMN payment_requests.fine_breakdown IS
  'Per-EMI fine allocation: [{ "emi_no": int, "amount": numeric }]. '
  'When non-null, the reconciler applies each amount to the matching '
  'EMI row''s fine_paid_amount. Fine_status is evaluated independently '
  'of principal_status — paying EMI 2 principal does not clear EMI 1 fine.';

-- broadcast_messages (005, 008, 010, 020)
CREATE TABLE IF NOT EXISTS broadcast_messages (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message            TEXT NOT NULL,
  image_url          TEXT,
  target_retailer_id UUID NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
  expires_at         TIMESTAMPTZ NOT NULL,
  created_by         UUID REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE broadcast_messages ADD COLUMN IF NOT EXISTS image_url          TEXT;
ALTER TABLE broadcast_messages ADD COLUMN IF NOT EXISTS sender_name        TEXT DEFAULT 'TELEPOINT';
ALTER TABLE broadcast_messages ADD COLUMN IF NOT EXISTS sender_role        TEXT DEFAULT 'admin';
ALTER TABLE broadcast_messages ADD COLUMN IF NOT EXISTS target_customer_id UUID REFERENCES customers(id) ON DELETE CASCADE;
COMMENT ON COLUMN broadcast_messages.target_customer_id IS
  'Optional. When set, the broadcast is delivered only to this customer '
  '(direct retailer → customer message). NULL = retailer-wide broadcast.';

-- fine_history (010)
CREATE TABLE IF NOT EXISTS fine_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  emi_schedule_id UUID REFERENCES emi_schedule(id) ON DELETE CASCADE,
  emi_no          INT,
  fine_type       TEXT NOT NULL CHECK (fine_type IN ('BASE','WEEKLY','PAID','WAIVED')),
  fine_amount     NUMERIC(12,2) NOT NULL,
  cumulative_fine NUMERIC(12,2) NOT NULL DEFAULT 0,
  fine_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  reason          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- customer_app_tokens (010)
CREATE TABLE IF NOT EXISTS customer_app_tokens (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id      UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token            TEXT NOT NULL UNIQUE,
  is_active        BOOLEAN DEFAULT TRUE,
  created_by       UUID REFERENCES auth.users(id),
  last_accessed_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 3: CHECK CONSTRAINTS                    (006/007/010, 014, 016)
-- Replaced ONLY when the current definition is missing or narrower than the
-- final one. If any existing row would violate the final constraint, the whole
-- script stops with the offending ids (nothing is changed to make it pass).
-- ============================================================================
DO $$
DECLARE
  v_def TEXT;
  v_bad TEXT;
BEGIN
  -- customers.status  (006 / 007 / 010)
  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
  WHERE conrelid = 'public.customers'::regclass AND conname = 'customers_status_check';
  IF v_def IS NULL OR v_def NOT LIKE '%SETTLED%' OR v_def NOT LIKE '%NPA%' THEN
    SELECT string_agg(id::text || '=' || COALESCE(status, 'NULL'), ', ') INTO v_bad
    FROM (SELECT id, status FROM customers
          WHERE status IS NULL OR status NOT IN ('RUNNING','COMPLETE','SETTLED','NPA') LIMIT 20) s;
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'customers.status has values outside (RUNNING, COMPLETE, SETTLED, NPA): %. Nothing was changed.', v_bad;
    END IF;
    ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_status_check;
    ALTER TABLE customers ADD CONSTRAINT customers_status_check
      CHECK (status IN ('RUNNING', 'COMPLETE', 'SETTLED', 'NPA'));
    RAISE NOTICE 'customers_status_check set to the 006/010 definition.';
  END IF;

  -- emi_schedule.status  (014)
  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
  WHERE conrelid = 'public.emi_schedule'::regclass AND conname = 'emi_schedule_status_check';
  IF v_def IS NULL OR v_def NOT LIKE '%PARTIALLY_PAID%' OR v_def NOT LIKE '%PENDING_APPROVAL%' THEN
    SELECT string_agg(id::text || '=' || COALESCE(status, 'NULL'), ', ') INTO v_bad
    FROM (SELECT id, status FROM emi_schedule
          WHERE status IS NULL OR status NOT IN ('UNPAID','PENDING_APPROVAL','PARTIALLY_PAID','APPROVED') LIMIT 20) s;
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'emi_schedule.status has values outside the 014 set: %. Nothing was changed.', v_bad;
    END IF;
    ALTER TABLE emi_schedule DROP CONSTRAINT IF EXISTS emi_schedule_status_check;
    ALTER TABLE emi_schedule ADD CONSTRAINT emi_schedule_status_check
      CHECK (status IN ('UNPAID', 'PENDING_APPROVAL', 'PARTIALLY_PAID', 'APPROVED'));
    RAISE NOTICE 'emi_schedule_status_check set to the 014 definition.';
  END IF;

  -- customers.emi_due_day  (016: 1..30)
  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
  WHERE conrelid = 'public.customers'::regclass AND conname = 'customers_emi_due_day_check';
  IF v_def IS NULL OR v_def NOT LIKE '%<= 30%' THEN
    SELECT string_agg(id::text || '=' || emi_due_day::text, ', ') INTO v_bad
    FROM (SELECT id, emi_due_day FROM customers
          WHERE emi_due_day IS NOT NULL AND emi_due_day NOT BETWEEN 1 AND 30 LIMIT 20) s;
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'customers.emi_due_day outside 1..30: %. Nothing was changed.', v_bad;
    END IF;
    ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_emi_due_day_check;
    ALTER TABLE customers ADD CONSTRAINT customers_emi_due_day_check
      CHECK (emi_due_day BETWEEN 1 AND 30);
    RAISE NOTICE 'customers_emi_due_day_check set to the 016 definition.';
  END IF;
END $$;

-- ============================================================================
-- SECTION 4: CUSTOMER CODE                         (025, verbatim functions)
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS customer_code_seq START 1;

CREATE OR REPLACE FUNCTION to_code36(n bigint)
RETURNS text AS $$
DECLARE
  chars CONSTANT text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  result text := '';
  v bigint := GREATEST(n, 0);
BEGIN
  WHILE v > 0 LOOP
    result := substr(chars, (v % 36)::int + 1, 1) || result;
    v := v / 36;
  END LOOP;
  RETURN lpad(COALESCE(NULLIF(result, ''), '0'), 4, '0');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION next_customer_code()
RETURNS text AS $$
DECLARE
  candidate text;
BEGIN
  LOOP
    candidate := 'TP' || to_code36(nextval('customer_code_seq'));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM customers WHERE customer_code = candidate);
  END LOOP;
  RETURN candidate;
END;
$$ LANGUAGE plpgsql;

-- 025 backfill, restricted to NULL codes only. An existing code — even one not
-- matching TP+4 — is NEVER overwritten here; such rows are listed in the report.
DO $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN
    SELECT id FROM customers WHERE customer_code IS NULL ORDER BY created_at ASC, id ASC
  LOOP
    UPDATE customers SET customer_code = next_customer_code() WHERE id = r.id AND customer_code IS NULL;
    n := n + 1;
  END LOOP;
  IF n > 0 THEN
    RAISE NOTICE '025: assigned a customer_code to % customer(s) that had none.', n;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION assign_customer_code()
RETURNS trigger AS $$
BEGIN
  IF NEW.customer_code IS NULL THEN
    NEW.customer_code := next_customer_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_customer_code ON customers;
CREATE TRIGGER trg_assign_customer_code
BEFORE INSERT ON customers
FOR EACH ROW EXECUTE FUNCTION assign_customer_code();

-- Fails loudly (whole script rolls back) if two customers share a code.
CREATE UNIQUE INDEX IF NOT EXISTS customers_customer_code_key ON customers (customer_code);

-- ============================================================================
-- SECTION 5: ONE PENDING REQUEST PER CUSTOMER      (028 PART A1)
-- Duplicates are NEVER deleted or merged. If any exist the index is skipped and
-- every conflicting request id is listed in the final report.
-- ============================================================================
DO $$
DECLARE n INT;
BEGIN
  IF to_regclass('public.uniq_payment_requests_customer_pending') IS NOT NULL THEN
    RETURN;
  END IF;
  SELECT COUNT(*) INTO n FROM (
    SELECT customer_id FROM payment_requests WHERE status = 'PENDING'
    GROUP BY customer_id HAVING COUNT(*) > 1) d;
  IF n > 0 THEN
    RAISE WARNING '028: uniq_payment_requests_customer_pending NOT created — % customer(s) have more than one PENDING request (see report). Nothing was deleted.', n;
  ELSE
    EXECUTE 'CREATE UNIQUE INDEX uniq_payment_requests_customer_pending
             ON payment_requests(customer_id) WHERE status = ''PENDING''';
  END IF;
END $$;

-- ============================================================================
-- SECTION 6: INDEXES   (001, 005, 010, 014, 018, 020, 022, 023, 026)
-- ============================================================================
-- 001
CREATE INDEX IF NOT EXISTS idx_customers_imei               ON customers(imei);
CREATE INDEX IF NOT EXISTS idx_customers_aadhaar            ON customers(aadhaar);
CREATE INDEX IF NOT EXISTS idx_customers_mobile             ON customers(mobile);
CREATE INDEX IF NOT EXISTS idx_customers_retailer_id        ON customers(retailer_id);
CREATE INDEX IF NOT EXISTS idx_customers_status             ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_name               ON customers USING gin(to_tsvector('english', customer_name));
CREATE INDEX IF NOT EXISTS idx_emi_schedule_customer_id     ON emi_schedule(customer_id);
CREATE INDEX IF NOT EXISTS idx_emi_schedule_due_date        ON emi_schedule(due_date);
CREATE INDEX IF NOT EXISTS idx_emi_schedule_status          ON emi_schedule(status);
CREATE INDEX IF NOT EXISTS idx_payment_requests_customer_id ON payment_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_retailer_id ON payment_requests(retailer_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status      ON payment_requests(status);
-- 005
CREATE INDEX IF NOT EXISTS idx_broadcast_retailer           ON broadcast_messages(target_retailer_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_expires            ON broadcast_messages(expires_at);
-- 010
CREATE INDEX IF NOT EXISTS idx_fine_history_cust            ON fine_history(customer_id);
CREATE INDEX IF NOT EXISTS idx_fine_history_emi             ON fine_history(emi_schedule_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_utr         ON payment_requests(utr);
CREATE INDEX IF NOT EXISTS idx_app_tokens_customer          ON customer_app_tokens(customer_id);
CREATE INDEX IF NOT EXISTS idx_app_tokens_token             ON customer_app_tokens(token);
-- 014
CREATE INDEX IF NOT EXISTS idx_emi_schedule_partial_status  ON emi_schedule(customer_id, status, emi_no);
CREATE INDEX IF NOT EXISTS idx_emi_schedule_partial_paid    ON emi_schedule(customer_id, partial_paid_amount);
-- 018
CREATE INDEX IF NOT EXISTS idx_customers_purchase_date      ON customers(purchase_date);
CREATE INDEX IF NOT EXISTS idx_customers_created_at         ON customers(created_at);
-- 020
CREATE INDEX IF NOT EXISTS idx_broadcast_customer           ON broadcast_messages(target_customer_id);
-- 022
CREATE INDEX IF NOT EXISTS idx_emi_collection_requested_at  ON emi_schedule(collection_requested_at);
-- 023
CREATE INDEX IF NOT EXISTS idx_emi_paid_at                  ON emi_schedule(paid_at);
-- 026
CREATE INDEX IF NOT EXISTS idx_customers_retailer_status    ON customers (retailer_id, status);
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm          ON customers USING gin (customer_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_emi_customer_emino           ON emi_schedule (customer_id, emi_no);
CREATE INDEX IF NOT EXISTS idx_emi_status_due               ON emi_schedule (status, due_date);
CREATE INDEX IF NOT EXISTS idx_emi_due_date                 ON emi_schedule (due_date);
CREATE INDEX IF NOT EXISTS idx_payreq_status_created        ON payment_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payreq_retailer_status       ON payment_requests (retailer_id, status);
CREATE INDEX IF NOT EXISTS idx_payreq_customer              ON payment_requests (customer_id);
CREATE INDEX IF NOT EXISTS idx_payreq_approved_at           ON payment_requests (approved_at);
CREATE INDEX IF NOT EXISTS idx_payreq_utr                   ON payment_requests (utr);
CREATE INDEX IF NOT EXISTS idx_broadcast_retailer_expiry    ON broadcast_messages (target_retailer_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id             ON profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_retailers_auth_user          ON retailers (auth_user_id);

-- ============================================================================
-- SECTION 7: VIEW                                  (015, verbatim)
-- ============================================================================
CREATE OR REPLACE VIEW emi_schedule_state AS
SELECT
  es.id,
  es.customer_id,
  es.emi_no,
  es.due_date,
  es.amount,
  es.status                                                              AS principal_status,
  CASE
    WHEN es.fine_waived                                                  THEN 'WAIVED'
    WHEN COALESCE(es.fine_amount, 0) <= 0                                THEN 'NONE'
    WHEN COALESCE(es.fine_paid_amount, 0) >= COALESCE(es.fine_amount, 0) THEN 'PAID'
    WHEN COALESCE(es.fine_paid_amount, 0) > 0                            THEN 'PARTIAL'
    ELSE 'UNPAID'
  END                                                                    AS fine_status,
  es.fine_amount,
  es.fine_paid_amount,
  es.partial_paid_amount,
  es.paid_at,
  es.fine_paid_at,
  es.mode,
  es.utr,
  es.fine_waived
FROM emi_schedule es;

-- The view must obey the caller's RLS (Supabase lint 0010). Without this it runs
-- with its creator's rights and exposes every EMI row to the anon key. No app
-- code reads this view.
ALTER VIEW emi_schedule_state SET (security_invoker = true);
REVOKE ALL ON emi_schedule_state FROM anon;

-- ============================================================================
-- SECTION 8: FUNCTIONS — latest repository definition of each
-- ============================================================================

-- ── 001: RLS helpers (never changed by any later migration) ─────────────────
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_my_retailer_id()
RETURNS UUID AS $$
  SELECT id FROM retailers WHERE auth_user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── 024: EMI schedule generators — BOTH lineages (024 redefines both "so the
--    fix holds no matter how a given database was provisioned"). Which one the
--    customer triggers call is decided in SECTION 9.
CREATE OR REPLACE FUNCTION generate_emi_schedule(p_customer_id UUID)
RETURNS VOID AS $$
DECLARE
  v_customer    RECORD;
  v_base_month  DATE;   -- first day of the month the FIRST EMI falls in
  v_month_start DATE;
  v_last_day    DATE;
  v_due_date    DATE;
  i             INT;
BEGIN
  SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;

  DELETE FROM emi_schedule WHERE customer_id = p_customer_id;

  -- Honour the chosen start month EXACTLY - no automatic +1 shift.
  -- Default (no month chosen) = the month after the purchase month.
  IF v_customer.emi_start_date IS NOT NULL THEN
    v_base_month := DATE_TRUNC('month', v_customer.emi_start_date)::DATE;
  ELSE
    v_base_month := (DATE_TRUNC('month', v_customer.purchase_date) + INTERVAL '1 month')::DATE;
  END IF;

  FOR i IN 0..(v_customer.emi_tenure - 1) LOOP
    v_month_start := (v_base_month + (i || ' months')::INTERVAL)::DATE;
    v_last_day    := (v_month_start + INTERVAL '1 month - 1 day')::DATE;
    -- Clamp emi_due_day to the month end (e.g. day 30 in February).
    v_due_date    := LEAST(v_month_start + (v_customer.emi_due_day - 1), v_last_day);

    INSERT INTO emi_schedule (customer_id, emi_no, due_date, amount)
    VALUES (p_customer_id, i + 1, v_due_date, v_customer.emi_amount);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 001 (unchanged since)
CREATE OR REPLACE FUNCTION trigger_generate_emi_schedule()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM generate_emi_schedule(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 024
CREATE OR REPLACE FUNCTION trigger_regenerate_emi_on_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.emi_tenure    != NEW.emi_tenure    OR
     OLD.emi_amount    != NEW.emi_amount    OR
     OLD.purchase_date != NEW.purchase_date OR
     OLD.emi_due_day   != NEW.emi_due_day   OR
     COALESCE(OLD.emi_start_date::TEXT, '') != COALESCE(NEW.emi_start_date::TEXT, '')
  THEN
    PERFORM generate_emi_schedule(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 024
CREATE OR REPLACE FUNCTION fn_generate_emi_schedule()
RETURNS TRIGGER AS $$
DECLARE
  v_base_month  DATE;
  v_due_day     INT;
  v_i           INT;
  v_due_date    DATE;
  v_month_start DATE;
  v_last_day    DATE;
BEGIN
  -- Honour the chosen start month EXACTLY; default to month after purchase.
  IF NEW.emi_start_date IS NOT NULL THEN
    v_base_month := DATE_TRUNC('month', NEW.emi_start_date)::DATE;
  ELSE
    v_base_month := (DATE_TRUNC('month', NEW.purchase_date) + INTERVAL '1 month')::DATE;
  END IF;
  v_due_day := COALESCE(NEW.emi_due_day, EXTRACT(DAY FROM NEW.purchase_date)::INT);

  IF TG_OP = 'UPDATE' THEN
    IF OLD.emi_amount = NEW.emi_amount AND OLD.emi_tenure = NEW.emi_tenure
       AND OLD.emi_due_day IS NOT DISTINCT FROM NEW.emi_due_day
       AND OLD.emi_start_date IS NOT DISTINCT FROM NEW.emi_start_date THEN
      RETURN NEW;
    END IF;
    -- Delete only UNPAID EMIs on update (preserve paid ones)
    DELETE FROM emi_schedule WHERE customer_id = NEW.id AND status = 'UNPAID';
  END IF;

  FOR v_i IN 0..(NEW.emi_tenure - 1) LOOP
    v_month_start := (v_base_month + (v_i || ' months')::INTERVAL)::DATE;
    v_last_day    := (v_month_start + INTERVAL '1 month - 1 day')::DATE;
    v_due_date    := LEAST(v_month_start + (v_due_day - 1), v_last_day);

    INSERT INTO emi_schedule (customer_id, emi_no, due_date, amount)
    VALUES (NEW.id, v_i + 1, v_due_date, NEW.emi_amount)
    ON CONFLICT (customer_id, emi_no) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 010: auto-complete trigger function (only BOUND on the migration lineage,
--    see SECTION 9 — fresh_supabase_schema.sql never created this trigger).
CREATE OR REPLACE FUNCTION fn_check_auto_complete()
RETURNS TRIGGER AS $$
DECLARE v_unpaid INT; v_fine_unpaid INT; v_cust RECORD;
BEGIN
  SELECT * INTO v_cust FROM customers WHERE id = NEW.customer_id AND status = 'RUNNING';
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO v_unpaid FROM emi_schedule WHERE customer_id = NEW.customer_id AND status IN ('UNPAID','PENDING_APPROVAL');
  SELECT COUNT(*) INTO v_fine_unpaid FROM emi_schedule WHERE customer_id = NEW.customer_id AND fine_amount > 0 AND COALESCE(fine_paid_amount,0) < fine_amount AND fine_waived = FALSE;
  IF v_unpaid = 0 AND v_fine_unpaid = 0 AND (v_cust.first_emi_charge_amount = 0 OR v_cust.first_emi_charge_paid_at IS NOT NULL) THEN
    UPDATE customers SET status = 'COMPLETE', completion_date = CURRENT_DATE WHERE id = NEW.customer_id AND status = 'RUNNING';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── recalc_customer_fines: migration #127 (git da7fc01) — the version the live
--    DB ran until 2026-09-29 (proved by the before-backup: 43 COMPLETE customers
--    with unpaid fines stayed COMPLETE). Same fine rules as 022, but never
--    reopens a COMPLETE customer.
CREATE OR REPLACE FUNCTION recalc_customer_fines(p_customer_id UUID)
RETURNS INT AS $$
DECLARE
  v_base_fine   NUMERIC := 450;
  v_weekly      NUMERIC := 25;
  v_max_emi_no  INT;
  v_row         RECORD;
  v_days        INT;
  v_weeks       INT;
  v_calc        NUMERIC;
  v_new         NUMERIC;
  v_updated     INT := 0;
BEGIN
  SELECT COALESCE(default_fine_amount, 450), COALESCE(weekly_fine_increment, 25)
  INTO v_base_fine, v_weekly
  FROM fine_settings WHERE id = 1;

  SELECT MAX(emi_no) INTO v_max_emi_no
  FROM emi_schedule WHERE customer_id = p_customer_id;

  FOR v_row IN
    SELECT * FROM emi_schedule
    WHERE customer_id = p_customer_id
      AND fine_waived = FALSE
      AND status <> 'PENDING_APPROVAL'          -- frozen while awaiting verdict
      -- Collection-date gate: collected on/before due date → never fined.
      AND NOT (collection_requested_at IS NOT NULL
               AND collection_requested_at::date <= due_date)
      AND (
        (status IN ('UNPAID', 'PARTIALLY_PAID') AND due_date < CURRENT_DATE)
        -- Late-collected EMI keeps (and persists) its fine even once APPROVED.
        OR (collection_requested_at IS NOT NULL
            AND collection_requested_at::date > due_date)
        OR (COALESCE(fine_amount, 0) > COALESCE(fine_paid_amount, 0))
      )
  LOOP
    v_days := GREATEST(0, (CURRENT_DATE - v_row.due_date)::INT);

    IF v_days = 0 THEN
      v_calc := COALESCE(v_row.fine_amount, 0);
    ELSIF v_row.emi_no = v_max_emi_no AND v_row.status <> 'APPROVED' THEN
      v_calc := CEIL(v_days::NUMERIC / 30) * v_base_fine;
    ELSIF v_days <= 30 THEN
      v_calc := v_base_fine;
    ELSE
      v_weeks := FLOOR((v_days - 30)::NUMERIC / 7);
      v_calc := v_base_fine + (v_weeks * v_weekly);
    END IF;

    -- Never decrease — preserve manual overrides and prior accrual.
    v_new := GREATEST(v_calc, COALESCE(v_row.fine_amount, 0));

    IF v_new <> COALESCE(v_row.fine_amount, 0) THEN
      UPDATE emi_schedule
      SET fine_amount             = v_new,
          fine_last_calculated_at = NOW(),
          updated_at              = NOW()
      WHERE id = v_row.id;
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  -- NOTE: Deliberately NO status change here. A pending fine must never move a
  -- COMPLETE customer back to RUNNING — completion depends only on EMI payment.
  RETURN v_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ── 017: recalc_all_fines — latest definition ──────────────────────────────
CREATE OR REPLACE FUNCTION recalc_all_fines()
RETURNS INT AS $$
DECLARE
  v_cust   UUID;
  v_total  INT := 0;
BEGIN
  FOR v_cust IN
    SELECT DISTINCT c.id
    FROM customers c
    JOIN emi_schedule e ON e.customer_id = c.id
    WHERE c.status IN ('RUNNING', 'COMPLETE')
      AND e.fine_waived = FALSE
      AND e.status <> 'PENDING_APPROVAL'
      AND (
        (e.status IN ('UNPAID', 'PARTIALLY_PAID') AND e.due_date < CURRENT_DATE)
        OR (COALESCE(e.fine_amount, 0) > COALESCE(e.fine_paid_amount, 0))
      )
  LOOP
    v_total := v_total + recalc_customer_fines(v_cust);
  END LOOP;
  RETURN v_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 028 PART B3: get_due_breakdown (027 body + ownership guard) — verbatim ──
CREATE OR REPLACE FUNCTION get_due_breakdown(
  p_customer_id     UUID,
  p_selected_emi_no INT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_customer         RECORD;
  v_next_emi         RECORD;
  v_selected_emi     RECORD;
  v_emi_amount       NUMERIC := 0;
  v_fine_due         NUMERIC := 0;
  v_first_charge_due NUMERIC := 0;
  v_charge_paid      NUMERIC := 0;
  v_fine_row         RECORD;
  v_base_fine        NUMERIC := 450;
  v_weekly           NUMERIC := 25;
  v_days             INT;
  v_weeks            INT;
  v_calc_fine        NUMERIC;
  v_max_emi_no       INT;
  v_is_overdue       BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- OWNERSHIP GUARD — auth.uid() IS NULL means this is a service-role call
  -- (customer-login / customer-app-token), which is trusted and already did
  -- its own ownership resolution before calling here. A real end-user
  -- session must be super_admin, or a retailer who owns this customer.
  IF auth.uid() IS NOT NULL THEN
    IF get_my_role() = 'super_admin' THEN
      NULL; -- unrestricted
    ELSIF get_my_role() = 'retailer' AND v_customer.retailer_id = get_my_retailer_id() THEN
      NULL; -- own customer
    ELSE
      RETURN jsonb_build_object('error', 'Forbidden');
    END IF;
  END IF;

  SELECT COALESCE(default_fine_amount, 450), COALESCE(weekly_fine_increment, 25)
  INTO v_base_fine, v_weekly
  FROM fine_settings WHERE id = 1;

  SELECT * INTO v_next_emi
  FROM emi_schedule
  WHERE customer_id = p_customer_id
    AND status IN ('UNPAID', 'PARTIALLY_PAID')
  ORDER BY emi_no ASC LIMIT 1;

  IF p_selected_emi_no IS NOT NULL THEN
    SELECT * INTO v_selected_emi
    FROM emi_schedule
    WHERE customer_id = p_customer_id AND emi_no = p_selected_emi_no AND status = 'UNPAID';
    IF FOUND THEN v_emi_amount := v_selected_emi.amount; END IF;
  ELSE
    v_emi_amount := GREATEST(0,
      COALESCE(v_next_emi.amount, 0) - COALESCE(v_next_emi.partial_paid_amount, 0)
    );
  END IF;

  SELECT MAX(emi_no) INTO v_max_emi_no FROM emi_schedule WHERE customer_id = p_customer_id;

  FOR v_fine_row IN
    SELECT * FROM emi_schedule
    WHERE customer_id = p_customer_id
      AND fine_waived = FALSE
      AND NOT (collection_requested_at IS NOT NULL
               AND collection_requested_at::date <= due_date)
      AND (
        (status IN ('UNPAID', 'PARTIALLY_PAID') AND due_date < CURRENT_DATE)
        OR (collection_requested_at IS NOT NULL
            AND collection_requested_at::date > due_date)
        OR (COALESCE(fine_amount, 0) > COALESCE(fine_paid_amount, 0))
      )
  LOOP
    v_days := GREATEST(0, (CURRENT_DATE - v_fine_row.due_date)::INT);
    IF v_days = 0 THEN
      v_calc_fine := COALESCE(v_fine_row.fine_amount, 0);
    ELSIF v_fine_row.emi_no = v_max_emi_no AND v_fine_row.status <> 'APPROVED' THEN
      v_calc_fine := CEIL(GREATEST(1, v_days)::NUMERIC / 30) * v_base_fine;
    ELSIF v_days <= 30 THEN
      v_calc_fine := v_base_fine;
    ELSE
      v_weeks := FLOOR((v_days - 30)::NUMERIC / 7);
      v_calc_fine := v_base_fine + (v_weeks * v_weekly);
    END IF;
    v_calc_fine := GREATEST(v_calc_fine, COALESCE(v_fine_row.fine_amount, 0));
    v_fine_due  := v_fine_due + GREATEST(0, v_calc_fine - COALESCE(v_fine_row.fine_paid_amount, 0));
    IF v_fine_row.due_date < CURRENT_DATE
       AND v_fine_row.status IN ('UNPAID', 'PARTIALLY_PAID') THEN
      v_is_overdue := TRUE;
    END IF;
  END LOOP;

  IF COALESCE(v_customer.first_emi_charge_amount, 0) > 0 THEN
    v_charge_paid := CASE
      WHEN v_customer.first_emi_charge_paid_at IS NOT NULL
      THEN COALESCE(v_customer.first_emi_charge_amount, 0)
      ELSE COALESCE(v_customer.first_emi_charge_paid_amount, 0)
    END;
    v_first_charge_due := GREATEST(0, COALESCE(v_customer.first_emi_charge_amount, 0) - v_charge_paid);
  END IF;

  RETURN jsonb_build_object(
    'customer_id',          p_customer_id,
    'customer_status',      v_customer.status,
    'next_emi_no',          v_next_emi.emi_no,
    'next_emi_amount',      COALESCE(v_next_emi.amount, 0),
    'next_emi_due_date',    v_next_emi.due_date,
    'next_emi_status',      v_next_emi.status,
    'selected_emi_no',      COALESCE(p_selected_emi_no, v_next_emi.emi_no),
    'selected_emi_amount',  v_emi_amount,
    'fine_due',             v_fine_due,
    'first_emi_charge_due', v_first_charge_due,
    'total_payable',        v_emi_amount + v_fine_due + v_first_charge_due,
    'popup_first_emi_charge', v_first_charge_due > 0,
    'popup_fine_due',         v_fine_due > 0,
    'is_overdue',             v_is_overdue
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ── approve_payment_request ─────────────────────────────────────────────────
-- Body = migration 027 (latest: partial first-EMI charge + collection date +
-- recalc before completion), with ONE evidence-based addition: the two fine
-- UPDATEs also stamp fine_utr / fine_mode exactly as migrations 019 and 021
-- did (`fine_utr = COALESCE(fine_utr, v_request.utr)`,
--  `fine_mode = COALESCE(fine_mode, v_request.mode)`).
-- Why: migration 022 rewrote this function from a pre-019 body and silently
-- dropped those two lines; 027 inherited the loss. The current app still
-- expects them: lib/paymentReconcile.ts:141-145 documents that it mirrors
-- "the DB function's COALESCE(fine_utr, …) / COALESCE(fine_mode, …)", and
-- components/EMIScheduleTable.tsx:466-477 + components/FineSummaryPanel.tsx:70
-- display fine_utr / fine_mode. COALESCE only fills NULLs — nothing existing
-- is overwritten. Everything else is 027 verbatim.
CREATE OR REPLACE FUNCTION approve_payment_request(
  p_request_id UUID,
  p_admin_id   UUID,
  p_remark     TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_request      RECORD;
  v_item         RECORD;
  v_fine_entry   RECORD;
  v_now          TIMESTAMPTZ := NOW();
  v_emi_ids      UUID[] := '{}';
  v_unpaid_count INT;
BEGIN
  SELECT * INTO v_request FROM payment_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;
  IF v_request.status = 'APPROVED' THEN
    RETURN jsonb_build_object('success', true, 'already_approved', true, 'request_id', p_request_id);
  END IF;
  IF v_request.status != 'PENDING' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot approve: status is ' || v_request.status);
  END IF;

  FOR v_item IN
    SELECT pri.emi_schedule_id, pri.amount, es.amount AS emi_amount,
           COALESCE(es.partial_paid_amount, 0) AS already_paid
    FROM payment_request_items pri
    JOIN emi_schedule es ON es.id = pri.emi_schedule_id
    WHERE pri.payment_request_id = p_request_id
  LOOP
    DECLARE
      v_new_paid NUMERIC;
      v_is_full  BOOLEAN;
    BEGIN
      v_new_paid := LEAST(v_item.emi_amount, v_item.already_paid + v_item.amount);
      v_is_full  := v_new_paid >= v_item.emi_amount;
      UPDATE emi_schedule
      SET
        partial_paid_amount  = v_new_paid,
        partial_paid_at      = COALESCE(partial_paid_at, v_now),
        status               = CASE WHEN v_is_full THEN 'APPROVED' ELSE 'PARTIALLY_PAID' END,
        paid_at              = CASE WHEN v_is_full THEN COALESCE(paid_at, v_now) ELSE NULL END,
        mode                 = COALESCE(mode, v_request.mode),
        utr                  = COALESCE(utr, v_request.utr),
        approved_by          = p_admin_id,
        collection_requested_at = COALESCE(collection_requested_at, v_request.created_at, v_now),
        collected_by_role    = COALESCE(collected_by_role, v_request.collected_by_role, 'retailer'),
        collected_by_user_id = COALESCE(collected_by_user_id, v_request.submitted_by),
        updated_at           = v_now
      WHERE id = v_item.emi_schedule_id;
      v_emi_ids := v_emi_ids || v_item.emi_schedule_id;
    END;
  END LOOP;

  IF v_request.fine_breakdown IS NOT NULL
     AND jsonb_typeof(v_request.fine_breakdown) = 'array'
     AND jsonb_array_length(v_request.fine_breakdown) > 0 THEN
    FOR v_fine_entry IN
      SELECT (entry->>'emi_no')::INT       AS emi_no,
             (entry->>'amount')::NUMERIC   AS amount
      FROM jsonb_array_elements(v_request.fine_breakdown) AS entry
    LOOP
      IF v_fine_entry.amount IS NULL OR v_fine_entry.amount <= 0 THEN
        CONTINUE;
      END IF;
      UPDATE emi_schedule
      SET
        fine_paid_amount = LEAST(COALESCE(fine_amount, 0),
          COALESCE(fine_paid_amount, 0) + v_fine_entry.amount),
        fine_paid_at = COALESCE(fine_paid_at, v_now),
        fine_utr     = COALESCE(fine_utr, v_request.utr),     -- 019
        fine_mode    = COALESCE(fine_mode, v_request.mode),   -- 021
        updated_at   = v_now
      WHERE customer_id = v_request.customer_id
        AND emi_no      = v_fine_entry.emi_no;
    END LOOP;
  ELSIF COALESCE(v_request.fine_amount, 0) > 0 THEN
    UPDATE emi_schedule
    SET
      fine_paid_amount = LEAST(fine_amount,
        COALESCE(fine_paid_amount, 0) + v_request.fine_amount),
      fine_paid_at = COALESCE(fine_paid_at, v_now),
      fine_utr     = COALESCE(fine_utr, v_request.utr),       -- 019
      fine_mode    = COALESCE(fine_mode, v_request.mode),     -- 021
      updated_at   = v_now
    WHERE customer_id = v_request.customer_id
      AND emi_no = COALESCE(v_request.fine_for_emi_no,
        (SELECT MIN(pri.emi_no) FROM payment_request_items pri
         WHERE pri.payment_request_id = p_request_id));
  END IF;

  -- First EMI charge — accumulate the running paid balance; only stamp the
  -- fully-paid timestamp once the whole charge is collected.
  IF COALESCE(v_request.first_emi_charge_amount, 0) > 0 THEN
    UPDATE customers c
    SET first_emi_charge_paid_amount = LEAST(
          COALESCE(c.first_emi_charge_amount, 0),
          CASE WHEN c.first_emi_charge_paid_at IS NOT NULL
               THEN COALESCE(c.first_emi_charge_amount, 0)
               ELSE COALESCE(c.first_emi_charge_paid_amount, 0) END
          + v_request.first_emi_charge_amount
        ),
        first_emi_charge_paid_at = CASE
          WHEN (CASE WHEN c.first_emi_charge_paid_at IS NOT NULL
                     THEN COALESCE(c.first_emi_charge_amount, 0)
                     ELSE COALESCE(c.first_emi_charge_paid_amount, 0) END
                + v_request.first_emi_charge_amount) >= COALESCE(c.first_emi_charge_amount, 0)
          THEN COALESCE(c.first_emi_charge_paid_at, v_now)
          ELSE NULL END,
        updated_at = v_now
    WHERE c.id = v_request.customer_id;
  END IF;

  UPDATE payment_requests
  SET status = 'APPROVED', approved_by = p_admin_id, approved_at = v_now, updated_at = v_now,
      notes = CASE
                WHEN p_remark IS NOT NULL
                THEN COALESCE(notes || E'\n', '') || 'Admin remark: ' || p_remark
                ELSE notes END
  WHERE id = p_request_id;

  PERFORM recalc_customer_fines(v_request.customer_id);

  SELECT COUNT(*) INTO v_unpaid_count
  FROM emi_schedule
  WHERE customer_id = v_request.customer_id
    AND status IN ('UNPAID', 'PENDING_APPROVAL', 'PARTIALLY_PAID');

  -- Auto-complete once every EMI installment is paid. A pending fine is NOT a
  -- blocker — status depends only on EMI completion. The first-EMI-charge gate
  -- (a separate, unrelated rule) is preserved.
  IF v_unpaid_count = 0 THEN
    DECLARE v_cust RECORD; v_charge_pending BOOLEAN;
    BEGIN
      SELECT * INTO v_cust FROM customers WHERE id = v_request.customer_id;
      v_charge_pending := COALESCE(v_cust.first_emi_charge_amount, 0) > 0
        AND (CASE WHEN v_cust.first_emi_charge_paid_at IS NOT NULL
                  THEN COALESCE(v_cust.first_emi_charge_amount, 0)
                  ELSE COALESCE(v_cust.first_emi_charge_paid_amount, 0) END)
            < COALESCE(v_cust.first_emi_charge_amount, 0);
      IF NOT v_charge_pending THEN
        UPDATE customers SET status = 'COMPLETE', completion_date = v_now::DATE, updated_at = v_now
        WHERE id = v_request.customer_id AND status = 'RUNNING';
      END IF;
    END;
  END IF;

  INSERT INTO audit_log (actor_user_id, actor_role, action, table_name, record_id, before_data, after_data, remark)
  VALUES (p_admin_id, 'super_admin', 'APPROVE_PAYMENT', 'payment_requests', p_request_id,
    jsonb_build_object('status', 'PENDING'),
    jsonb_build_object('status', 'APPROVED', 'emi_ids', to_jsonb(v_emi_ids), 'approved_at', v_now),
    p_remark);

  RETURN jsonb_build_object('success', true, 'request_id', p_request_id,
    'emi_ids', to_jsonb(v_emi_ids), 'approved_at', v_now);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ── 028 PART A2: submit_payment_request — verbatim ──────────────────────────
CREATE OR REPLACE FUNCTION submit_payment_request(
  p_customer_id             UUID,
  p_retailer_id             UUID,
  p_submitted_by            UUID,
  p_mode                    TEXT,
  p_utr                     TEXT,
  p_notes                   TEXT,
  p_emi_ids                 UUID[],
  p_emi_nos                 INT[],
  p_total_emi_amount        NUMERIC,
  p_scheduled_emi_amount    NUMERIC,
  p_fine_amount             NUMERIC,
  p_first_emi_charge_amount NUMERIC,
  p_total_amount            NUMERIC,
  p_fine_for_emi_no         INT,
  p_fine_due_date           DATE,
  p_fine_breakdown          JSONB,
  p_collected_by_role       TEXT,
  p_bypass_sequence         BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
  v_customer       RECORD;
  v_emi            RECORD;
  v_no_emi         BOOLEAN := (p_emi_ids IS NULL OR array_length(p_emi_ids, 1) IS NULL);
  v_lowest_unpaid  INT;
  v_submitted_min  INT;
  v_now            TIMESTAMPTZ := NOW();
  v_request_id     UUID;
BEGIN
  -- Lock the customer row so two concurrent submits for the SAME customer
  -- serialize here rather than both reading a pre-submit world.
  SELECT id, retailer_id INTO v_customer
  FROM customers WHERE id = p_customer_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'error', 'Customer not found');
  END IF;

  IF v_customer.retailer_id IS DISTINCT FROM p_retailer_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'error', 'Customer does not belong to your account');
  END IF;

  IF NOT v_no_emi THEN
    -- Lock + validate every targeted EMI row before anything is written.
    FOR v_emi IN
      SELECT id, status, emi_no FROM emi_schedule
      WHERE id = ANY(p_emi_ids) AND customer_id = p_customer_id
      FOR UPDATE
    LOOP
      IF v_emi.status = 'APPROVED' THEN
        RETURN jsonb_build_object('success', false, 'code', 'ALREADY_APPROVED',
          'error', 'EMI #' || v_emi.emi_no || ' is already fully paid');
      END IF;
      IF v_emi.status = 'PENDING_APPROVAL' THEN
        RETURN jsonb_build_object('success', false, 'code', 'ALREADY_PENDING',
          'error', 'EMI #' || v_emi.emi_no || ' already has a pending request');
      END IF;
    END LOOP;

    -- Sequence enforcement: retailers must collect EMIs in order (admin
    -- direct-collect bypasses this, same as before).
    IF NOT p_bypass_sequence THEN
      SELECT MIN(emi_no) INTO v_lowest_unpaid
      FROM emi_schedule
      WHERE customer_id = p_customer_id AND status IN ('UNPAID', 'PARTIALLY_PAID');

      IF v_lowest_unpaid IS NOT NULL THEN
        SELECT MIN(x) INTO v_submitted_min FROM unnest(p_emi_nos) AS x;
        IF v_submitted_min > v_lowest_unpaid THEN
          RETURN jsonb_build_object('success', false, 'code', 'SEQUENCE_VIOLATION',
            'error', 'EMI sequence violation. EMI #' || v_lowest_unpaid ||
                     ' must be paid first before collecting EMI #' || v_submitted_min || '.');
        END IF;
      END IF;
    END IF;
  END IF;

  -- Insert under the partial unique index (PART A1). A concurrent duplicate
  -- (double-click, two tabs, a retried request — with or without an EMI
  -- attached) now fails here atomically instead of both succeeding.
  BEGIN
    INSERT INTO payment_requests (
      customer_id, retailer_id, submitted_by, status, mode, utr,
      total_emi_amount, scheduled_emi_amount, fine_amount, first_emi_charge_amount,
      total_amount, notes, selected_emi_nos, fine_for_emi_no, fine_due_date,
      fine_breakdown, collected_by_role, collected_by_user_id
    ) VALUES (
      p_customer_id, p_retailer_id, p_submitted_by, 'PENDING', p_mode, NULLIF(p_utr, ''),
      COALESCE(p_total_emi_amount, 0), COALESCE(p_scheduled_emi_amount, 0),
      COALESCE(p_fine_amount, 0), COALESCE(p_first_emi_charge_amount, 0),
      p_total_amount, p_notes,
      COALESCE(p_emi_nos, ARRAY[]::INT[]), p_fine_for_emi_no, p_fine_due_date,
      p_fine_breakdown, COALESCE(p_collected_by_role, 'retailer'), p_submitted_by
    )
    RETURNING id INTO v_request_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'code', 'DUPLICATE_PENDING',
      'error', 'This customer already has a payment request pending approval. Wait for it to be approved or rejected before submitting another.');
  END;

  IF NOT v_no_emi THEN
    INSERT INTO payment_request_items (payment_request_id, emi_schedule_id, emi_no, amount)
    SELECT v_request_id, eid, eno, COALESCE(p_total_emi_amount, 0) / GREATEST(array_length(p_emi_ids, 1), 1)
    FROM unnest(p_emi_ids, p_emi_nos) AS t(eid, eno);

    -- Stamp the ORIGINAL collection date (fine eligibility is decided by
    -- this, never by the later admin approval time) before flipping status.
    UPDATE emi_schedule
    SET collection_requested_at = COALESCE(collection_requested_at, v_now)
    WHERE id = ANY(p_emi_ids);

    PERFORM recalc_customer_fines(p_customer_id);

    UPDATE emi_schedule SET status = 'PENDING_APPROVAL' WHERE id = ANY(p_emi_ids);
  END IF;

  RETURN jsonb_build_object('success', true, 'request_id', v_request_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 023: _emi_period_metrics — verbatim ─────────────────────────────────────
CREATE OR REPLACE FUNCTION _emi_period_metrics(p_month INT, p_year INT)
RETURNS JSONB
LANGUAGE sql STABLE
AS $$
  -- Counts both RUNNING (active) and COMPLETE (finished) loans; SETTLED
  -- early-closures and NPA write-offs are excluded from the business figures.
  SELECT jsonb_build_object(
    'loanGiven', COALESCE((
      SELECT SUM(CASE WHEN COALESCE(disburse_amount, 0) > 0
                      THEN disburse_amount
                      ELSE GREATEST(0, COALESCE(purchase_value, 0) - COALESCE(down_payment, 0)) END)
      FROM customers
      WHERE status IN ('RUNNING', 'COMPLETE')
        AND EXTRACT(YEAR  FROM COALESCE(purchase_date, created_at::date)) = p_year
        AND EXTRACT(MONTH FROM COALESCE(purchase_date, created_at::date)) = p_month), 0),

    'customers', COALESCE((
      SELECT COUNT(*) FROM customers
      WHERE status IN ('RUNNING', 'COMPLETE')
        AND EXTRACT(YEAR  FROM COALESCE(purchase_date, created_at::date)) = p_year
        AND EXTRACT(MONTH FROM COALESCE(purchase_date, created_at::date)) = p_month), 0),

    -- Collected: EMI principal + fine, dated by each EMI's collection date,
    -- plus the 1st-EMI charge in the month it was paid.
    'collected', (
      COALESCE((
        SELECT SUM(
          CASE WHEN es.status = 'APPROVED' OR c.status = 'COMPLETE'
               THEN COALESCE(es.amount, 0)
               ELSE COALESCE(es.partial_paid_amount, 0) END
          + COALESCE(es.fine_paid_amount, 0))
        FROM emi_schedule es
        JOIN customers c ON c.id = es.customer_id AND c.status IN ('RUNNING', 'COMPLETE')
        WHERE (es.status = 'APPROVED' OR c.status = 'COMPLETE'
               OR COALESCE(es.partial_paid_amount, 0) > 0
               OR COALESCE(es.fine_paid_amount, 0) > 0)
          AND EXTRACT(YEAR  FROM COALESCE(es.collection_requested_at::date, es.paid_at::date, es.due_date)) = p_year
          AND EXTRACT(MONTH FROM COALESCE(es.collection_requested_at::date, es.paid_at::date, es.due_date)) = p_month
      ), 0)
      + COALESCE((
        SELECT SUM(first_emi_charge_amount) FROM customers
        WHERE status IN ('RUNNING', 'COMPLETE') AND first_emi_charge_paid_at IS NOT NULL
          AND EXTRACT(YEAR  FROM first_emi_charge_paid_at) = p_year
          AND EXTRACT(MONTH FROM first_emi_charge_paid_at) = p_month
      ), 0)
    ),

    'dueEmis', COALESCE((
      SELECT COUNT(*) FROM emi_schedule es
      JOIN customers c ON c.id = es.customer_id AND c.status IN ('RUNNING', 'COMPLETE')
      WHERE EXTRACT(YEAR  FROM es.due_date) = p_year
        AND EXTRACT(MONTH FROM es.due_date) = p_month), 0),

    -- Bounce: due this month AND not collected on schedule. A COMPLETE
    -- customer's installment is paid by definition, so never a bounce.
    'bouncedEmis', COALESCE((
      SELECT COUNT(*) FROM emi_schedule es
      JOIN customers c ON c.id = es.customer_id AND c.status IN ('RUNNING', 'COMPLETE')
      WHERE EXTRACT(YEAR  FROM es.due_date) = p_year
        AND EXTRACT(MONTH FROM es.due_date) = p_month
        AND es.status <> 'APPROVED'
        AND c.status <> 'COMPLETE'), 0)
  );
$$;

-- ── 028 PART B2: get_emi_analysis (023 body + super-admin guard) — verbatim ─
CREATE OR REPLACE FUNCTION get_emi_analysis(p_month INT, p_year INT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
BEGIN
  IF get_my_role() IS DISTINCT FROM 'super_admin' THEN
    RETURN jsonb_build_object('error', 'Forbidden — super admin only');
  END IF;

  RETURN jsonb_build_object(
    'thisYear', _emi_period_metrics(p_month, p_year),
    'lastYear', _emi_period_metrics(p_month, p_year - 1),

    'leadLeaderboard', (
      SELECT COALESCE(
        jsonb_agg(jsonb_build_object('retailerId', id, 'name', name, 'value', cnt) ORDER BY cnt DESC),
        '[]'::jsonb)
      FROM (
        SELECT r.id, r.name, COUNT(c.id) AS cnt
        FROM retailers r
        JOIN customers c ON c.retailer_id = r.id AND c.status IN ('RUNNING', 'COMPLETE')
        WHERE EXTRACT(YEAR  FROM COALESCE(c.purchase_date, c.created_at::date)) = p_year
          AND EXTRACT(MONTH FROM COALESCE(c.purchase_date, c.created_at::date)) = p_month
        GROUP BY r.id, r.name
        ORDER BY cnt DESC
      ) s
    ),

    'collectionLeaderboard', (
      SELECT COALESCE(
        jsonb_agg(jsonb_build_object('retailerId', id, 'name', name, 'value', total) ORDER BY total DESC),
        '[]'::jsonb)
      FROM (
        SELECT r.id, r.name, SUM(x.amt) AS total
        FROM (
          SELECT c.retailer_id AS rid,
            (CASE WHEN es.status = 'APPROVED' OR c.status = 'COMPLETE'
                  THEN COALESCE(es.amount, 0)
                  ELSE COALESCE(es.partial_paid_amount, 0) END
             + COALESCE(es.fine_paid_amount, 0)) AS amt,
            COALESCE(es.collection_requested_at::date, es.paid_at::date, es.due_date) AS cdate
          FROM emi_schedule es
          JOIN customers c ON c.id = es.customer_id AND c.status IN ('RUNNING', 'COMPLETE')
          WHERE (es.status = 'APPROVED' OR c.status = 'COMPLETE'
                 OR COALESCE(es.partial_paid_amount, 0) > 0
                 OR COALESCE(es.fine_paid_amount, 0) > 0)
          UNION ALL
          SELECT c.retailer_id AS rid,
            COALESCE(c.first_emi_charge_amount, 0) AS amt,
            c.first_emi_charge_paid_at::date AS cdate
          FROM customers c
          WHERE c.status IN ('RUNNING', 'COMPLETE')
            AND c.first_emi_charge_paid_at IS NOT NULL
            AND COALESCE(c.first_emi_charge_amount, 0) > 0
        ) x
        JOIN retailers r ON r.id = x.rid
        WHERE EXTRACT(YEAR  FROM x.cdate) = p_year
          AND EXTRACT(MONTH FROM x.cdate) = p_month
        GROUP BY r.id, r.name
        HAVING SUM(x.amt) > 0
        ORDER BY total DESC
      ) s
    )
  );
END;
$$;

-- NOTE: apply_overdue_fines() (004) and calculate_and_apply_fines() (007/010)
-- are deliberately NOT (re)created. No app code calls either (only
-- recalc_all_fines / recalc_customer_fines are called — app/api/fines/recalc,
-- app/api/payments/reject, lib/paymentReconcile.ts), and databases provisioned
-- from fresh_supabase_schema.sql never had them. If they exist they are locked
-- down in SECTION 11; if they do not exist nothing references them.

-- ============================================================================
-- SECTION 9: TRIGGERS
-- ============================================================================

-- 014: legacy auto-apply triggers must stay gone. On a DB that ever ran
-- 999_full_schema.sql they would re-apply fine_paid_amount a second time on
-- every approval (the RPC flips status → trigger adds the fine again).
DROP TRIGGER IF EXISTS trg_auto_apply ON payment_requests;
DROP TRIGGER IF EXISTS trg_auto_apply_payment_on_approval ON payment_requests;
DROP FUNCTION IF EXISTS fn_auto_apply_payment_on_approval();

-- Customer EMI-generation triggers — restore the lineage this DB was built on.
--
--   FRESH lineage (fresh_supabase_schema.sql:333-341, the ONLY repo file that
--   creates fn_set_updated_at + trg_updated_at):
--     after_customer_insert → fn_generate_emi_schedule()
--     after_customer_update AFTER UPDATE OF emi_amount, emi_tenure,
--                           emi_due_day, emi_start_date → fn_generate_emi_schedule()
--       (on edit deletes only UNPAID rows; paid history is kept)
--     trg_auto_complete does NOT exist in this lineage.
--
--   MIGRATION lineage (001 / 010):
--     after_customer_insert → trigger_generate_emi_schedule()
--     after_customer_update → trigger_regenerate_emi_on_update()
--     trg_auto_complete ON emi_schedule → fn_check_auto_complete()   (010)
--
-- The working-copy upgrade forced the MIGRATION binding onto every database.
-- On a fresh-lineage DB that made every finance edit of a customer call
-- generate_emi_schedule(), which deletes ALL of that customer's EMI rows
-- (paid ones included), and added an auto-complete trigger the DB never had.
-- Fingerprint used: a trg_updated_at trigger on customers or emi_schedule.
DO $$
DECLARE v_fresh BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE NOT t.tgisinternal AND t.tgname = 'trg_updated_at'
      AND t.tgrelid IN ('public.customers'::regclass, 'public.emi_schedule'::regclass)
  ) INTO v_fresh;

  DROP TRIGGER IF EXISTS after_customer_insert ON customers;
  DROP TRIGGER IF EXISTS after_customer_update ON customers;

  IF v_fresh THEN
    CREATE TRIGGER after_customer_insert
      AFTER INSERT ON customers
      FOR EACH ROW EXECUTE FUNCTION fn_generate_emi_schedule();
    CREATE TRIGGER after_customer_update
      AFTER UPDATE OF emi_amount, emi_tenure, emi_due_day, emi_start_date ON customers
      FOR EACH ROW EXECUTE FUNCTION fn_generate_emi_schedule();
    DROP TRIGGER IF EXISTS trg_auto_complete ON emi_schedule;
    RAISE NOTICE 'EMI triggers: FRESH-schema lineage detected — bound to fn_generate_emi_schedule(); trg_auto_complete not present.';
  ELSE
    CREATE TRIGGER after_customer_insert
      AFTER INSERT ON customers
      FOR EACH ROW EXECUTE FUNCTION trigger_generate_emi_schedule();
    CREATE TRIGGER after_customer_update
      AFTER UPDATE ON customers
      FOR EACH ROW EXECUTE FUNCTION trigger_regenerate_emi_on_update();
    DROP TRIGGER IF EXISTS trg_auto_complete ON emi_schedule;
    CREATE TRIGGER trg_auto_complete
      AFTER UPDATE ON emi_schedule
      FOR EACH ROW EXECUTE FUNCTION fn_check_auto_complete();
    RAISE NOTICE 'EMI triggers: MIGRATION lineage (001/010) — bound to trigger_generate_emi_schedule / trigger_regenerate_emi_on_update; trg_auto_complete present.';
  END IF;
END $$;

-- trg_assign_customer_code is (re)created in SECTION 4.

-- ============================================================================
-- SECTION 9B: DEVICE MANAGEMENT TABLES             (030, verbatim)
-- Two new, empty tables for the consent-based device management used by the
-- Android apps. Their RLS policies are created in SECTION 10.
-- ============================================================================
CREATE TABLE IF NOT EXISTS devices (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id        UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  -- Denormalised owning retailer, resolved SERVER-SIDE from the customer at
  -- registration. Never trusted from the client. Kept in sync on re-register.
  retailer_id        UUID NOT NULL REFERENCES retailers(id) ON DELETE RESTRICT,
  -- Secure per-install identifier generated on the device (expo-application /
  -- SecureStore UUID). NOT a hardware id (no IMEI/serial harvested here).
  installation_id    TEXT NOT NULL CHECK (length(installation_id) BETWEEN 8 AND 128),
  device_model        TEXT,
  device_manufacturer TEXT,
  android_version     TEXT,
  app_version         TEXT,
  -- Lifecycle of the managed state as CONFIRMED by the device, not by intent.
  management_status  TEXT NOT NULL DEFAULT 'ACTIVE'
                       CHECK (management_status IN (
                         'ACTIVE', 'LOCK_PENDING', 'LOCKED',
                         'UNLOCK_PENDING', 'ADMIN_PERMISSION_MISSING', 'OFFLINE'
                       )),
  -- Whether the customer has granted the Android device-admin permission.
  admin_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  -- Whether the customer accepted the in-app device-management consent screen.
  consent_granted_at TIMESTAMPTZ,
  last_seen_at       TIMESTAMPTZ,
  registered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A given app install maps to exactly one customer/loan.
  UNIQUE (customer_id, installation_id)
);

CREATE INDEX IF NOT EXISTS idx_devices_customer_id  ON devices(customer_id);
CREATE INDEX IF NOT EXISTS idx_devices_retailer_id  ON devices(retailer_id);
CREATE INDEX IF NOT EXISTS idx_devices_status       ON devices(management_status);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen    ON devices(last_seen_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_devices_installation ON devices(installation_id);

-- ============================================================
-- SECTION 2: DEVICE_COMMANDS — server-authorised LOCK / UNLOCK intents
-- The command is the single source of truth. "PENDING" means requested;
-- only the device may move it to EXECUTED/FAILED after it actually runs.
-- ============================================================
CREATE TABLE IF NOT EXISTS device_commands (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id      UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  customer_id    UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  retailer_id    UUID NOT NULL REFERENCES retailers(id) ON DELETE RESTRICT,
  command_type   TEXT NOT NULL CHECK (command_type IN ('LOCK', 'UNLOCK')),
  reason         TEXT,
  -- Snapshot of the amount due when the command was issued (for the locked
  -- screen). The live value is always re-read from get_due_breakdown too.
  emi_amount     NUMERIC(12,2),
  status         TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN (
                     'PENDING', 'RECEIVED', 'EXECUTED', 'FAILED', 'EXPIRED', 'CANCELLED'
                   )),
  issued_by      UUID REFERENCES auth.users(id),
  issued_by_role TEXT CHECK (issued_by_role IN ('super_admin', 'retailer')),
  expires_at     TIMESTAMPTZ NOT NULL,
  received_at    TIMESTAMPTZ,
  executed_at    TIMESTAMPTZ,
  failure_reason TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devcmd_device_id   ON device_commands(device_id);
CREATE INDEX IF NOT EXISTS idx_devcmd_customer_id ON device_commands(customer_id);
CREATE INDEX IF NOT EXISTS idx_devcmd_retailer_id ON device_commands(retailer_id);
CREATE INDEX IF NOT EXISTS idx_devcmd_status      ON device_commands(status);
CREATE INDEX IF NOT EXISTS idx_devcmd_created_at  ON device_commands(created_at);
CREATE INDEX IF NOT EXISTS idx_devcmd_expires_at  ON device_commands(expires_at);

-- At most one in-flight (PENDING/RECEIVED) command per device — prevents a
-- backlog of duplicate LOCK/UNLOCK intents racing on the device.
CREATE UNIQUE INDEX IF NOT EXISTS uq_devcmd_active_per_device
  ON device_commands(device_id)
  WHERE status IN ('PENDING', 'RECEIVED');

-- ============================================================
-- SECTION 3: updated_at triggers (reuse existing fn_set_updated_at)
-- ============================================================
DO $$
DECLARE tbl TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_set_updated_at') THEN
    FOREACH tbl IN ARRAY ARRAY['devices', 'device_commands'] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at ON %I', tbl);
      EXECUTE format(
        'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()', tbl);
    END LOOP;
  END IF;
END $$;

GRANT SELECT ON devices          TO authenticated;
GRANT SELECT ON device_commands  TO authenticated;

-- ============================================================================
-- SECTION 10: ROW LEVEL SECURITY
-- Each final policy from migrations 001..029 is replaced BY NAME. Policies
-- that exist only because fresh_supabase_schema.sql or the committed upgrade
-- created them are removed BY NAME where they grant write access the app
-- never uses (each one justified below). No other policy is touched; any
-- remaining non-migration policy is listed in the final report.
-- ============================================================================
ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE retailers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE emi_schedule          ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log             ENABLE ROW LEVEL SECURITY;
ALTER TABLE fine_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE fine_history          ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_app_tokens   ENABLE ROW LEVEL SECURITY;

-- 001
DROP POLICY IF EXISTS "profiles_self"      ON profiles;
CREATE POLICY "profiles_self"      ON profiles FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "profiles_admin_all" ON profiles;
CREATE POLICY "profiles_admin_all" ON profiles FOR ALL USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS "retailers_admin_all" ON retailers;
CREATE POLICY "retailers_admin_all" ON retailers FOR ALL USING (get_my_role() = 'super_admin');
DROP POLICY IF EXISTS "retailers_self_read" ON retailers;
CREATE POLICY "retailers_self_read" ON retailers FOR SELECT USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "customers_admin_all" ON customers;
CREATE POLICY "customers_admin_all" ON customers FOR ALL USING (get_my_role() = 'super_admin');
DROP POLICY IF EXISTS "customers_retailer_own" ON customers;
CREATE POLICY "customers_retailer_own" ON customers FOR SELECT USING (
  get_my_role() = 'retailer' AND retailer_id = get_my_retailer_id()
);

DROP POLICY IF EXISTS "emi_admin_all" ON emi_schedule;
CREATE POLICY "emi_admin_all" ON emi_schedule FOR ALL USING (get_my_role() = 'super_admin');
DROP POLICY IF EXISTS "emi_retailer_own" ON emi_schedule;
CREATE POLICY "emi_retailer_own" ON emi_schedule FOR SELECT USING (
  get_my_role() = 'retailer' AND
  customer_id IN (SELECT id FROM customers WHERE retailer_id = get_my_retailer_id())
);

DROP POLICY IF EXISTS "payment_requests_admin_all" ON payment_requests;
CREATE POLICY "payment_requests_admin_all" ON payment_requests FOR ALL USING (get_my_role() = 'super_admin');
DROP POLICY IF EXISTS "payment_requests_retailer_own" ON payment_requests;
CREATE POLICY "payment_requests_retailer_own" ON payment_requests FOR SELECT USING (
  get_my_role() = 'retailer' AND retailer_id = get_my_retailer_id()
);

DROP POLICY IF EXISTS "payment_items_admin" ON payment_request_items;
CREATE POLICY "payment_items_admin" ON payment_request_items FOR ALL USING (get_my_role() = 'super_admin');
DROP POLICY IF EXISTS "payment_items_retailer" ON payment_request_items;
CREATE POLICY "payment_items_retailer" ON payment_request_items FOR SELECT USING (
  get_my_role() = 'retailer' AND
  payment_request_id IN (SELECT id FROM payment_requests WHERE retailer_id = get_my_retailer_id())
);

DROP POLICY IF EXISTS "audit_admin_read" ON audit_log;
CREATE POLICY "audit_admin_read" ON audit_log FOR SELECT USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS "fine_settings_admin" ON fine_settings;
CREATE POLICY "fine_settings_admin" ON fine_settings FOR ALL USING (get_my_role() = 'super_admin');
DROP POLICY IF EXISTS "fine_settings_read" ON fine_settings;
CREATE POLICY "fine_settings_read" ON fine_settings FOR SELECT USING (auth.uid() IS NOT NULL);

-- 005 / 010  (the committed upgrade widened broadcast_retailer_read with
-- "OR target_retailer_id IS NULL" and dropped broadcast_retailer_insert)
DROP POLICY IF EXISTS "broadcast_admin_all" ON broadcast_messages;
CREATE POLICY "broadcast_admin_all" ON broadcast_messages
  FOR ALL USING (get_my_role() = 'super_admin');
DROP POLICY IF EXISTS "broadcast_retailer_read" ON broadcast_messages;
CREATE POLICY "broadcast_retailer_read" ON broadcast_messages
  FOR SELECT USING (
    get_my_role() = 'retailer' AND target_retailer_id = get_my_retailer_id()
  );
DROP POLICY IF EXISTS "broadcast_retailer_insert" ON broadcast_messages;
CREATE POLICY "broadcast_retailer_insert" ON broadcast_messages FOR INSERT WITH CHECK (get_my_role() = 'retailer' AND target_retailer_id = get_my_retailer_id());

-- 010 fine_history; fh_insert = the 029 hardened version
DROP POLICY IF EXISTS "fh_admin" ON fine_history;
CREATE POLICY "fh_admin" ON fine_history FOR ALL USING (get_my_role() = 'super_admin');
DROP POLICY IF EXISTS "fh_retailer" ON fine_history;
CREATE POLICY "fh_retailer" ON fine_history FOR SELECT USING (get_my_role() = 'retailer' AND customer_id IN (SELECT id FROM customers WHERE retailer_id = get_my_retailer_id()));
DROP POLICY IF EXISTS "fh_insert" ON fine_history;
CREATE POLICY "fh_insert" ON fine_history
  FOR INSERT WITH CHECK (get_my_role() = 'super_admin');

-- 010 customer_app_tokens (010 drops app_tokens_anon_read and never recreates it)
DROP POLICY IF EXISTS "app_tokens_anon_read" ON customer_app_tokens;
DROP POLICY IF EXISTS "app_tokens_admin" ON customer_app_tokens;
CREATE POLICY "app_tokens_admin" ON customer_app_tokens FOR ALL USING (get_my_role() = 'super_admin');
DROP POLICY IF EXISTS "app_tokens_retailer" ON customer_app_tokens;
CREATE POLICY "app_tokens_retailer" ON customer_app_tokens FOR ALL USING (
  get_my_role() = 'retailer' AND
  customer_id IN (SELECT id FROM customers WHERE retailer_id = get_my_retailer_id())
);

-- ── Policies NOT in migrations 001..029, created by fresh_supabase_schema.sql
--    and/or by the committed upgrade. Removed by name. Verified against the app:
--    the only browser-session (RLS-bound) writes in app/ + components/ are
--    customers INSERT/UPDATE/DELETE from the super-admin pages
--    (components/CustomerFormModal.tsx:271-273, app/admin/page.tsx:222-295,
--    components/PhoneLockBadge.tsx:34 — toggle shown only when isAdmin), all
--    covered by customers_admin_all. Every other write uses the service-role
--    client, which bypasses RLS. mobile/ performs no table writes.
--  * customers_retailer_ins / customers_retailer_upd — let a retailer session
--    insert or rewrite its customers (status, EMI amounts, ...) straight
--    through the REST API, bypassing every server-side check.
DROP POLICY IF EXISTS "customers_retailer_ins" ON customers;
DROP POLICY IF EXISTS "customers_retailer_upd" ON customers;
--  * payment_requests_retailer_ins — lets a retailer insert payment_requests
--    rows directly (any status), bypassing submit_payment_request (028).
DROP POLICY IF EXISTS "payment_requests_retailer_ins" ON payment_requests;
--  * payment_items_ins — lets ANY retailer attach items to ANY request.
DROP POLICY IF EXISTS "payment_items_ins" ON payment_request_items;
--  * audit_service_ins — WITH CHECK (TRUE): anyone holding the anon key can
--    forge audit rows. Migration 030 drops this exact policy for this reason.
DROP POLICY IF EXISTS "audit_service_ins" ON audit_log;
--  * Duplicates of the 010 policies recreated above under other names
--    (cat_retailer_read / fine_history_read are subsets of app_tokens_retailer /
--    fh_retailer; cat_admin_all / fine_history_admin equal the admin ones).
DROP POLICY IF EXISTS "cat_admin_all"      ON customer_app_tokens;
DROP POLICY IF EXISTS "cat_retailer_read"  ON customer_app_tokens;
DROP POLICY IF EXISTS "fine_history_admin" ON fine_history;
DROP POLICY IF EXISTS "fine_history_read"  ON fine_history;

-- ── 030 policies (verbatim). The tables are created in SECTION 9B; the check
--    below only guards against a partial earlier run.
DO $$
BEGIN
  IF to_regclass('public.devices') IS NOT NULL THEN
    ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "devices_admin_all"    ON devices;
    DROP POLICY IF EXISTS "devices_retailer_sel" ON devices;
    DROP POLICY IF EXISTS "devices_retailer_upd" ON devices;
    CREATE POLICY "devices_admin_all" ON devices
      FOR ALL USING (get_my_role() = 'super_admin');
    CREATE POLICY "devices_retailer_sel" ON devices
      FOR SELECT USING (
        get_my_role() = 'retailer'
        AND customer_id IN (SELECT id FROM customers WHERE retailer_id = get_my_retailer_id())
      );
    CREATE POLICY "devices_retailer_upd" ON devices
      FOR UPDATE USING (
        get_my_role() = 'retailer'
        AND retailer_id = get_my_retailer_id()
      ) WITH CHECK (
        get_my_role() = 'retailer'
        AND retailer_id = get_my_retailer_id()
        AND customer_id IN (SELECT id FROM customers WHERE retailer_id = get_my_retailer_id())
      );
    -- 030 SECTION 5
    DROP POLICY IF EXISTS "audit_admin_ins" ON audit_log;
    CREATE POLICY "audit_admin_ins" ON audit_log
      FOR INSERT WITH CHECK (get_my_role() = 'super_admin');
    RAISE NOTICE '030 detected: devices + audit_admin_ins policies restored.';
  END IF;
  IF to_regclass('public.device_commands') IS NOT NULL THEN
    ALTER TABLE device_commands ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "devcmd_admin_all"    ON device_commands;
    DROP POLICY IF EXISTS "devcmd_retailer_sel" ON device_commands;
    CREATE POLICY "devcmd_admin_all" ON device_commands
      FOR ALL USING (get_my_role() = 'super_admin');
    CREATE POLICY "devcmd_retailer_sel" ON device_commands
      FOR SELECT USING (
        get_my_role() = 'retailer'
        AND retailer_id = get_my_retailer_id()
      );
  END IF;
END $$;

-- ============================================================================
-- SECTION 11: GRANTS / REVOKES
-- ============================================================================
-- 010
GRANT SELECT ON customer_app_tokens TO anon;
GRANT SELECT, INSERT, UPDATE ON customer_app_tokens TO authenticated;
GRANT ALL ON customer_app_tokens TO service_role;

-- 001
GRANT EXECUTE ON FUNCTION get_my_role()        TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_retailer_id() TO authenticated;

-- 028 PART A2 / B1 — internal RPCs, service_role only.
-- 028's stated intent is "locks those functions down to service_role only".
-- On Supabase, new public functions also get EXPLICIT EXECUTE grants for anon
-- and authenticated (default privileges), which "REVOKE ... FROM PUBLIC" does
-- not remove — so anon/authenticated are revoked explicitly as well. Verified
-- callers all use the service-role client: submit (app/api/payments/submit),
-- approve (app/api/payments/approve, app/api/admin/approve-request),
-- recalc_customer_fines (app/api/payments/reject, lib/paymentReconcile.ts),
-- recalc_all_fines (app/api/fines/recalc).
REVOKE EXECUTE ON FUNCTION submit_payment_request(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, UUID[], INT[], NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, INT, DATE, JSONB, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION submit_payment_request(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, UUID[], INT[], NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, INT, DATE, JSONB, TEXT, BOOLEAN) TO service_role;

REVOKE EXECUTE ON FUNCTION approve_payment_request(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION approve_payment_request(UUID, UUID, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION recalc_customer_fines(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION recalc_customer_fines(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION recalc_all_fines() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION recalc_all_fines() TO service_role;

REVOKE EXECUTE ON FUNCTION _emi_period_metrics(INT, INT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION _emi_period_metrics(INT, INT) TO service_role;

-- 028 PART B2 / B3 — browser-callable, guarded inside the function.
-- Called from authenticated sessions only (components/analytics/AnalyticsPro.tsx,
-- components/reports/ReportsHub.tsx, app/admin/page.tsx, app/retailer/page.tsx,
-- app/noc/[id]/page.tsx — all behind login). anon is revoked: get_due_breakdown
-- treats auth.uid() IS NULL as a trusted service-role call, which an anon
-- request would also satisfy.
REVOKE EXECUTE ON FUNCTION get_emi_analysis(INT, INT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_emi_analysis(INT, INT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION get_due_breakdown(UUID, INT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_due_breakdown(UUID, INT) TO authenticated, service_role;

-- Functions that may or may not exist depending on how the DB was provisioned.
-- Each statement runs ONLY if the function exists — nothing is created here.
DO $$
BEGIN
  -- 004 / 028
  IF to_regprocedure('public.apply_overdue_fines()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION apply_overdue_fines() FROM PUBLIC, anon, authenticated;
    GRANT  EXECUTE ON FUNCTION apply_overdue_fines() TO service_role;
  END IF;
  -- 007 / 010 / 028
  IF to_regprocedure('public.calculate_and_apply_fines()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION calculate_and_apply_fines() FROM PUBLIC, anon, authenticated;
    GRANT  EXECUTE ON FUNCTION calculate_and_apply_fines() TO service_role;
  END IF;
  -- 010 left a 2-argument SECURITY DEFINER approve_payment_request(uuid, uuid)
  -- that approves any PENDING request and was never revoked. Not called by the
  -- app (it always passes p_remark). Kept, locked to service_role.
  IF to_regprocedure('public.approve_payment_request(uuid, uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION approve_payment_request(UUID, UUID) FROM PUBLIC, anon, authenticated;
    GRANT  EXECUTE ON FUNCTION approve_payment_request(UUID, UUID) TO service_role;
  END IF;
  -- 001 get_due_breakdown(uuid): superseded by get_due_breakdown(uuid, int
  -- DEFAULT NULL) since migration 002, and has no ownership guard. While both
  -- exist, every one-argument call — app/api/customer-login, customer-app-token,
  -- noc page, admin & retailer pages — fails with "function is not unique"
  -- (reproduced in testing). Removing it makes those calls resolve to the
  -- guarded 2-argument version. A function, not data.
  IF to_regprocedure('public.get_due_breakdown(uuid)') IS NOT NULL THEN
    DROP FUNCTION public.get_due_breakdown(uuid);
    RAISE NOTICE 'Removed legacy get_due_breakdown(uuid) (made one-argument calls ambiguous).';
  END IF;
END $$;

-- ============================================================================
-- SECTION 11B: SUPABASE SECURITY ADVISOR FIXES
-- (a) lint 0011 "Function Search Path Mutable": pin search_path on every
--     function from this repository. None of their bodies uses an object
--     outside public except auth.uid(), which is schema-qualified.
-- (b) lints 0028 / 0029 "SECURITY DEFINER function executable": trigger-only
--     and internal functions cannot be called over the REST API any more.
--     Triggers keep firing (PostgreSQL does not check EXECUTE for triggers).
--     Intentionally left callable: get_my_role / get_my_retailer_id (every
--     RLS policy calls them), get_due_breakdown / get_emi_analysis (called by
--     the admin / retailer pages; both check the caller inside, migration 028).
-- (c) lint 0010 "Security Definer View": handled in SECTION 7.
-- Functions that are not in this repository (force_reset_telepoint_admin,
-- handle_new_portal_user) only have EXECUTE revoked, and only if they exist.
-- ============================================================================
DO $$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.get_my_role()',
    'public.get_my_retailer_id()',
    'public.to_code36(bigint)',
    'public.next_customer_code()',
    'public.assign_customer_code()',
    'public.generate_emi_schedule(uuid)',
    'public.trigger_generate_emi_schedule()',
    'public.trigger_regenerate_emi_on_update()',
    'public.fn_generate_emi_schedule()',
    'public.fn_check_auto_complete()',
    'public.fn_set_updated_at()',
    'public.recalc_customer_fines(uuid)',
    'public.recalc_all_fines()',
    'public.get_due_breakdown(uuid, integer)',
    'public.approve_payment_request(uuid, uuid, text)',
    'public.submit_payment_request(uuid, uuid, uuid, text, text, text, uuid[], integer[], numeric, numeric, numeric, numeric, numeric, integer, date, jsonb, text, boolean)',
    'public._emi_period_metrics(integer, integer)',
    'public.get_emi_analysis(integer, integer)',
    -- legacy functions: only present on some databases
    'public.approve_payment_request(uuid, uuid)',
    'public.apply_overdue_fines()',
    'public.calculate_and_apply_fines()'
  ]
  LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', f);
    ELSE
      RAISE NOTICE 'skipped (not present): %', f;
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  -- Trigger-only functions — never meant to be called over the API.
  IF to_regprocedure('public.fn_check_auto_complete()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.fn_check_auto_complete() FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.fn_generate_emi_schedule()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.fn_generate_emi_schedule() FROM PUBLIC, anon, authenticated;
  END IF;

  -- generate_emi_schedule(uuid) DELETES a customer's whole EMI schedule and
  -- rebuilds it, so it must never be callable over the API. On databases
  -- built from migrations 001/010 the customer triggers call it through
  -- trigger_generate_emi_schedule / trigger_regenerate_emi_on_update, which
  -- run as the signed-in admin. Making those two trigger functions SECURITY
  -- DEFINER (owner rights, same as generate_emi_schedule itself) lets the
  -- triggers keep working after EXECUTE is revoked. Bodies are unchanged.
  IF to_regprocedure('public.trigger_generate_emi_schedule()') IS NOT NULL THEN
    ALTER FUNCTION public.trigger_generate_emi_schedule() SECURITY DEFINER;
    REVOKE EXECUTE ON FUNCTION public.trigger_generate_emi_schedule() FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.trigger_regenerate_emi_on_update()') IS NOT NULL THEN
    ALTER FUNCTION public.trigger_regenerate_emi_on_update() SECURITY DEFINER;
    REVOKE EXECUTE ON FUNCTION public.trigger_regenerate_emi_on_update() FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.generate_emi_schedule(uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.generate_emi_schedule(uuid) FROM PUBLIC, anon, authenticated;
  END IF;

  -- NOT in the repository and NOT called by the app. By its name it resets
  -- the admin account, and right now anyone on the internet can call it.
  -- Locked (not deleted): service_role and the dashboard can still use it.
  IF to_regprocedure('public.force_reset_telepoint_admin()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.force_reset_telepoint_admin() FROM PUBLIC, anon, authenticated;
  END IF;

  -- NOT in the repository. By its name it is a trigger on new sign-ups;
  -- a trigger keeps firing after EXECUTE is revoked.
  IF to_regprocedure('public.handle_new_portal_user()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.handle_new_portal_user() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- ============================================================================
-- SECTION 12: PG_CRON (017) — only if pg_cron is installed.
-- Ensures 017's 'recalc-fines-daily' job exists. 010's 'calculate-fines-daily'
-- job is neither created nor removed; its state is shown in the report.
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('recalc-fines-daily')
        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recalc-fines-daily');
      PERFORM cron.schedule('recalc-fines-daily', '30 18 * * *', $cron$SELECT recalc_all_fines();$cron$);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'pg_cron job recalc-fines-daily could not be (re)scheduled: %', SQLERRM;
    END;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- SECTION 13: FINAL REPORT (read-only — changes nothing)
-- Every row with status <> 'OK' needs a human decision. Nothing listed here
-- was modified by this script.
-- ============================================================================
WITH
settled_waived_filled AS (
  -- Fingerprint of the COMMITTED upgrade's data backfill
  --   UPDATE emi_schedule SET partial_paid_amount = amount
  --   WHERE status = 'APPROVED' AND COALESCE(partial_paid_amount,0) = 0 AND amount > 0
  -- /api/settlement marks the unpaid tail APPROVED with partial_paid_amount = 0,
  -- and app/api/metrics/route.ts:199-205 relies on that 0 to count the tail as
  -- NOT recovered. Every app/RPC path that writes partial_paid_amount also sets
  -- partial_paid_at; that backfill did not. These rows now make the booked
  -- Loss of SETTLED customers too small (it can turn negative).
  SELECT es.id, es.customer_id, es.amount, es.updated_at
  FROM emi_schedule es
  JOIN customers c ON c.id = es.customer_id
  WHERE c.status = 'SETTLED'
    AND es.status = 'APPROVED'
    AND es.amount > 0
    AND COALESCE(es.partial_paid_amount, 0) >= es.amount
    AND es.partial_paid_at IS NULL
    AND (es.paid_at IS NULL
         OR es.paid_at::date >= COALESCE(c.settlement_date, c.completion_date))
),
loss_by_customer AS (
  -- Mirror of the booked-loss formula in app/api/metrics/route.ts:172-215.
  SELECT c.id, c.status,
         GREATEST(0, COALESCE(c.purchase_value, 0) - COALESCE(c.down_payment, 0)) AS loan_value,
         COALESCE(SUM(
           CASE
             WHEN c.status = 'SETTLED' AND COALESCE(c.settlement_date, c.completion_date) IS NOT NULL
                  AND es.status = 'APPROVED'
                  AND (es.paid_at IS NULL OR es.paid_at::date >= COALESCE(c.settlement_date, c.completion_date))
               THEN LEAST(COALESCE(es.amount, 0), COALESCE(es.partial_paid_amount, 0))
             WHEN es.status = 'APPROVED' THEN COALESCE(es.amount, 0)
             ELSE LEAST(COALESCE(es.amount, 0), COALESCE(es.partial_paid_amount, 0))
           END), 0)
         + COALESCE(SUM(COALESCE(es.fine_paid_amount, 0)), 0)
         + CASE WHEN COALESCE(c.first_emi_charge_amount, 0) <= 0 THEN 0
                WHEN c.first_emi_charge_paid_at IS NOT NULL THEN c.first_emi_charge_amount
                ELSE LEAST(c.first_emi_charge_amount, GREATEST(0, COALESCE(c.first_emi_charge_paid_amount, 0))) END
         + CASE WHEN c.status = 'SETTLED' AND COALESCE(c.settlement_date, c.completion_date) IS NOT NULL
                THEN COALESCE(c.settlement_amount, 0) ELSE 0 END AS recovered
  FROM customers c
  LEFT JOIN emi_schedule es ON es.customer_id = c.id
  WHERE c.status IN ('NPA', 'SETTLED')
  GROUP BY c.id
),
dup_pending AS (
  SELECT customer_id, COUNT(*) AS cnt, string_agg(id::text, ',' ORDER BY created_at) AS ids
  FROM payment_requests WHERE status = 'PENDING'
  GROUP BY customer_id HAVING COUNT(*) > 1
),
orphan_pending_emi AS (
  -- EMI waiting for approval but its customer has NO pending request → the
  -- admin has nothing to approve/reject; it stays "VERIFYING" forever.
  SELECT es.id, es.customer_id, es.emi_no
  FROM emi_schedule es
  WHERE es.status = 'PENDING_APPROVAL'
    AND NOT EXISTS (SELECT 1 FROM payment_requests pr
                    WHERE pr.customer_id = es.customer_id AND pr.status = 'PENDING')
),
pending_item_not_pending_emi AS (
  -- Fingerprint of the COMMITTED upgrade's "normalize impossible states"
  -- UPDATE, which flipped PENDING_APPROVAL rows with a partial payment to
  -- PARTIALLY_PAID / APPROVED while their request was still PENDING.
  SELECT pri.payment_request_id, es.id AS emi_id, es.status
  FROM payment_requests pr
  JOIN payment_request_items pri ON pri.payment_request_id = pr.id
  JOIN emi_schedule es ON es.id = pri.emi_schedule_id
  WHERE pr.status = 'PENDING' AND es.status <> 'PENDING_APPROVAL'
),
pending_no_items AS (
  SELECT pr.id FROM payment_requests pr
  WHERE pr.status = 'PENDING'
    AND COALESCE(array_length(pr.selected_emi_nos, 1), 0) > 0
    AND NOT EXISTS (SELECT 1 FROM payment_request_items pri WHERE pri.payment_request_id = pr.id)
),
first_charge_overstamped AS (
  -- The COMMITTED upgrade installed the 022 approve_payment_request, which sets
  -- first_emi_charge_paid_at on ANY first-charge payment (no partial support).
  -- Customers marked "fully paid" although approved requests cover less.
  SELECT c.id
  FROM customers c
  JOIN payment_requests pr ON pr.customer_id = c.id AND pr.status = 'APPROVED'
  WHERE c.first_emi_charge_paid_at IS NOT NULL AND COALESCE(c.first_emi_charge_amount, 0) > 0
  GROUP BY c.id, c.first_emi_charge_amount
  HAVING SUM(COALESCE(pr.first_emi_charge_amount, 0)) > 0
     AND SUM(COALESCE(pr.first_emi_charge_amount, 0)) < c.first_emi_charge_amount
),
extra_policies AS (
  SELECT tablename || '.' || policyname AS p
  FROM pg_policies
  WHERE schemaname = 'public'
    AND NOT (policyname = ANY (ARRAY[
      'profiles_self','profiles_admin_all','retailers_admin_all','retailers_self_read',
      'customers_admin_all','customers_retailer_own','emi_admin_all','emi_retailer_own',
      'payment_requests_admin_all','payment_requests_retailer_own','payment_items_admin',
      'payment_items_retailer','audit_admin_read','fine_settings_admin','fine_settings_read',
      'broadcast_admin_all','broadcast_retailer_read','broadcast_retailer_insert',
      'fh_admin','fh_retailer','fh_insert','app_tokens_admin','app_tokens_retailer',
      'devices_admin_all','devices_retailer_sel','devices_retailer_upd',
      'devcmd_admin_all','devcmd_retailer_sel','audit_admin_ins']))
)
SELECT * FROM (
  SELECT 1 AS n, 'One-PENDING-per-customer unique index (028)' AS check_name,
    CASE WHEN to_regclass('public.uniq_payment_requests_customer_pending') IS NOT NULL THEN 'OK'
         ELSE 'ACTION REQUIRED' END AS status,
    (SELECT COUNT(*) FROM dup_pending)::text AS count,
    COALESCE((SELECT string_agg('customer ' || customer_id || ' -> requests ' || ids, ' | ') FROM dup_pending),
             'no duplicates') AS detail
  UNION ALL
  SELECT 2, 'SETTLED waived-tail EMIs with partial_paid_amount filled by the old backfill',
    CASE WHEN (SELECT COUNT(*) FROM settled_waived_filled) = 0 THEN 'OK' ELSE 'REVIEW — understates Loss' END,
    (SELECT COUNT(*) FROM settled_waived_filled)::text,
    COALESCE((SELECT 'customers=' || COUNT(DISTINCT customer_id) || ', rupees wrongly counted as recovered=' || SUM(amount)
                     || ', emi.updated_at range=' || COALESCE(MIN(updated_at)::text, '?') || ' .. ' || COALESCE(MAX(updated_at)::text, '?')
              FROM settled_waived_filled WHERE EXISTS (SELECT 1 FROM settled_waived_filled)), 'none')
  UNION ALL
  SELECT 3, 'NPA/SETTLED customers whose booked loss (loan − recovered) is NEGATIVE',
    CASE WHEN (SELECT COUNT(*) FROM loss_by_customer WHERE loan_value - recovered < 0) = 0 THEN 'OK'
         ELSE 'REVIEW — Net shown as Profit + |Loss|' END,
    (SELECT COUNT(*) FROM loss_by_customer WHERE loan_value - recovered < 0)::text,
    COALESCE((SELECT 'sum of negative per-customer loss=' || SUM(loan_value - recovered)
                     || '; app formula total=' || (SELECT SUM(loan_value - recovered) FROM loss_by_customer)
                     || '; clamped GREATEST(0,..) total=' || (SELECT SUM(GREATEST(0, loan_value - recovered)) FROM loss_by_customer)
              FROM loss_by_customer WHERE loan_value - recovered < 0), 'none')
  UNION ALL
  SELECT 4, 'EMIs PENDING_APPROVAL with no PENDING request for that customer',
    CASE WHEN (SELECT COUNT(*) FROM orphan_pending_emi) = 0 THEN 'OK' ELSE 'REVIEW' END,
    (SELECT COUNT(*) FROM orphan_pending_emi)::text,
    COALESCE((SELECT string_agg(customer_id || '#' || emi_no, ', ') FROM (SELECT * FROM orphan_pending_emi LIMIT 50) s), 'none')
  UNION ALL
  SELECT 5, 'PENDING requests whose linked EMI is no longer PENDING_APPROVAL',
    CASE WHEN (SELECT COUNT(*) FROM pending_item_not_pending_emi) = 0 THEN 'OK' ELSE 'REVIEW' END,
    (SELECT COUNT(*) FROM pending_item_not_pending_emi)::text,
    COALESCE((SELECT string_agg(payment_request_id || ':' || emi_id || '=' || status, ', ') FROM (SELECT * FROM pending_item_not_pending_emi LIMIT 50) s), 'none')
  UNION ALL
  SELECT 6, 'PENDING requests with selected EMIs but no payment_request_items',
    CASE WHEN (SELECT COUNT(*) FROM pending_no_items) = 0 THEN 'OK' ELSE 'REVIEW — approval would not update EMIs' END,
    (SELECT COUNT(*) FROM pending_no_items)::text,
    COALESCE((SELECT string_agg(id::text, ', ') FROM (SELECT * FROM pending_no_items LIMIT 50) s), 'none')
  UNION ALL
  SELECT 7, 'First-EMI charge marked fully paid but approved requests cover less',
    CASE WHEN (SELECT COUNT(*) FROM first_charge_overstamped) = 0 THEN 'OK' ELSE 'REVIEW' END,
    (SELECT COUNT(*) FROM first_charge_overstamped)::text,
    COALESCE((SELECT string_agg(id::text, ', ') FROM (SELECT * FROM first_charge_overstamped LIMIT 50) s), 'none')
  UNION ALL
  SELECT 8, 'EMI trigger lineage now bound',
    'INFO',
    '',
    COALESCE((SELECT string_agg(t.tgname || '→' || p.proname, ', ' ORDER BY t.tgname)
              FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
              WHERE NOT t.tgisinternal
                AND t.tgrelid IN ('public.customers'::regclass, 'public.emi_schedule'::regclass)
                AND t.tgname IN ('after_customer_insert','after_customer_update','trg_auto_complete','trg_assign_customer_code')), 'none')
  UNION ALL
  SELECT 9, 'Policies not defined by migrations 001-030 (left untouched)',
    CASE WHEN (SELECT COUNT(*) FROM extra_policies) = 0 THEN 'OK' ELSE 'REVIEW' END,
    (SELECT COUNT(*) FROM extra_policies)::text,
    COALESCE((SELECT string_agg(p, ', ') FROM extra_policies), 'none')
  UNION ALL
  SELECT 10, 'Legacy get_due_breakdown(uuid) overload (001) still present',
    CASE WHEN to_regprocedure('public.get_due_breakdown(uuid)') IS NULL THEN 'OK'
         ELSE 'REVIEW — one-argument RPC calls may be ambiguous' END,
    CASE WHEN to_regprocedure('public.get_due_breakdown(uuid)') IS NULL THEN '0' ELSE '1' END,
    'removed by this script when present'
  UNION ALL
  SELECT 11, 'customer_code values not matching ^TP[0-9A-Z]{4}$ (not changed)',
    CASE WHEN (SELECT COUNT(*) FROM customers WHERE customer_code IS NULL OR customer_code !~ '^TP[0-9A-Z]{4}$') = 0
         THEN 'OK' ELSE 'REVIEW' END,
    (SELECT COUNT(*) FROM customers WHERE customer_code IS NULL OR customer_code !~ '^TP[0-9A-Z]{4}$')::text,
    COALESCE((SELECT string_agg(id || '=' || COALESCE(customer_code, 'NULL'), ', ')
              FROM (SELECT id, customer_code FROM customers
                    WHERE customer_code IS NULL OR customer_code !~ '^TP[0-9A-Z]{4}$' LIMIT 50) s), 'none')
  UNION ALL
  SELECT 12, 'Legacy fine functions present (not created by this script)',
    'INFO',
    '',
    'apply_overdue_fines()=' || CASE WHEN to_regprocedure('public.apply_overdue_fines()') IS NULL THEN 'absent' ELSE 'present' END
    || ', calculate_and_apply_fines()=' || CASE WHEN to_regprocedure('public.calculate_and_apply_fines()') IS NULL THEN 'absent' ELSE 'present' END
    || ', approve_payment_request(uuid,uuid)=' || CASE WHEN to_regprocedure('public.approve_payment_request(uuid, uuid)') IS NULL THEN 'absent' ELSE 'present' END
) r
ORDER BY n;

-- pg_cron state (separate, because cron.job only exists when pg_cron is installed):
--   SELECT jobname, schedule, command, active FROM cron.job
--   WHERE jobname IN ('recalc-fines-daily', 'calculate-fines-daily');
