-- ============================================================================
-- FIX: 43 customers wrongly moved COMPLETE -> RUNNING on 2026-09-29 (08:48 IST)
--
-- EVIDENCE (today/ backups):
--   * The backup taken BEFORE the bad upgrade (05:29 IST) contains exactly 43
--     COMPLETE customers carrying an unpaid late fine, completed Aug-Sep 2026.
--     They stayed COMPLETE for weeks while fines were recalculated, so the live
--     database was running migration #127 (commit da7fc01, 1 Aug 2026:
--     "completed customers with pending fines must stay Completed").
--   * This morning's bad upgrade (and the repair after it) re-installed the
--     older recalc_customer_fines that reopens COMPLETE customers with a fine.
--     Opening the Reports page (it calls /api/fines/recalc) then reopened all 43.
--   * All 43 still have every EMI paid and no first-EMI charge pending.
--
-- THIS FILE:
--   PART 1  Restores the #127 recalc_customer_fines and approve_payment_request
--           (verbatim from git da7fc01), keeping the fine_utr / fine_mode
--           stamping and the pinned search_path added today.
--   PART 2  Puts the 43 customers back to COMPLETE with their ORIGINAL
--           completion_date from the before-backup. Nothing else is changed.
--           Aborts (changes nothing) unless every one of the 43 still has all
--           EMIs paid and is still RUNNING with no completion date.
--
-- Late fines are NOT touched: they stay payable and visible, exactly as before.
-- Paste the WHOLE file into Supabase -> SQL Editor -> Run. Safe to run again.
-- ============================================================================

-- ── PART 1 ──────────────────────────────────────────────────────────────────
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

