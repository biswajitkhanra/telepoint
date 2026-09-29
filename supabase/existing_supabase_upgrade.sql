-- ============================================================
-- EMI PORTAL — EXISTING SUPABASE UPGRADE  (forward-only, to migration 029)
--
-- Paste into Supabase -> SQL Editor -> Run.
--
-- PURPOSE
--   Brings an EXISTING database FORWARD to the exact state produced by
--   migrations/001 .. 029 (migrations/ is the source of truth; 999_full_schema.sql
--   and fresh_supabase_schema.sql are NOT used as a reference).
--   Migration 030 (device management) is intentionally NOT included.
--
-- GUARANTEES
--   * Never drops a table, column, or row. No customer / EMI / payment data is
--     deleted or overwritten. No rollback of anything.
--   * Idempotent: safe to run repeatedly, and safe on a DB that is at any point
--     between migration 001 and 029.
--   * Policies: only the specific policies defined by the migration chain are
--     replaced (by name). Nothing else is dropped.
--   * Duplicate PENDING payment requests are NEVER deleted or merged. If they
--     exist, the unique index from migration 028 is skipped and every conflict
--     is reported with a WARNING (see SECTION 6). Fix them, then re-run.
--   * The old data-normalising steps of migrations 007/010/014 (fine engine
--     runs, "normalize impossible states") are NOT re-run: on a live database
--     they can reset PENDING_APPROVAL rows or wipe mode/utr. Only the safe,
--     additive backfills are performed.
-- ============================================================

-- ============================================================
-- SECTION 0: PRE-FLIGHT — the core tables from migration 001 must exist
-- ============================================================
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
    RAISE EXCEPTION 'Not an existing EMI Portal database — missing core tables:%. Use fresh_supabase_schema.sql or run migrations 001+ first.', missing;
  END IF;
END $$;

-- ============================================================
-- SECTION 1: EXTENSIONS + IST TIMEZONE   (001, 026, 015)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Asia/Kolkata');
END $$;

-- ============================================================
-- SECTION 2: COLUMNS + TABLES (additive only)
-- ============================================================

-- The 014 backfill must run only when partial_paid_amount is first introduced.
-- Remember whether it already exists before it is added below.
CREATE TEMP TABLE IF NOT EXISTS _upg_flags (k TEXT PRIMARY KEY, v BOOLEAN);
DELETE FROM _upg_flags;
INSERT INTO _upg_flags
SELECT 'partial_col_existed', EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'emi_schedule'
    AND column_name = 'partial_paid_amount');

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

-- emi_schedule (002, 007, 010, 014, 019, 021, 022)
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

-- fine_settings (010)
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

-- ============================================================
-- SECTION 3: CHECK CONSTRAINTS  (006/007/010, 014, 016)
-- Existing rows already satisfy these (they only widen the old ones).
-- ============================================================
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_status_check;
ALTER TABLE customers ADD CONSTRAINT customers_status_check
  CHECK (status IN ('RUNNING', 'COMPLETE', 'SETTLED', 'NPA'));

ALTER TABLE emi_schedule DROP CONSTRAINT IF EXISTS emi_schedule_status_check;
ALTER TABLE emi_schedule ADD CONSTRAINT emi_schedule_status_check
  CHECK (status IN ('UNPAID', 'PENDING_APPROVAL', 'PARTIALLY_PAID', 'APPROVED'));

-- 016: EMI due day may be up to 30 (was 28)
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_emi_due_day_check;
ALTER TABLE customers ADD CONSTRAINT customers_emi_due_day_check
  CHECK (emi_due_day BETWEEN 1 AND 30);

-- ============================================================
-- SECTION 4: CUSTOMER CODE  (025)
-- ============================================================
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

-- Backfill only customers without a valid TP + 4-char code (existing codes kept).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM customers
    WHERE customer_code IS NULL OR customer_code !~ '^TP[0-9A-Z]{4}$'
    ORDER BY created_at ASC, id ASC
  LOOP
    UPDATE customers SET customer_code = next_customer_code() WHERE id = r.id;
  END LOOP;
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

