-- ============================================================
-- Migration 028: Customer status depends only on EMI completion
-- ============================================================
-- Business rule fix — a customer who has paid every EMI installment must stay
-- COMPLETE even if a fine is still outstanding. Previously two DB functions
-- tied completion to fines:
--
--   * recalc_customer_fines() carried a "safety net" that REOPENED a COMPLETE
--     customer (COMPLETE → RUNNING) whenever it found an unpaid fine. This ran
--     on every fine recalculation / auto-sync, so a completed customer with a
--     pending fine kept bouncing back to Running. THIS is the reported bug.
--   * approve_payment_request() only stamped COMPLETE when NO fine was pending,
--     so finishing the last EMI while a fine was outstanding left the customer
--     stuck in Running.
--
-- New rule (applies everywhere status is decided):
--   If Remaining EMI > 0            -> RUNNING
--   Else                           -> COMPLETE   (regardless of any fine)
--   A pending fine only drives a "Fine Pending" indicator; it never changes
--   the customer's completion status.
--
-- The one-time First EMI Charge is left as an existing, fine-independent
-- completion gate (unchanged) — this migration only decouples FINES from status.
-- Idempotent & re-runnable. No schema (table/column) changes.
-- ============================================================

-- ── 1. recalc_customer_fines — persist fines, but NEVER reopen on a fine ──────
-- Redefined from migration 022 with the COMPLETE → RUNNING "reopen on unpaid
-- fine" block removed. Fine accrual/persistence behaviour is otherwise identical.
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

  -- NOTE: intentionally NO status change here. Customer completion depends
  -- solely on EMI completion; a pending fine must never move a COMPLETE
  -- customer back to RUNNING (that reopen block was the reported bug).

  RETURN v_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION recalc_customer_fines(UUID) TO service_role;

-- ── 2. approve_payment_request — complete on EMI clearance, fine-independent ──
-- Redefined from migration 027; only the completion gate changed so a pending
-- fine no longer blocks the COMPLETE stamp. The First EMI Charge gate remains.
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

  -- Persist any late fine now so the "Fine Pending" indicator is accurate.
  -- The completion decision below deliberately ignores the fine.
  PERFORM recalc_customer_fines(v_request.customer_id);

  SELECT COUNT(*) INTO v_unpaid_count
  FROM emi_schedule
  WHERE customer_id = v_request.customer_id
    AND status IN ('UNPAID', 'PENDING_APPROVAL', 'PARTIALLY_PAID');

  IF v_unpaid_count = 0 THEN
    DECLARE v_cust RECORD; v_charge_pending BOOLEAN;
    BEGIN
      SELECT * INTO v_cust FROM customers WHERE id = v_request.customer_id;
      -- Status depends only on EMI completion + the First EMI Charge; a pending
      -- fine is intentionally NOT a gate here.
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION approve_payment_request(UUID, UUID, TEXT) TO service_role;

-- ── 3. One-time backfill — rescue customers wrongly stuck in RUNNING ──────────
-- Any RUNNING customer whose EMI schedule is fully cleared (no open installments)
-- and whose First EMI Charge is fully paid was only kept Running by the old
-- fine-based logic. Move them to COMPLETE. Fines are ignored by design.
UPDATE customers c
SET status = 'COMPLETE',
    completion_date = COALESCE(c.completion_date, CURRENT_DATE),
    updated_at = NOW()
WHERE c.status = 'RUNNING'
  -- must actually have an EMI schedule (skip brand-new records with none)
  AND EXISTS (SELECT 1 FROM emi_schedule e WHERE e.customer_id = c.id)
  -- no open installments remain
  AND NOT EXISTS (
    SELECT 1 FROM emi_schedule e
    WHERE e.customer_id = c.id
      AND e.status IN ('UNPAID', 'PENDING_APPROVAL', 'PARTIALLY_PAID')
  )
  -- First EMI Charge fully collected
  AND COALESCE(c.first_emi_charge_amount, 0) <=
      (CASE WHEN c.first_emi_charge_paid_at IS NOT NULL
            THEN COALESCE(c.first_emi_charge_amount, 0)
            ELSE COALESCE(c.first_emi_charge_paid_amount, 0) END);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
