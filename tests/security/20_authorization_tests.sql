-- ============================================================================
-- Security regression suite for the TelePoint EMI portal.
--
-- Each test "becomes" a PostgREST role and sets the JWT subject the way
-- Supabase does, then asserts what that caller can and cannot reach.
--
-- Group 1 (SEC-*)  attack tests      — must be DENIED after the fix.
-- Group 2 (BIZ-*)  legitimate flows  — must KEEP WORKING after the fix.
-- ============================================================================

\set QUIET on
\pset tuples_only on
\pset format unaligned
\set ON_ERROR_STOP off

CREATE OR REPLACE FUNCTION pg_temp.report(label TEXT, expected TEXT, actual TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF expected = actual THEN
    RAISE NOTICE 'PASS  % (%)', label, actual;
  ELSE
    RAISE NOTICE 'FAIL  % — expected %, got %', label, expected, actual;
  END IF;
END $$;

-- Helper: run a call as a given role/user and report ALLOWED or DENIED.
CREATE OR REPLACE FUNCTION pg_temp.probe(sql TEXT) RETURNS TEXT
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE sql;
  RETURN 'ALLOWED';
EXCEPTION
  WHEN insufficient_privilege THEN RETURN 'DENIED';
  WHEN OTHERS THEN
    IF SQLERRM ILIKE '%not authorized%' OR SQLERRM ILIKE '%permission denied%' THEN
      RETURN 'DENIED';
    END IF;
    RETURN 'ERROR: ' || SQLERRM;
END $$;

\echo ''
\echo '--- GROUP 1: ATTACKS (must be DENIED) ---'

-- SEC-001 — retailer A self-approves their own PENDING payment request,
-- bypassing the super-admin approval workflow entirely.
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
SET request.jwt.claim.role = 'authenticated';
SELECT pg_temp.report(
  'SEC-001 retailer self-approves payment request',
  'DENIED',
  pg_temp.probe($q$ SELECT approve_payment_request(
      '30000000-0000-4000-8000-00000000000a'::uuid,
      '00000000-0000-4000-8000-00000000000a'::uuid, 'self-approved') $q$));
RESET ROLE;

-- SEC-006 — retailer A reads retailer B's customer due breakdown (IDOR).
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
SELECT pg_temp.report(
  'SEC-006 retailer A reads retailer B customer dues',
  'DENIED',
  pg_temp.probe($q$ SELECT get_due_breakdown('20000000-0000-4000-8000-00000000000b'::uuid) $q$));
RESET ROLE;

-- SEC-011 — retailer reads the portfolio-wide, all-retailer analytics.
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
SELECT pg_temp.report(
  'SEC-011 retailer reads all-retailer analytics',
  'DENIED',
  pg_temp.probe($q$ SELECT get_emi_analysis(1, 2025) $q$));
RESET ROLE;

-- SEC-001b — retailer triggers portfolio-wide fine recalculation.
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
SELECT pg_temp.report(
  'SEC-001b retailer runs recalc_all_fines',
  'DENIED',
  pg_temp.probe($q$ SELECT recalc_all_fines() $q$));
RESET ROLE;

-- SEC-001c — retailer recalculates fines on ANOTHER retailer's customer.
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
SELECT pg_temp.report(
  'SEC-001c retailer runs recalc_customer_fines on foreign customer',
  'DENIED',
  pg_temp.probe($q$ SELECT recalc_customer_fines('20000000-0000-4000-8000-00000000000b'::uuid) $q$));
RESET ROLE;

-- SEC-006b — anonymous (logged-out) caller reads a due breakdown.
SET ROLE anon;
SET request.jwt.claim.sub = '';
SELECT pg_temp.report(
  'SEC-006b anonymous reads due breakdown',
  'DENIED',
  pg_temp.probe($q$ SELECT get_due_breakdown('20000000-0000-4000-8000-00000000000a'::uuid) $q$));
RESET ROLE;

-- SEC-016 — anonymous caller reads customer auto-login tokens.
SET ROLE anon;
SET request.jwt.claim.sub = '';
SELECT pg_temp.report(
  'SEC-016 anonymous reads customer_app_tokens (rows leaked)',
  '0',
  (SELECT count(*)::TEXT FROM customer_app_tokens));
RESET ROLE;

-- Cross-tenant table reads must stay blocked by RLS (regression guard).
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
SELECT pg_temp.report(
  'RLS retailer A cannot SELECT retailer B customers',
  '0',
  (SELECT count(*)::TEXT FROM customers WHERE retailer_id = '10000000-0000-4000-8000-00000000000b'));
RESET ROLE;

\echo ''
\echo '--- GROUP 2: LEGITIMATE FLOWS (must KEEP WORKING) ---'

-- BIZ-1 — retailer reads their OWN customer's due breakdown.
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
SELECT pg_temp.report(
  'BIZ-1 retailer reads own customer dues',
  'ALLOWED',
  pg_temp.probe($q$ SELECT get_due_breakdown('20000000-0000-4000-8000-00000000000a'::uuid) $q$));
RESET ROLE;

-- BIZ-2 — super admin reads ANY customer's due breakdown.
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000ad';
SELECT pg_temp.report(
  'BIZ-2 super admin reads any customer dues',
  'ALLOWED',
  pg_temp.probe($q$ SELECT get_due_breakdown('20000000-0000-4000-8000-00000000000b'::uuid) $q$));
RESET ROLE;

-- BIZ-3 — super admin reads the all-retailer analytics dashboard.
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000ad';
SELECT pg_temp.report(
  'BIZ-3 super admin reads analytics',
  'ALLOWED',
  pg_temp.probe($q$ SELECT get_emi_analysis(1, 2025) $q$));
RESET ROLE;

-- BIZ-4 — the server (service_role) reads a due breakdown on behalf of the
-- customer portal (/api/customer-login, /api/customer-app-token).
SET ROLE service_role;
SET request.jwt.claim.sub = '';
SELECT pg_temp.report(
  'BIZ-4 service_role reads due breakdown (customer portal)',
  'ALLOWED',
  pg_temp.probe($q$ SELECT get_due_breakdown('20000000-0000-4000-8000-00000000000a'::uuid) $q$));
RESET ROLE;

-- BIZ-5 — the server approves a payment request (the real admin workflow:
-- /api/payments/approve verifies super_admin, then calls via service_role).
SET ROLE service_role;
SET request.jwt.claim.sub = '';
SELECT pg_temp.report(
  'BIZ-5 service_role approves payment request',
  'ALLOWED',
  pg_temp.probe($q$ SELECT approve_payment_request(
      '30000000-0000-4000-8000-00000000000a'::uuid,
      '00000000-0000-4000-8000-0000000000ad'::uuid, 'approved by admin') $q$));
RESET ROLE;

-- BIZ-6 — that approval actually took effect: EMI #1 is now APPROVED.
SELECT pg_temp.report(
  'BIZ-6 approved EMI marked APPROVED (business effect intact)',
  'APPROVED',
  (SELECT status FROM emi_schedule
    WHERE customer_id = '20000000-0000-4000-8000-00000000000a' AND emi_no = 1));

-- BIZ-7 — retailer can still read their own portfolio.
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
SELECT pg_temp.report(
  'BIZ-7 retailer reads own customers',
  '1',
  (SELECT count(*)::TEXT FROM customers WHERE retailer_id = '10000000-0000-4000-8000-00000000000a'));
RESET ROLE;

-- BIZ-8 — the EMI schedule generated by the portal trigger is intact.
SELECT pg_temp.report(
  'BIZ-8 EMI schedule rows generated by trigger',
  '10',
  (SELECT count(*)::TEXT FROM emi_schedule WHERE customer_id = '20000000-0000-4000-8000-00000000000a'));

\echo ''
\echo '--- HARDENING CHECKS ---'

-- SEC-009 — every SECURITY DEFINER function must pin search_path.
SELECT pg_temp.report(
  'SEC-009 SECURITY DEFINER functions without search_path',
  '0',
  (SELECT count(*)::TEXT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND COALESCE(array_to_string(p.proconfig, ','), '') NOT LIKE '%search_path%'));