CREATE UNIQUE INDEX IF NOT EXISTS customers_customer_code_key ON customers (customer_code);

-- ============================================================
-- SECTION 5: SAFE, ADDITIVE DATA BACKFILLS
-- ============================================================

-- 014: only when partial_paid_amount was JUST introduced — treat already
-- APPROVED EMIs as fully collected. (Skipped on DBs that already had the column,
-- so live partial-payment data is never touched.)
DO $$
BEGIN
  IF NOT (SELECT v FROM _upg_flags WHERE k = 'partial_col_existed') THEN
    UPDATE emi_schedule
    SET partial_paid_amount = amount,
        partial_paid_at     = COALESCE(partial_paid_at, paid_at, NOW())
    WHERE status = 'APPROVED' AND COALESCE(partial_paid_amount, 0) < amount;
    UPDATE emi_schedule
    SET partial_paid_at = COALESCE(partial_paid_at, paid_at, NOW())
    WHERE status = 'PARTIALLY_PAID' AND partial_paid_at IS NULL;
  END IF;
END $$;

-- 027: a first-EMI charge already marked fully paid is fully collected.
UPDATE customers
SET first_emi_charge_paid_amount = first_emi_charge_amount
WHERE first_emi_charge_paid_at IS NOT NULL
  AND COALESCE(first_emi_charge_paid_amount, 0) < COALESCE(first_emi_charge_amount, 0);

-- 003: repair PENDING requests that have selected_emi_nos but no items.
INSERT INTO payment_request_items (payment_request_id, emi_schedule_id, emi_no, amount)
SELECT pr.id, es.id, es.emi_no,
       pr.total_emi_amount / GREATEST(array_length(pr.selected_emi_nos, 1), 1)
FROM payment_requests pr
JOIN LATERAL UNNEST(pr.selected_emi_nos) AS sn(emi_no) ON TRUE
JOIN emi_schedule es ON es.customer_id = pr.customer_id AND es.emi_no = sn.emi_no
WHERE pr.status = 'PENDING'
  AND pr.selected_emi_nos IS NOT NULL
  AND array_length(pr.selected_emi_nos, 1) > 0
  AND NOT EXISTS (SELECT 1 FROM payment_request_items pri WHERE pri.payment_request_id = pr.id)
ON CONFLICT DO NOTHING;

-- ============================================================
-- SECTION 6: ONE PENDING REQUEST PER CUSTOMER  (028 PART A1)
-- Existing duplicates are reported, never deleted or merged.
-- ============================================================
DO $$
DECLARE
  d RECORD;
  n INT := 0;
