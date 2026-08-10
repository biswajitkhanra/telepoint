-- ============================================================================
-- PHASE 32 — second audit. Assume the fix is in place and try to defeat it.
-- ============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

CREATE OR REPLACE FUNCTION pg_temp.report(label TEXT, expected TEXT, actual TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF expected = actual THEN RAISE NOTICE 'PASS  % (%)', label, actual;
  ELSE RAISE NOTICE 'FAIL  % — expected %, got %', label, expected, actual; END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.probe(sql TEXT) RETURNS TEXT
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE sql; RETURN 'ALLOWED';
EXCEPTION
  WHEN insufficient_privilege THEN RETURN 'DENIED';
  WHEN OTHERS THEN
    IF SQLERRM ILIKE '%not authorized%' OR SQLERRM ILIKE '%permission denied%'
       OR SQLERRM ILIKE '%does not exist%' THEN RETURN 'DENIED'; END IF;
    RETURN 'ERROR: ' || SQLERRM;
END $$;

\echo ''
\echo '--- BYPASS ATTEMPTS (all must be DENIED) ---'

-- BYPASS-1 — call the renamed implementation directly, skipping the wrapper's
-- ownership check. This is the most obvious way to defeat the fix.
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
SELECT pg_temp.report('BYPASS-1 retailer calls get_due_breakdown_impl directly', 'DENIED',
  pg_temp.probe($q$ SELECT get_due_breakdown_impl('20000000-0000-4000-8000-00000000000b'::uuid) $q$));
RESET ROLE;

-- BYPASS-2 — same trick against the analytics implementation.
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
SELECT pg_temp.report('BYPASS-2 retailer calls get_emi_analysis_impl directly', 'DENIED',
  pg_temp.probe($q$ SELECT get_emi_analysis_impl(1, 2025) $q$));
RESET ROLE;

-- BYPASS-3 — the analytics helper that does the actual aggregation.
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
SELECT pg_temp.report('BYPASS-3 retailer calls _emi_period_metrics directly', 'DENIED',
  pg_temp.probe($q$ SELECT _emi_period_metrics(1, 2025) $q$));
RESET ROLE;

-- BYPASS-4 — approve a payment request belonging to ANOTHER retailer.
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
SELECT pg_temp.report('BYPASS-4 retailer B approves retailer A request', 'DENIED',
  pg_temp.probe($q$ SELECT approve_payment_request(
    '30000000-0000-4000-8000-00000000000a'::uuid,
    '00000000-0000-4000-8000-0000000000ad'::uuid, 'x') $q$));
RESET ROLE;

-- BYPASS-5 — a retailer forging the super_admin JWT subject. The role is read
-- from the profiles table via get_my_role(), never from the request, so
-- claiming another uid only works if you can actually mint that JWT. This
-- asserts the wrapper reads the DB, not the request body.
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
SELECT pg_temp.report('BYPASS-5 retailer role resolves from DB not request', 'retailer',
  (SELECT get_my_role()));
RESET ROLE;

-- BYPASS-6 — regenerate another retailer's EMI schedule (destructive).
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
SELECT pg_temp.report('BYPASS-6 retailer regenerates foreign EMI schedule', 'DENIED',
  pg_temp.probe($q$ SELECT generate_emi_schedule('20000000-0000-4000-8000-00000000000b'::uuid) $q$));
RESET ROLE;

-- BYPASS-7 — anonymous caller reaching any privileged function.
SET ROLE anon;
SET request.jwt.claim.sub = '';
SELECT pg_temp.report('BYPASS-7 anon calls approve_payment_request', 'DENIED',
  pg_temp.probe($q$ SELECT approve_payment_request(
    '30000000-0000-4000-8000-00000000000a'::uuid,
    '00000000-0000-4000-8000-0000000000ad'::uuid, 'x') $q$));
RESET ROLE;

-- BYPASS-8 — anonymous read of customer auto-login tokens (table grant now
-- revoked as well as RLS denying).
SET ROLE anon;
SET request.jwt.claim.sub = '';
SELECT pg_temp.report('BYPASS-8 anon reads customer_app_tokens', 'DENIED',
  pg_temp.probe($q$ SELECT count(*) FROM customer_app_tokens $q$));
RESET ROLE;

-- BYPASS-9 — retailer writing a customer row into ANOTHER retailer's book
-- (ownership transfer / cross-tenant create).
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
SELECT pg_temp.report('BYPASS-9 retailer creates customer under retailer B', 'DENIED',
  pg_temp.probe($q$ INSERT INTO customers (retailer_id, customer_name, mobile, imei,
      purchase_value, purchase_date, emi_amount, emi_tenure)
    VALUES ('10000000-0000-4000-8000-00000000000b','EVIL','9999999999','999999999999999',
      1000,'2025-01-01',100,10) $q$));
RESET ROLE;

-- BYPASS-10 — retailer moving their OWN customer into retailer B's book.
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
SELECT pg_temp.report('BYPASS-10 retailer reassigns own customer to retailer B', 'DENIED0',
  pg_temp.probe($q$ UPDATE customers
      SET retailer_id = '10000000-0000-4000-8000-00000000000b'
      WHERE id = '20000000-0000-4000-8000-00000000000a' $q$)
  || (SELECT count(*)::TEXT FROM customers
       WHERE id='20000000-0000-4000-8000-00000000000a'
         AND retailer_id='10000000-0000-4000-8000-00000000000b'));
RESET ROLE;

-- BYPASS-11 — retailer escalating their own role to super_admin.
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
-- RLS filters the row rather than raising, so the UPDATE "succeeds" against
-- zero rows. What matters is that no row actually changed — asserted in 11b.
SELECT pg_temp.report('BYPASS-11 retailer escalates own role to super_admin (rows changed)', '0',
  (SELECT count(*)::TEXT FROM profiles
      WHERE user_id='00000000-0000-4000-8000-00000000000a' AND role='super_admin'));
RESET ROLE;
SELECT pg_temp.report('BYPASS-11b role in DB after escalation attempt', 'retailer',
  (SELECT role FROM profiles WHERE user_id='00000000-0000-4000-8000-00000000000a'));
