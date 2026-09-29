-- STEP 1 of 6 — PREVIEW (read-only). Expect rows_to_restore=139, customers=29, rupees=263440.00

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
