-- STEP 6 of 6 — read-only: fine payments approved since 06:05 IST (fine UTR may be missing)

SELECT pr.id AS request_id, pr.customer_id, pr.utr, pr.mode, pr.approved_at
FROM payment_requests pr
WHERE pr.status = 'APPROVED'
  AND pr.approved_at >= '2026-09-29 06:05:00.079735+05:30'::timestamptz
  AND COALESCE(pr.fine_amount,0) > 0
ORDER BY pr.approved_at;