REVOKE EXECUTE ON FUNCTION recalc_customer_fines(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION recalc_customer_fines(UUID) TO service_role;
REVOKE EXECUTE ON FUNCTION approve_payment_request(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION approve_payment_request(UUID, UUID, TEXT) TO service_role;

-- ── PART 2 ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_ready   INT;
  n_done    INT;
  n_updated INT;
  -- the 43 customers and their ORIGINAL completion_date (from the before-backup)
  v_ids   UUID[] := ARRAY[
      '0f0c43fd-a887-4100-a0c5-d0595ce2326e',
      '128bf78b-d1b9-46ef-8f0a-d2ce37ca4646',
      '16d4736a-2347-4639-aa5f-8ff7db36627a',
      '1986b59d-4489-45e6-8bcc-e946b7bbc854',
      '2d1c928a-7fa7-4c46-9093-fc78be1afdf2',
      '3155158b-b048-468d-96a6-6eaab8246932',
      '44f0fbcb-cb7d-4fce-96c8-ea96de558b0a',
      '48d11c35-9604-4dd1-aee0-e99d5b4b047d',
      '54f9c9cb-44dd-4d2a-8653-c4c58227383e',
      '5fcb544d-9698-49a2-a0fc-3bd188b8f02c',
      '65306dd1-2ead-4557-8c16-f0894fb8bf47',
      '7a24a035-6600-412f-b647-1b71797865c6',
      '7d0671dc-7c6a-4319-9b1d-8833809f9779',
      '7e6ed809-9e7a-407e-bcf6-3ccce774c250',
      '8321b8d9-98c5-4c83-a922-8dd05ed41d7a',
      '85be8090-9ff7-4d63-b043-8bf9efdfb01f',
      '8993e8d4-de46-4b07-b45c-71e1a96f4a4a',
      '8d16f949-2b3e-4ba1-b84d-34be1fd388af',
      '93dd0619-8914-4f99-be94-bbee774400cd',
      '968713eb-7f00-43ab-bc08-7dc1ed13ebe4',
      '9d892d19-939c-4b25-ac75-835524cf1258',
      'a4b6d90a-773a-4ca8-9fe2-90e557dfaa60',
      'aa031b97-f4e0-419e-b2c0-c4c460fff03d',
      'b4dc5add-1c03-41d0-9964-ca74d0a65308',
      'c7894e4f-5abb-44a3-83fb-42fce897abc8',
      'c7cbdb9b-9e32-4cd1-a686-ee7180ae53ed',
      'c7e1e077-3cc5-4832-98b0-fecf69c56072',
      'c9e19168-84fb-437f-bd06-70e48486fd63',
      'cb1454a1-030b-4410-8937-f136b4e429ba',
      'd2c38ab5-2768-4cc7-a97c-23b388764711',
      'd351d13d-2fa8-44af-a771-5f19651ffeaa',
      'd64f3433-1148-4cfd-a695-b32dcfb55989',
      'd83e0fe5-5e9f-4171-9fcd-dd9ea9b2808a',
      'dd8ffdf6-d26b-4afe-9542-95f263125561',
      'e153511b-b7e9-45f5-8591-52558557f04d',
      'e2f534bb-0fce-4299-b946-2709e946db92',
      'ef69e78a-31dd-4d73-bb5a-53ac6102f05f',
      'f02fabad-6cef-45cc-9707-07785881347d',
      'f087f7e7-4bd7-4cf0-baa4-e4479d273e1f',
      'f5769e66-3148-4938-a09b-f40bd5c46836',
      'f9f6ba1e-bee8-4dd2-a40a-f97bd80a9b03',
      'fa1665be-e806-4db2-aba1-d7c089914e9c',
      'fde8cc5e-c025-41a1-b35e-72f04075974d'
    ]::uuid[];
  v_dates DATE[] := ARRAY[
      '2026-09-05',
      '2026-08-20',
      '2026-08-26',
      '2026-08-22',
      '2026-08-17',
      '2026-09-05',
      '2026-08-01',
      '2026-08-01',
      '2026-08-11',
      '2026-09-16',
      '2026-08-11',
      '2026-08-17',
      '2026-09-17',
      '2026-08-27',
      '2026-08-26',
      '2026-08-25',
      '2026-09-23',
      '2026-08-01',
      '2026-08-12',
      '2026-08-01',
      '2026-08-01',
      '2026-08-01',
      '2026-08-01',
      '2026-08-01',
      '2026-08-01',
      '2026-08-26',
      '2026-08-17',
      '2026-09-11',
      '2026-08-01',
      '2026-08-19',
      '2026-09-11',
      '2026-08-01',
      '2026-08-21',
      '2026-08-01',
      '2026-08-01',
      '2026-08-16',
      '2026-08-01',
      '2026-09-08',
      '2026-08-31',
      '2026-08-17',
      '2026-08-03',
      '2026-09-16',
      '2026-08-01'
    ]::date[];
BEGIN

  -- already restored (second run)?
  SELECT COUNT(*) INTO n_done
  FROM customers c WHERE c.id = ANY (v_ids) AND c.status = 'COMPLETE';
  IF n_done = 43 THEN
    RAISE NOTICE 'All 43 customers are already COMPLETE. Nothing changed.';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO n_ready
  FROM customers c WHERE c.id = ANY (v_ids)
    AND c.status = 'RUNNING'
    AND c.completion_date IS NULL
    AND NOT EXISTS (SELECT 1 FROM emi_schedule e
                    WHERE e.customer_id = c.id
                      AND e.status IN ('UNPAID', 'PENDING_APPROVAL', 'PARTIALLY_PAID'));
  IF n_ready <> 43 THEN
    RAISE EXCEPTION 'Expected 43 reopened, fully paid customers; found % (and % already COMPLETE). Nothing changed.', n_ready, n_done;
  END IF;

  UPDATE customers c
  SET status = 'COMPLETE', completion_date = r.completion_date
  FROM unnest(v_ids, v_dates) AS r(id, completion_date)
  WHERE c.id = r.id AND c.status = 'RUNNING' AND c.completion_date IS NULL;
  GET DIAGNOSTICS n_updated = ROW_COUNT;
  IF n_updated <> 43 THEN
    RAISE EXCEPTION 'Updated % customers instead of 43. Rolled back, nothing changed.', n_updated;
  END IF;

  INSERT INTO audit_log (actor_role, action, table_name, remark, after_data)
  VALUES ('super_admin', 'RESTORE_REOPENED_CUSTOMERS', 'customers',
          'Restored 43 customers to COMPLETE (original completion_date) after the 2026-09-29 bad upgrade re-installed the reopening fine recalc',
          jsonb_build_object('customer_ids', to_jsonb(v_ids)));
  RAISE NOTICE 'Restored % customers to COMPLETE.', n_updated;
END $$;

NOTIFY pgrst, 'reload schema';
