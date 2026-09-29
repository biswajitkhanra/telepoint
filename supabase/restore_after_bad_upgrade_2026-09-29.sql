-- ============================================================================
-- RESTORE the 139 emi_schedule rows changed by the committed
-- existing_supabase_upgrade.sql, which ran at 2026-09-29 06:05:00.079735+05:30.
--
-- Run it in three steps. PART A and PART C only read. PART B writes, and it is
-- the only part that does.
--
-- WHAT THE BAD UPGRADE DID (committed file, SECTION 6):
--   UPDATE emi_schedule SET partial_paid_amount = amount
--   WHERE status = 'APPROVED' AND COALESCE(partial_paid_amount,0) = 0 AND amount > 0;
-- /api/settlement leaves partial_paid_amount = 0 on the written-off tail of a
-- SETTLED loan, and app/api/metrics/route.ts:199-205 uses that 0 to count the
-- tail as NOT recovered. The update made the tail look collected, which
-- understated booked Loss by 263,440 and made it negative.
--
-- HOW THE TARGET ROWS ARE IDENTIFIED (all conditions must hold):
--   * customer is SETTLED, EMI is APPROVED, paid on/after the settlement date
--   * partial_paid_amount >= amount while partial_paid_at IS NULL
--     (every app / RPC path that writes partial_paid_amount also writes
--      partial_paid_at; the bad update did not; no import SQL in the repo
--      history writes partial_paid_amount)
--   * updated_at = 2026-09-29 06:05:00.079735+05:30 exactly — stamped by this
--     DB's trg_updated_at trigger inside that single transaction.
-- Restored value: partial_paid_amount = 0. That is the only value the bad
-- update's WHERE clause could have matched.
-- ============================================================================


-- ============================================================================
-- PART A — PREVIEW (read-only). Expect 139 rows / 29 customers / 263440.00.
-- ============================================================================
WITH target AS (
  SELECT es.id, es.customer_id, es.amount
  FROM emi_schedule es
  JOIN customers c ON c.id = es.customer_id
  WHERE c.status = 'SETTLED'
    AND es.status = 'APPROVED'
    AND es.amount > 0
    AND es.partial_paid_amount >= es.amount
    AND es.partial_paid_at IS NULL
    AND (es.paid_at IS NULL OR es.paid_at::date >= COALESCE(c.settlement_date, c.completion_date))
    AND es.updated_at = '2026-09-29 06:05:00.079735+05:30'::timestamptz
),
per_customer AS (
  -- Booked-loss formula of app/api/metrics/route.ts:172-215, computed twice:
  -- now, and as it will be after PART B (target rows with partial = 0).
  SELECT c.id,
    GREATEST(0, COALESCE(c.purchase_value,0) - COALESCE(c.down_payment,0)) AS loan,
    SUM(v.recovered_now)   AS emi_now,
    SUM(v.recovered_after) AS emi_after,
    COALESCE(SUM(COALESCE(v.fine_paid_amount,0)),0) AS fines,
    CASE WHEN COALESCE(c.first_emi_charge_amount,0) <= 0 THEN 0
         WHEN c.first_emi_charge_paid_at IS NOT NULL THEN c.first_emi_charge_amount
         ELSE LEAST(c.first_emi_charge_amount, GREATEST(0, COALESCE(c.first_emi_charge_paid_amount,0))) END AS charge,
    CASE WHEN c.status = 'SETTLED' AND COALESCE(c.settlement_date, c.completion_date) IS NOT NULL
         THEN COALESCE(c.settlement_amount,0) ELSE 0 END AS settlement
  FROM customers c
  LEFT JOIN LATERAL (
    SELECT es.fine_paid_amount,
      CASE WHEN c.status='SETTLED' AND COALESCE(c.settlement_date,c.completion_date) IS NOT NULL
                AND es.status='APPROVED'
                AND (es.paid_at IS NULL OR es.paid_at::date >= COALESCE(c.settlement_date,c.completion_date))
             THEN LEAST(COALESCE(es.amount,0), COALESCE(es.partial_paid_amount,0))
           WHEN es.status='APPROVED' THEN COALESCE(es.amount,0)
           ELSE LEAST(COALESCE(es.amount,0), COALESCE(es.partial_paid_amount,0)) END AS recovered_now,
      CASE WHEN es.id IN (SELECT id FROM target) THEN 0
           WHEN c.status='SETTLED' AND COALESCE(c.settlement_date,c.completion_date) IS NOT NULL
                AND es.status='APPROVED'
                AND (es.paid_at IS NULL OR es.paid_at::date >= COALESCE(c.settlement_date,c.completion_date))
             THEN LEAST(COALESCE(es.amount,0), COALESCE(es.partial_paid_amount,0))
           WHEN es.status='APPROVED' THEN COALESCE(es.amount,0)
           ELSE LEAST(COALESCE(es.amount,0), COALESCE(es.partial_paid_amount,0)) END AS recovered_after
    FROM emi_schedule es WHERE es.customer_id = c.id
  ) v ON TRUE
  WHERE c.status IN ('NPA','SETTLED')
  GROUP BY c.id
)
SELECT
  (SELECT COUNT(*) FROM target)                           AS rows_to_restore,
  (SELECT COUNT(DISTINCT customer_id) FROM target)        AS customers,
  (SELECT SUM(amount) FROM target)                        AS rupees,
  SUM(loan - (COALESCE(emi_now,0)   + fines + charge + settlement))                 AS loss_now_app_formula,
  SUM(loan - (COALESCE(emi_after,0) + fines + charge + settlement))                 AS loss_after_app_formula,
  SUM(GREATEST(0, loan - (COALESCE(emi_after,0) + fines + charge + settlement)))    AS loss_after_clamped,
  COUNT(*) FILTER (WHERE loan - (COALESCE(emi_after,0) + fines + charge + settlement) < 0)
                                                          AS customers_still_negative_after
