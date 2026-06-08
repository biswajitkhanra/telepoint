-- 022_collection_date_fine.sql
-- ============================================================================
-- CRITICAL FINE FIX — anchor fine eligibility to the ORIGINAL collection date
-- (collection_requested_at), never to the admin approval date.
--
-- Business rule:
--   • collection_requested_at <= due_date  → NO fine (collected on time), even
--     if the super admin approves days later.
--   • collection_requested_at >  due_date  → fine applies and STAYS PENDING
--     until explicitly paid (it must survive approval — paying only the EMI
--     principal must not wipe the late fine).
--   • A rejected request clears collection_requested_at (handled in the API) so
--     normal overdue accrual resumes from the due date.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ── 1. Column ────────────────────────────────────────────────────────────────
ALTER TABLE emi_schedule
  ADD COLUMN IF NOT EXISTS collection_requested_at TIMESTAMPTZ;

COMMENT ON COLUMN emi_schedule.collection_requested_at IS
  'When collection was first initiated for this EMI. Drives fine eligibility '
  '(<= due_date → no fine). NULL = not yet collected / reset on rejection.';

CREATE INDEX IF NOT EXISTS idx_emi_collection_requested_at
  ON emi_schedule(collection_requested_at);

-- ── 2. get_due_breakdown — apply the collection-date gate ─────────────────────
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
      -- Collection-date gate: collected on/before due date → never fined.
      AND NOT (collection_requested_at IS NOT NULL
               AND collection_requested_at::date <= due_date)
      AND (
        (status IN ('UNPAID', 'PARTIALLY_PAID') AND due_date < CURRENT_DATE)
        -- Late-collected EMI keeps its fine even once APPROVED.
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

  IF COALESCE(v_customer.first_emi_charge_amount, 0) > 0
     AND v_customer.first_emi_charge_paid_at IS NULL THEN
    v_first_charge_due := v_customer.first_emi_charge_amount;
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

-- ── 3. recalc_customer_fines — persist fines with the collection-date gate ────
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

GRANT EXECUTE ON FUNCTION recalc_customer_fines(UUID) TO service_role;

-- ── 4. approve_payment_request — stamp collection date + persist fines ────────
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
        -- Anchor fine eligibility to the original collection date (request
        -- creation), never to this approval moment.
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

  IF COALESCE(v_request.first_emi_charge_amount, 0) > 0 THEN
    UPDATE customers
    SET first_emi_charge_paid_at = COALESCE(first_emi_charge_paid_at, v_now),
        updated_at = v_now
    WHERE id = v_request.customer_id;
  END IF;

  UPDATE payment_requests
  SET status = 'APPROVED', approved_by = p_admin_id, approved_at = v_now, updated_at = v_now,
      notes = CASE
                WHEN p_remark IS NOT NULL
                THEN COALESCE(notes || E'\n', '') || 'Admin remark: ' || p_remark
                ELSE notes END
  WHERE id = p_request_id;

  -- Persist any late fine now (collection-date gate inside) so the completion
  -- check below reads a fresh stored fine_amount. A late-collected EMI whose
  -- principal is paid but fine is outstanding must NOT mark the customer COMPLETE.
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
                       AND v_cust.first_emi_charge_paid_at IS NULL;
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

GRANT EXECUTE ON FUNCTION approve_payment_request(UUID, UUID, TEXT) TO service_role;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