BEGIN
  IF to_regclass('public.uniq_payment_requests_customer_pending') IS NOT NULL THEN
    RAISE NOTICE '028: uniq_payment_requests_customer_pending already exists.';
    RETURN;
  END IF;

  FOR d IN
    SELECT customer_id, COUNT(*) AS cnt,
           array_agg(id ORDER BY created_at, id) AS request_ids
    FROM payment_requests
    WHERE status = 'PENDING'
    GROUP BY customer_id
    HAVING COUNT(*) > 1
    ORDER BY customer_id
  LOOP
    n := n + 1;
    RAISE WARNING 'DUPLICATE PENDING payment_requests: customer_id=% has % PENDING rows: %',
      d.customer_id, d.cnt, d.request_ids;
  END LOOP;

  IF n > 0 THEN
    RAISE WARNING '028: unique index uniq_payment_requests_customer_pending was NOT created — % customer(s) have multiple PENDING requests (listed above). Nothing was deleted. Approve or reject the extras in the admin panel, then re-run this script.', n;
  ELSE
    EXECUTE 'CREATE UNIQUE INDEX uniq_payment_requests_customer_pending
             ON payment_requests(customer_id) WHERE status = ''PENDING''';
    RAISE NOTICE '028: uniq_payment_requests_customer_pending created.';
  END IF;
END $$;

-- ============================================================
-- SECTION 7: INDEXES  (001, 010, 014, 018, 020, 022, 023, 026)
-- ============================================================
-- 001
CREATE INDEX IF NOT EXISTS idx_customers_imei              ON customers(imei);
CREATE INDEX IF NOT EXISTS idx_customers_aadhaar           ON customers(aadhaar);
CREATE INDEX IF NOT EXISTS idx_customers_mobile            ON customers(mobile);
CREATE INDEX IF NOT EXISTS idx_customers_retailer_id       ON customers(retailer_id);
CREATE INDEX IF NOT EXISTS idx_customers_status            ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_name              ON customers USING gin(to_tsvector('english', customer_name));
CREATE INDEX IF NOT EXISTS idx_emi_schedule_customer_id    ON emi_schedule(customer_id);
CREATE INDEX IF NOT EXISTS idx_emi_schedule_due_date       ON emi_schedule(due_date);
CREATE INDEX IF NOT EXISTS idx_emi_schedule_status         ON emi_schedule(status);
CREATE INDEX IF NOT EXISTS idx_payment_requests_customer_id ON payment_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_retailer_id ON payment_requests(retailer_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status     ON payment_requests(status);
-- 005
CREATE INDEX IF NOT EXISTS idx_broadcast_retailer          ON broadcast_messages(target_retailer_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_expires           ON broadcast_messages(expires_at);
-- 010
CREATE INDEX IF NOT EXISTS idx_fine_history_cust           ON fine_history(customer_id);
CREATE INDEX IF NOT EXISTS idx_fine_history_emi            ON fine_history(emi_schedule_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_utr        ON payment_requests(utr);
CREATE INDEX IF NOT EXISTS idx_app_tokens_customer         ON customer_app_tokens(customer_id);
CREATE INDEX IF NOT EXISTS idx_app_tokens_token            ON customer_app_tokens(token);
-- 014
CREATE INDEX IF NOT EXISTS idx_emi_schedule_partial_status ON emi_schedule(customer_id, status, emi_no);
CREATE INDEX IF NOT EXISTS idx_emi_schedule_partial_paid   ON emi_schedule(customer_id, partial_paid_amount);
-- 018
CREATE INDEX IF NOT EXISTS idx_customers_purchase_date     ON customers(purchase_date);
CREATE INDEX IF NOT EXISTS idx_customers_created_at        ON customers(created_at);
-- 020
CREATE INDEX IF NOT EXISTS idx_broadcast_customer          ON broadcast_messages(target_customer_id);
-- 022
CREATE INDEX IF NOT EXISTS idx_emi_collection_requested_at ON emi_schedule(collection_requested_at);
-- 023
CREATE INDEX IF NOT EXISTS idx_emi_paid_at                 ON emi_schedule(paid_at);
-- 026
CREATE INDEX IF NOT EXISTS idx_customers_retailer_status   ON customers (retailer_id, status);
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm         ON customers USING gin (customer_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_emi_customer_emino          ON emi_schedule (customer_id, emi_no);
CREATE INDEX IF NOT EXISTS idx_emi_status_due              ON emi_schedule (status, due_date);
CREATE INDEX IF NOT EXISTS idx_emi_due_date                ON emi_schedule (due_date);
CREATE INDEX IF NOT EXISTS idx_payreq_status_created       ON payment_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payreq_retailer_status      ON payment_requests (retailer_id, status);
CREATE INDEX IF NOT EXISTS idx_payreq_customer             ON payment_requests (customer_id);
CREATE INDEX IF NOT EXISTS idx_payreq_approved_at          ON payment_requests (approved_at);
CREATE INDEX IF NOT EXISTS idx_payreq_utr                  ON payment_requests (utr);
CREATE INDEX IF NOT EXISTS idx_broadcast_retailer_expiry   ON broadcast_messages (target_retailer_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id            ON profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_retailers_auth_user         ON retailers (auth_user_id);

-- ============================================================
-- SECTION 8: VIEW  (015)
-- ============================================================
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

-- ============================================================
-- SECTION 9: FUNCTIONS — FINAL (latest) DEFINITIONS
-- ============================================================

-- 001: helpers
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_my_retailer_id()
RETURNS UUID AS $$
  SELECT id FROM retailers WHERE auth_user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 024: EMI schedule generators (start month honoured exactly)
CREATE OR REPLACE FUNCTION generate_emi_schedule(p_customer_id UUID)
RETURNS VOID AS $$
DECLARE
  v_customer    RECORD;
  v_base_month  DATE;
  v_month_start DATE;
  v_last_day    DATE;
  v_due_date    DATE;
  i             INT;
BEGIN
  SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;

  DELETE FROM emi_schedule WHERE customer_id = p_customer_id;

  IF v_customer.emi_start_date IS NOT NULL THEN
    v_base_month := DATE_TRUNC('month', v_customer.emi_start_date)::DATE;
  ELSE
    v_base_month := (DATE_TRUNC('month', v_customer.purchase_date) + INTERVAL '1 month')::DATE;
  END IF;

  FOR i IN 0..(v_customer.emi_tenure - 1) LOOP
    v_month_start := (v_base_month + (i || ' months')::INTERVAL)::DATE;
    v_last_day    := (v_month_start + INTERVAL '1 month - 1 day')::DATE;
    v_due_date    := LEAST(v_month_start + (v_customer.emi_due_day - 1), v_last_day);

    INSERT INTO emi_schedule (customer_id, emi_no, due_date, amount)
    VALUES (p_customer_id, i + 1, v_due_date, v_customer.emi_amount);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION trigger_generate_emi_schedule()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM generate_emi_schedule(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

-- 010: auto-complete trigger function
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

-- 004: legacy fine helper (kept by the chain; locked down in SECTION 12)
CREATE OR REPLACE FUNCTION apply_overdue_fines()
RETURNS VOID AS $$
DECLARE
  v_default_fine NUMERIC;
BEGIN
  SELECT default_fine_amount INTO v_default_fine FROM fine_settings WHERE id = 1;
  IF v_default_fine IS NULL THEN v_default_fine := 450; END IF;

  UPDATE emi_schedule es
  SET fine_amount = v_default_fine
  WHERE es.status = 'UNPAID'
    AND es.fine_waived = FALSE
    AND es.fine_amount = 0
    AND es.due_date < CURRENT_DATE
    AND es.emi_no = (
      SELECT MIN(e2.emi_no)
      FROM emi_schedule e2
      WHERE e2.customer_id = es.customer_id
        AND e2.status = 'UNPAID'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 010: legacy fine engine (superseded by 017 recalc_*, kept by the chain)
CREATE OR REPLACE FUNCTION calculate_and_apply_fines()
RETURNS TABLE(updated_count INT) AS $$
DECLARE
  v_base NUMERIC; v_weekly NUMERIC; v_count INT := 0;
  v_emi RECORD; v_days INT; v_weeks INT; v_calc NUMERIC; v_old NUMERIC;
  v_is_last BOOLEAN; v_blocks INT;
BEGIN
  SELECT default_fine_amount, COALESCE(weekly_fine_increment, 25)
  INTO v_base, v_weekly FROM fine_settings WHERE id = 1;
  IF v_base IS NULL THEN v_base := 450; END IF;
  IF v_weekly IS NULL THEN v_weekly := 25; END IF;

  FOR v_emi IN
    SELECT es.id, es.customer_id, es.emi_no, es.due_date, es.status,
           es.fine_amount, es.fine_waived, es.fine_paid_amount, c.emi_tenure
    FROM emi_schedule es
    JOIN customers c ON c.id = es.customer_id
    WHERE es.due_date < CURRENT_DATE
      AND es.fine_waived = FALSE
      AND c.status = 'RUNNING'
      AND (
        es.status = 'UNPAID'
        OR (COALESCE(es.fine_paid_amount, 0) < COALESCE(es.fine_amount, 0))
      )
  LOOP
    v_days := CURRENT_DATE - v_emi.due_date;
    IF v_days <= 0 THEN CONTINUE; END IF;

    v_is_last := (v_emi.emi_no = v_emi.emi_tenure);

    IF v_is_last THEN
      v_blocks := CEIL(v_days::NUMERIC / 30);
      v_calc := v_blocks * v_base;
    ELSE
      IF v_days <= 30 THEN
        v_calc := v_base;
      ELSE
        v_weeks := (v_days - 30) / 7;
        v_calc := v_base + (v_weeks * v_weekly);
      END IF;
    END IF;

    v_old := COALESCE(v_emi.fine_amount, 0);

    IF v_calc != v_old THEN
      UPDATE emi_schedule
      SET fine_amount = v_calc,
          fine_last_calculated_at = NOW(),
          updated_at = NOW()
      WHERE id = v_emi.id;

      INSERT INTO fine_history (customer_id, emi_schedule_id, emi_no,
        fine_type, fine_amount, cumulative_fine, fine_date, reason)
      VALUES (
        v_emi.customer_id, v_emi.id, v_emi.emi_no,
        CASE WHEN v_old = 0 THEN 'BASE' ELSE 'WEEKLY' END,
        v_calc - v_old, v_calc, CURRENT_DATE,
        v_days || 'd overdue'
          || CASE WHEN v_is_last THEN ' (LAST EMI, no weekly)'
             ELSE '' END
          || '. Fine: ' || v_old || ' → ' || v_calc
      );

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 022: recalc_customer_fines (collection-date gate)
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
  v_pending_fine BOOLEAN := FALSE;
  v_customer    RECORD;
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

    IF v_new > COALESCE(v_row.fine_paid_amount, 0) THEN
      v_pending_fine := TRUE;
    END IF;
  END LOOP;

  -- Reopen a COMPLETE customer that now carries an unpaid fine.
  SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
  IF FOUND AND v_customer.status = 'COMPLETE' AND v_pending_fine THEN
    UPDATE customers
    SET status = 'RUNNING', completion_date = NULL, updated_at = NOW()
    WHERE id = p_customer_id;
  END IF;

  RETURN v_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 017: recalc_all_fines
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

-- 028 (body of 027 + ownership guard): get_due_breakdown
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

  -- OWNERSHIP GUARD — auth.uid() IS NULL means a trusted service-role call.
  -- A real end-user session must be super_admin, or a retailer who owns this customer.
  IF auth.uid() IS NOT NULL THEN
    IF get_my_role() = 'super_admin' THEN
      NULL;
    ELSIF get_my_role() = 'retailer' AND v_customer.retailer_id = get_my_retailer_id() THEN
      NULL;
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

-- 027: approve_payment_request (latest; partial first-EMI charge + collection date)
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

  IF v_unpaid_count = 0 THEN
    DECLARE v_cust RECORD; v_fine_pending BOOLEAN; v_charge_pending BOOLEAN;
    BEGIN
      SELECT * INTO v_cust FROM customers WHERE id = v_request.customer_id;
      v_fine_pending := EXISTS (
        SELECT 1 FROM emi_schedule
        WHERE customer_id = v_request.customer_id AND fine_waived = FALSE
          AND fine_amount > COALESCE(fine_paid_amount, 0)
      );
      v_charge_pending := COALESCE(v_cust.first_emi_charge_amount, 0) > 0
        AND (CASE WHEN v_cust.first_emi_charge_paid_at IS NOT NULL
                  THEN COALESCE(v_cust.first_emi_charge_amount, 0)
                  ELSE COALESCE(v_cust.first_emi_charge_paid_amount, 0) END)
            < COALESCE(v_cust.first_emi_charge_amount, 0);
      IF NOT v_fine_pending AND NOT v_charge_pending THEN
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 028: submit_payment_request (atomic, row-locked)
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
  SELECT id, retailer_id INTO v_customer
  FROM customers WHERE id = p_customer_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'error', 'Customer not found');
  END IF;

  IF v_customer.retailer_id IS DISTINCT FROM p_retailer_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'error', 'Customer does not belong to your account');
  END IF;

  IF NOT v_no_emi THEN
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

    UPDATE emi_schedule
    SET collection_requested_at = COALESCE(collection_requested_at, v_now)
    WHERE id = ANY(p_emi_ids);

    PERFORM recalc_customer_fines(p_customer_id);

    UPDATE emi_schedule SET status = 'PENDING_APPROVAL' WHERE id = ANY(p_emi_ids);
  END IF;

  RETURN jsonb_build_object('success', true, 'request_id', v_request_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 023: _emi_period_metrics
CREATE OR REPLACE FUNCTION _emi_period_metrics(p_month INT, p_year INT)
RETURNS JSONB
LANGUAGE sql STABLE
AS $$
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

    'bouncedEmis', COALESCE((
      SELECT COUNT(*) FROM emi_schedule es
      JOIN customers c ON c.id = es.customer_id AND c.status IN ('RUNNING', 'COMPLETE')
      WHERE EXTRACT(YEAR  FROM es.due_date) = p_year
        AND EXTRACT(MONTH FROM es.due_date) = p_month
        AND es.status <> 'APPROVED'
        AND c.status <> 'COMPLETE'), 0)
  );
$$;

-- 028: get_emi_analysis (super-admin guard)
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

-- ============================================================
-- SECTION 10: TRIGGERS  (001, 010, 014, 025)
-- ============================================================
DROP TRIGGER IF EXISTS after_customer_insert ON customers;
CREATE TRIGGER after_customer_insert
  AFTER INSERT ON customers
  FOR EACH ROW EXECUTE FUNCTION trigger_generate_emi_schedule();

DROP TRIGGER IF EXISTS after_customer_update ON customers;
CREATE TRIGGER after_customer_update
  AFTER UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION trigger_regenerate_emi_on_update();

-- 010
DROP TRIGGER IF EXISTS trg_auto_complete ON emi_schedule;
CREATE TRIGGER trg_auto_complete
  AFTER UPDATE ON emi_schedule
  FOR EACH ROW EXECUTE FUNCTION fn_check_auto_complete();

-- 014: legacy auto-apply triggers are gone (API/RPC reconcile explicitly)
DROP TRIGGER IF EXISTS trg_auto_apply ON payment_requests;
DROP TRIGGER IF EXISTS trg_auto_apply_payment_on_approval ON payment_requests;
DROP FUNCTION IF EXISTS fn_auto_apply_payment_on_approval();

-- trg_assign_customer_code is (re)created in SECTION 4.

-- ============================================================
-- SECTION 11: ROW LEVEL SECURITY
-- Only the policies defined by the migration chain are replaced, by name.
-- No other policy is touched.
-- ============================================================
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

-- 005 / 010
DROP POLICY IF EXISTS "broadcast_admin_all" ON broadcast_messages;
CREATE POLICY "broadcast_admin_all" ON broadcast_messages
  FOR ALL USING (get_my_role() = 'super_admin');
DROP POLICY IF EXISTS "broadcast_retailer_read" ON broadcast_messages;
CREATE POLICY "broadcast_retailer_read" ON broadcast_messages
  FOR SELECT USING (get_my_role() = 'retailer' AND target_retailer_id = get_my_retailer_id());
DROP POLICY IF EXISTS "broadcast_retailer_insert" ON broadcast_messages;
CREATE POLICY "broadcast_retailer_insert" ON broadcast_messages
  FOR INSERT WITH CHECK (get_my_role() = 'retailer' AND target_retailer_id = get_my_retailer_id());

-- 010 fine_history (fh_insert is the 029-hardened version: super_admin only)
DROP POLICY IF EXISTS "fh_admin" ON fine_history;
CREATE POLICY "fh_admin" ON fine_history FOR ALL USING (get_my_role() = 'super_admin');
DROP POLICY IF EXISTS "fh_retailer" ON fine_history;
CREATE POLICY "fh_retailer" ON fine_history FOR SELECT USING (
  get_my_role() = 'retailer' AND customer_id IN (SELECT id FROM customers WHERE retailer_id = get_my_retailer_id())
);
DROP POLICY IF EXISTS "fh_insert" ON fine_history;
CREATE POLICY "fh_insert" ON fine_history
  FOR INSERT WITH CHECK (get_my_role() = 'super_admin');

-- 010 customer_app_tokens (app_tokens_anon_read was dropped by 010 and stays gone)
DROP POLICY IF EXISTS "app_tokens_anon_read" ON customer_app_tokens;
DROP POLICY IF EXISTS "app_tokens_admin" ON customer_app_tokens;
CREATE POLICY "app_tokens_admin" ON customer_app_tokens FOR ALL USING (get_my_role() = 'super_admin');
DROP POLICY IF EXISTS "app_tokens_retailer" ON customer_app_tokens;
CREATE POLICY "app_tokens_retailer" ON customer_app_tokens FOR ALL USING (
  get_my_role() = 'retailer' AND
  customer_id IN (SELECT id FROM customers WHERE retailer_id = get_my_retailer_id())
);

-- ============================================================
-- SECTION 12: GRANTS  (final state after 028)
-- ============================================================
GRANT SELECT ON customer_app_tokens TO anon;
GRANT SELECT, INSERT, UPDATE ON customer_app_tokens TO authenticated;
GRANT ALL ON customer_app_tokens TO service_role;

GRANT EXECUTE ON FUNCTION get_my_role()        TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_retailer_id() TO authenticated;

-- Internal-only RPCs: service_role only (028 PART A2 / B1)
REVOKE EXECUTE ON FUNCTION submit_payment_request(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, UUID[], INT[], NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, INT, DATE, JSONB, TEXT, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION submit_payment_request(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, UUID[], INT[], NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, INT, DATE, JSONB, TEXT, BOOLEAN) TO service_role;

REVOKE EXECUTE ON FUNCTION approve_payment_request(UUID, UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION approve_payment_request(UUID, UUID, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION recalc_customer_fines(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION recalc_customer_fines(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION recalc_all_fines() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION recalc_all_fines() TO service_role;

REVOKE EXECUTE ON FUNCTION apply_overdue_fines() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION apply_overdue_fines() TO service_role;

REVOKE EXECUTE ON FUNCTION calculate_and_apply_fines() FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION calculate_and_apply_fines() TO service_role;

REVOKE EXECUTE ON FUNCTION _emi_period_metrics(INT, INT) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION _emi_period_metrics(INT, INT) TO service_role;

-- Browser-callable, guarded in-function (028 PART B2 / B3)
REVOKE EXECUTE ON FUNCTION get_emi_analysis(INT, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_emi_analysis(INT, INT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION get_due_breakdown(UUID, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_due_breakdown(UUID, INT) TO authenticated, service_role;

-- ============================================================
-- SECTION 12B: EXTRA HARDENING BEYOND THE MIGRATION TEXT
-- (same intent as 028 — REMOVE THIS SECTION if you want a literal 1:1 state)
--
-- Supabase's default privileges give anon/authenticated an EXPLICIT EXECUTE
-- grant on every new public function, so "REVOKE ... FROM PUBLIC" alone in 028
-- does not remove it. get_due_breakdown treats auth.uid() IS NULL as a trusted
-- service-role call, which an ANON request also satisfies — so anon must not be
-- able to execute it. None of the callers below use anon/authenticated
-- (verified: every internal RPC is called through the service-role client).
-- get_my_role / get_my_retailer_id are deliberately left alone: RLS policies
-- call them.
-- ============================================================
REVOKE EXECUTE ON FUNCTION get_due_breakdown(UUID, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION get_emi_analysis(INT, INT)   FROM anon;

REVOKE EXECUTE ON FUNCTION submit_payment_request(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, UUID[], INT[], NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, INT, DATE, JSONB, TEXT, BOOLEAN) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION approve_payment_request(UUID, UUID, TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION recalc_customer_fines(UUID)               FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION recalc_all_fines()                        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION apply_overdue_fines()                     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION calculate_and_apply_fines()               FROM anon;
REVOKE EXECUTE ON FUNCTION _emi_period_metrics(INT, INT)             FROM anon;

-- Stale overloads left behind by the chain (CREATE OR REPLACE cannot replace a
-- function with a different argument list):
--   * migration 010 created approve_payment_request(uuid, uuid) RETURNS void — the
--     old pre-partial-payment logic, never revoked, executable by any user, and
--     never called by the app. Kept (nothing dropped) but locked to service_role.
--   * migration 001 get_due_breakdown(uuid) — superseded by the DEFAULT parameter
--     on get_due_breakdown(uuid, int) and lacking the 028 ownership guard. It is
--     redundant, so it is dropped (a one-arg call now resolves to the guarded one).
DO $$
BEGIN
  IF to_regprocedure('public.approve_payment_request(uuid, uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION approve_payment_request(UUID, UUID) FROM PUBLIC, anon, authenticated;
    GRANT  EXECUTE ON FUNCTION approve_payment_request(UUID, UUID) TO service_role;
  END IF;
  IF to_regprocedure('public.get_due_breakdown(uuid)') IS NOT NULL THEN
    DROP FUNCTION get_due_breakdown(UUID);
  END IF;
END $$;

-- ============================================================
-- SECTION 13: PG_CRON (only if the extension is present)   (017)
-- 010's 'calculate-fines-daily' job is superseded by 017 — remove it, add the 017 job.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('calculate-fines-daily'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM cron.unschedule('recalc-fines-daily');    EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule('recalc-fines-daily', '30 18 * * *', $cron$SELECT recalc_all_fines();$cron$);
  END IF;
END $$;

-- ============================================================
-- SECTION 14: REPORT — things NOT changed that you may want to review
-- ============================================================
DO $$
DECLARE
  p RECORD;
  known TEXT[] := ARRAY[
    'profiles_self','profiles_admin_all','retailers_admin_all','retailers_self_read',
    'customers_admin_all','customers_retailer_own','emi_admin_all','emi_retailer_own',
    'payment_requests_admin_all','payment_requests_retailer_own','payment_items_admin',
    'payment_items_retailer','audit_admin_read','fine_settings_admin','fine_settings_read',
    'broadcast_admin_all','broadcast_retailer_read','broadcast_retailer_insert',
    'fh_admin','fh_retailer','fh_insert','app_tokens_admin','app_tokens_retailer'];
BEGIN
  FOR p IN
    SELECT tablename, policyname, cmd FROM pg_policies
    WHERE schemaname = 'public' AND NOT (policyname = ANY (known))
    ORDER BY tablename, policyname
  LOOP
    RAISE NOTICE 'Policy NOT in migrations 001-029 (left untouched): % on % (%)',
      p.policyname, p.tablename, p.cmd;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'EMI Portal UPGRADE to migration 029 complete.';
  IF to_regclass('public.uniq_payment_requests_customer_pending') IS NULL THEN
    RAISE WARNING 'ACTION REQUIRED: one-PENDING-per-customer unique index is NOT installed (duplicate PENDING requests exist — see WARNINGs above). Resolve them and re-run.';
  ELSE
    RAISE NOTICE 'One-PENDING-per-customer unique index: installed.';
  END IF;
  RAISE NOTICE 'No tables, columns or rows were dropped or deleted.';
  RAISE NOTICE '================================================';
END $$;
