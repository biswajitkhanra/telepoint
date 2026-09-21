-- ============================================================
-- Migration 028: Atomic payment submission + RPC access hardening
-- ============================================================
-- Two independent fixes bundled together:
--
-- PART A — Duplicate payment requests (data consistency / ACID):
--   app/api/payments/submit was a check-then-insert spread across several
--   non-transactional round trips from Next.js, and the "fine only" /
--   "first charge only" collection path had NO duplicate guard at all — two
--   near-simultaneous submits for the same customer (double-click, two open
--   tabs, a retried request) could both land as separate PENDING rows, which
--   is exactly the duplicate-approval-card bug seen in the admin panel. This
--   adds a DB-level partial unique index (one PENDING request per customer,
--   period) plus a single atomic RPC that does the whole submit under row
--   locks, so the DB itself makes the duplicate impossible instead of an
--   app-level race.
--
-- PART B — RPC grant hardening:
--   PostgreSQL grants EXECUTE on a new function to PUBLIC by default. None of
--   the prior migrations ever revoked that, which means several
--   SECURITY DEFINER functions meant to be internal-only (called only by our
--   Next.js server routes with the service-role key) were ALSO directly
--   callable by any authenticated retailer/admin session straight through
--   Supabase's PostgREST RPC endpoint — completely bypassing the super-admin
--   checks in the Next.js API routes that wrap them. Worst case:
--   approve_payment_request(request_id, my_own_user_id, NULL) called directly
--   by a retailer session self-approves their own fabricated payment request.
--   This locks those functions down to service_role only, and adds an
--   in-function ownership/role guard to the two functions that are
--   INTENTIONALLY called straight from the browser (get_due_breakdown,
--   get_emi_analysis) but had no server-side check of their own.
-- ============================================================


-- ============================================================
-- PART A1: at most one PENDING payment_request per customer
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uniq_payment_requests_customer_pending
  ON payment_requests(customer_id)
  WHERE status = 'PENDING';


-- ============================================================
-- PART A2: submit_payment_request — atomic, row-locked submit
-- Mirrors the checks previously done in app/api/payments/submit/route.ts
-- (ownership is still checked in the route before calling this — this is
-- defense in depth plus the parts that MUST be atomic: the EMI-status
-- checks, the sequence check, and the insert-under-the-unique-constraint).
-- ============================================================
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

-- Internal-only: called by our Next.js server routes with the service-role
-- key. Never meant to be reachable from a retailer/admin browser session.
REVOKE EXECUTE ON FUNCTION submit_payment_request(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, UUID[], INT[], NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, INT, DATE, JSONB, TEXT, BOOLEAN
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_payment_request(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, UUID[], INT[], NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, INT, DATE, JSONB, TEXT, BOOLEAN
) TO service_role;


-- ============================================================
-- PART B1: lock internal-only RPCs down to service_role.
-- Each of these is only ever invoked by our own server routes via the
-- service-role client (grep-verified) — never from a browser session.
-- ============================================================
REVOKE EXECUTE ON FUNCTION approve_payment_request(UUID, UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION approve_payment_request(UUID, UUID, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION recalc_customer_fines(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION recalc_customer_fines(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION recalc_all_fines() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION recalc_all_fines() TO service_role;

REVOKE EXECUTE ON FUNCTION apply_overdue_fines() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION apply_overdue_fines() TO service_role;

-- Superseded by recalc_all_fines / recalc_customer_fines (migration 017) and
-- unused by any current caller (grep-verified) — previously left grantable
-- to any authenticated user, which is strictly more access than it needs.
REVOKE EXECUTE ON FUNCTION calculate_and_apply_fines() FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION calculate_and_apply_fines() TO service_role;

-- Internal helper for get_emi_analysis only — was directly callable by any
-- authenticated user, letting the super_admin-only guard below (PART B2) be
-- bypassed by calling this helper instead of get_emi_analysis itself.
REVOKE EXECUTE ON FUNCTION _emi_period_metrics(INT, INT) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION _emi_period_metrics(INT, INT) TO service_role;


-- ============================================================
-- PART B2: get_emi_analysis — whole-portfolio, cross-retailer analytics
-- (every retailer's name + exact collection figures). Intentionally called
-- straight from the browser (components/reports/ReportsHub.tsx,
-- components/analytics/AnalyticsPro.tsx) on the super-admin dashboard, but
-- the function itself never checked the caller's role — any authenticated
-- retailer could call it directly and see every OTHER retailer's business.
-- Same body as migrations/023, now guarded.
-- ============================================================
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

REVOKE EXECUTE ON FUNCTION get_emi_analysis(INT, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_emi_analysis(INT, INT) TO authenticated, service_role;


-- ============================================================
-- PART B3: get_due_breakdown — add an ownership guard.
-- Called directly from the browser by admin/retailer/noc pages AND from our
-- server routes via the service-role key (customer-login, customer-app-token
-- — both already resolve ownership themselves before calling this). A
-- retailer session had no DB-level restriction stopping it from requesting
-- another retailer's customer's financial breakdown. Body is unchanged from
-- migration 027 except for the guard right after the "customer not found"
-- check.
-- ============================================================
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

REVOKE EXECUTE ON FUNCTION get_due_breakdown(UUID, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_due_breakdown(UUID, INT) TO authenticated, service_role;


DO $$ BEGIN
  RAISE NOTICE '028: submit_payment_request (atomic) + one-PENDING-per-customer';
  RAISE NOTICE '     unique index installed; internal RPCs locked to service_role;';
  RAISE NOTICE '     get_due_breakdown / get_emi_analysis now enforce ownership.';
END $$;
