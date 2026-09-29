-- STEP 5 of 6 — read-only: payment items added by the bad upgrade

SELECT pri.id, pri.payment_request_id, pr.status, pri.emi_no, pri.amount
FROM payment_request_items pri
JOIN payment_requests pr ON pr.id = pri.payment_request_id
WHERE pri.created_at = '2026-09-29 06:05:00.079735+05:30'::timestamptz;
