-- STEP 4 of 6 — read-only: EMIs possibly flipped APPROVED -> PARTIALLY_PAID by the bad upgrade

SELECT es.id, es.customer_id, es.emi_no, es.amount, es.partial_paid_amount, es.paid_at
FROM emi_schedule es
WHERE es.status = 'PARTIALLY_PAID'
  AND es.paid_at IS NOT NULL
  AND es.updated_at = '2026-09-29 06:05:00.079735+05:30'::timestamptz;