FROM per_customer;


-- ============================================================================
-- PART B — RESTORE (writes). Run only after PART A shows 139 / 29 / 263440.00.
-- Aborts and changes nothing unless it matches exactly 139 rows.
-- Afterwards trg_updated_at re-stamps updated_at, so a second run finds 0 rows
-- and stops without changing anything.
-- ============================================================================
-- One self-contained statement: a DO block runs atomically on its own, so an
-- error anywhere inside it rolls back everything it did. No temp table and no
-- BEGIN/COMMIT (the Supabase SQL editor does not keep those across statements).
DO $$
DECLARE
  v_ids UUID[];
  n     INT;
  m     INT;
BEGIN
  SELECT array_agg(es.id) INTO v_ids
  FROM emi_schedule es
  JOIN customers c ON c.id = es.customer_id
  WHERE c.status = 'SETTLED'
    AND es.status = 'APPROVED'
    AND es.amount > 0
    AND es.partial_paid_amount >= es.amount
    AND es.partial_paid_at IS NULL
    AND (es.paid_at IS NULL OR es.paid_at::date >= COALESCE(c.settlement_date, c.completion_date))
    AND es.updated_at = '2026-09-29 06:05:00.079735+05:30'::timestamptz;

  n := COALESCE(array_length(v_ids, 1), 0);
  IF n = 0 THEN
    RAISE NOTICE 'No target rows found (already restored?). Nothing changed.';
    RETURN;
  END IF;
  IF n <> 139 THEN
    RAISE EXCEPTION 'Expected exactly 139 target rows, found %. Nothing changed.', n;
  END IF;

  UPDATE emi_schedule
  SET partial_paid_amount = 0
  WHERE id = ANY (v_ids)
    AND partial_paid_at IS NULL;
  GET DIAGNOSTICS m = ROW_COUNT;
  IF m <> 139 THEN
    RAISE EXCEPTION 'Updated % rows instead of 139 — rolled back. Nothing changed.', m;
  END IF;

  INSERT INTO audit_log (actor_role, action, table_name, remark, after_data)
  VALUES ('super_admin', 'RESTORE_BAD_UPGRADE_BACKFILL', 'emi_schedule',
          'Reverted partial_paid_amount on 139 SETTLED waived-tail EMIs set by existing_supabase_upgrade.sql at 2026-09-29 06:05 IST',
          jsonb_build_object('emi_ids', to_jsonb(v_ids)));
  RAISE NOTICE 'Restored partial_paid_amount = 0 on % rows.', m;
END $$;


-- ============================================================================
-- PART C — OTHER DAMAGE FROM THE SAME RUN (read-only, review manually)
-- ============================================================================

-- C1. Row 7 of the report: first-EMI charge marked fully paid although the
--     approved requests cover less. Between 06:05 and the FINAL script, the
--     bad upgrade's approve_payment_request (the migration-022 body) stamped
--     first_emi_charge_paid_at on ANY first-charge payment, even a partial one.
--     If approved_at falls in that window, that function caused it.
SELECT c.id, c.customer_code, c.customer_name,
       c.first_emi_charge_amount, c.first_emi_charge_paid_amount, c.first_emi_charge_paid_at,
       pr.id AS request_id, pr.first_emi_charge_amount AS request_charge, pr.approved_at
FROM customers c
JOIN payment_requests pr ON pr.customer_id = c.id AND pr.status = 'APPROVED'
                        AND COALESCE(pr.first_emi_charge_amount,0) > 0
WHERE c.id IN ('7f0abe53-38a5-4951-83ad-206fc8f53239', '9f7fd70a-e708-4517-93e4-9035936cc627')
ORDER BY c.id, pr.approved_at;

-- C2. The same run also normalised statuses in one statement. Normally only
--     APPROVED rows carry paid_at, so an EMI that is PARTIALLY_PAID but still
--     has paid_at and carries the 06:05 stamp was most likely flipped from
--     APPROVED by that statement.
SELECT es.id, es.customer_id, es.emi_no, es.amount, es.partial_paid_amount, es.paid_at
FROM emi_schedule es
WHERE es.status = 'PARTIALLY_PAID'
  AND es.paid_at IS NOT NULL
  AND es.updated_at = '2026-09-29 06:05:00.079735+05:30'::timestamptz;

-- C3. payment_request_items the same run added to already APPROVED / REJECTED
--     requests (it backfilled items for every request lacking them). They are
--     additive; the app would create the same rows on its own when needed
--     (lib/paymentReconcile.ts resolvePaymentRequestItems). Listed so you know.
SELECT pri.id, pri.payment_request_id, pr.status, pri.emi_no, pri.amount
FROM payment_request_items pri
JOIN payment_requests pr ON pr.id = pri.payment_request_id
WHERE pri.created_at = '2026-09-29 06:05:00.079735+05:30'::timestamptz;

-- C4. Fine payments approved while the bad function was live never had
--     fine_utr / fine_mode stamped (display only: the UI falls back to utr / mode).
SELECT pr.id AS request_id, pr.customer_id, pr.utr, pr.mode, pr.approved_at
FROM payment_requests pr
WHERE pr.status = 'APPROVED'
  AND pr.approved_at >= '2026-09-29 06:05:00.079735+05:30'::timestamptz
  AND COALESCE(pr.fine_amount,0) > 0
ORDER BY pr.approved_at;
