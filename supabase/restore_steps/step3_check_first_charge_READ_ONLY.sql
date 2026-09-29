-- STEP 3 of 6 — read-only: the 2 customers whose first-EMI charge is marked fully paid

SELECT c.id, c.customer_code, c.customer_name,
       c.first_emi_charge_amount, c.first_emi_charge_paid_amount, c.first_emi_charge_paid_at,
       pr.id AS request_id, pr.first_emi_charge_amount AS request_charge, pr.approved_at
FROM customers c
JOIN payment_requests pr ON pr.customer_id = c.id AND pr.status = 'APPROVED'
                        AND COALESCE(pr.first_emi_charge_amount,0) > 0
WHERE c.id IN ('7f0abe53-38a5-4951-83ad-206fc8f53239', '9f7fd70a-e708-4517-93e4-9035936cc627')
ORDER BY c.id, pr.approved_at;
