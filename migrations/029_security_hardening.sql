-- ============================================================================
-- 029_security_hardening.sql
--
-- SECURITY-ONLY migration. It changes NO business rule, NO calculation and NO
-- workflow. Every EMI, fine, payment, settlement, completion and report
-- computation is left byte-for-byte untouched — the existing function bodies
-- are RENAMED, never rewritten. All this migration does is decide WHO is
-- allowed to invoke them and with WHICH customer ids.
--
-- Closes four issues found in the security audit:
--
--   SEC-001 (CRITICAL) Privilege escalation via PostgreSQL's default PUBLIC
--           EXECUTE grant. Every function is created with EXECUTE granted to
--           PUBLIC unless revoked. The repo grants the privileged functions
--           "TO service_role" but never REVOKEs the implicit PUBLIC grant, so
--           `authenticated` (i.e. any logged-in retailer) could call them
--           straight from the browser with the anon key:
--
--             supabase.rpc('approve_payment_request',
--                          { p_request_id: <own pending request>,
--                            p_admin_id:   <any uuid> })
--
--           approve_payment_request() is SECURITY DEFINER and performs NO
--           caller check — it trusts p_admin_id as passed. A retailer could
--           therefore self-approve their own collection requests and bypass
--           the entire super-admin approval workflow, and approve any other
--           retailer's requests too.
--
--   SEC-006 (HIGH) IDOR in get_due_breakdown(). SECURITY DEFINER (so it
--           bypasses RLS), granted to `authenticated`, and it accepts any
--           customer id with no ownership check. Retailer A could read
--           Retailer B's customer dues, fines and outstanding balance.
--
--   SEC-011 (MEDIUM) get_emi_analysis() returns a portfolio-wide, all-retailer
--           leaderboard. It is only ever rendered on the super-admin dashboard,
--           but is executable by any authenticated retailer.
--
--   SEC-009 (MEDIUM) No SECURITY DEFINER function sets search_path, the
--           classic definer-function privilege-escalation vector.
--
-- Idempotent: safe to run more than once, and safe on a database where only
-- some of these functions exist.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. SEC-006 — get_due_breakdown(): enforce retailer ownership.
--
-- The existing implementation is renamed to get_due_breakdown_impl and left
-- COMPLETELY UNCHANGED (same body, same maths, same JSONB shape). A thin
-- wrapper takes its place and does nothing but answer "is this caller allowed
-- to ask about this customer?" before delegating.
--
-- Authorization rules — these mirror what the app already enforces elsewhere,
-- so no legitimate caller changes behaviour:
--   • service_role (auth.uid() IS NULL) → allowed. This is the server calling
--     on behalf of the customer portal (/api/customer-login,
--     /api/customer-app-token), which does its own credential check first.
--   • super_admin  → allowed for every customer (unchanged).
--   • retailer     → allowed only for customers in their own portfolio.
--   • anyone else  → denied.
-- ----------------------------------------------------------------------------

DO $mig$
DECLARE
  v_args TEXT;
BEGIN
  -- RE-RUN GUARD. On a second run get_due_breakdown is already the WRAPPER;
  -- renaming it again would make the new wrapper delegate to itself and
  -- recurse forever. The presence of *_impl means the split already happened,
  -- so there is nothing to rename.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_due_breakdown_impl'
  ) THEN
    RETURN;
  END IF;

  -- Rename every surviving overload of get_due_breakdown to *_impl.
  -- (An incrementally-migrated database can carry both the 1-arg form from
  -- migration 001 and the 2-arg form from migration 002.)
  FOR v_args IN
    SELECT pg_get_function_identity_arguments(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_due_breakdown'
  LOOP
    EXECUTE format('ALTER FUNCTION public.get_due_breakdown(%s) RENAME TO get_due_breakdown_impl', v_args);
  END LOOP;
END
$mig$;

-- Guarded wrapper — 2-argument form (the one the schema files ship and the
-- one PostgREST resolves for rpc('get_due_breakdown', { p_customer_id })).
CREATE OR REPLACE FUNCTION public.get_due_breakdown(
  p_customer_id     UUID,
  p_selected_emi_no INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role  TEXT;
  v_owner UUID;
BEGIN
  -- auth.uid() IS NULL ⇒ the server-side service_role client is calling.
  -- Those callers (customer portal login / customer app token) authenticate
  -- the customer themselves before reaching this point.
  IF auth.uid() IS NOT NULL THEN
    v_role := get_my_role();

    IF v_role IS NULL THEN
      RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
    END IF;

    IF v_role = 'retailer' THEN
      SELECT retailer_id INTO v_owner FROM customers WHERE id = p_customer_id;
      IF v_owner IS NULL OR v_owner IS DISTINCT FROM get_my_retailer_id() THEN
        RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- Business logic untouched — delegate to the original implementation.
  RETURN get_due_breakdown_impl(p_customer_id, p_selected_emi_no);
END;
$$;

-- If the legacy 1-arg implementation is the only one present, the 2-arg
-- wrapper above cannot delegate to it. Provide a matching 1-arg wrapper only
-- in that case, so the call still resolves.
DO $mig$
BEGIN
  IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'get_due_breakdown_impl'
          AND pg_get_function_identity_arguments(p.oid) = 'uuid'
     )
     AND NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'get_due_breakdown_impl'
          AND pg_get_function_identity_arguments(p.oid) = 'uuid, integer'
     )
  THEN
    -- Only the 1-arg implementation exists: drop the 2-arg wrapper we just
    -- created (it would fail at runtime) and expose a 1-arg wrapper instead.
    DROP FUNCTION IF EXISTS public.get_due_breakdown(UUID, INT);

    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.get_due_breakdown(p_customer_id UUID)
      RETURNS JSONB
      LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
      AS $body$
      DECLARE v_role TEXT; v_owner UUID;
      BEGIN
        IF auth.uid() IS NOT NULL THEN
          v_role := get_my_role();
          IF v_role IS NULL THEN
            RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
          END IF;
          IF v_role = 'retailer' THEN
            SELECT retailer_id INTO v_owner FROM customers WHERE id = p_customer_id;
            IF v_owner IS NULL OR v_owner IS DISTINCT FROM get_my_retailer_id() THEN
              RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
            END IF;
          END IF;
        END IF;
        RETURN get_due_breakdown_impl(p_customer_id);
      END;
      $body$;
    $fn$;
  END IF;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 2. SEC-011 — get_emi_analysis(): super-admin only.
--
-- Same technique: the implementation is renamed and left untouched, so the
-- numbers the admin dashboard renders are identical. Only the caller check is
-- new. The admin UI (components/analytics/AnalyticsPro.tsx and
-- components/reports/ReportsHub.tsx) is reached only from /admin, so no
-- legitimate caller loses access.
-- ----------------------------------------------------------------------------

DO $mig$
BEGIN
  -- Same re-run guard as above: *_impl already existing means the wrapper is
  -- in place, so renaming again would create infinite recursion.
  IF EXISTS (
       SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'get_emi_analysis'
     )
     AND NOT EXISTS (
       SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'get_emi_analysis_impl'
     )
  THEN
    ALTER FUNCTION public.get_emi_analysis(INT, INT) RENAME TO get_emi_analysis_impl;

    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.get_emi_analysis(p_month INT, p_year INT)
      RETURNS JSONB
      LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
      AS $body$
      BEGIN
        IF auth.uid() IS NOT NULL AND get_my_role() IS DISTINCT FROM 'super_admin' THEN
          RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
        END IF;
        RETURN get_emi_analysis_impl(p_month, p_year);
      END;
      $body$;
    $fn$;
  END IF;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 3. SEC-001 — revoke the implicit PUBLIC EXECUTE grant.
--
-- These functions are invoked ONLY by the server through the service-role
-- client (see app/api/**). None of them is called from the browser, so
-- removing browser access changes no application behaviour.
--
--   approve_payment_request   — applies an approved collection to the schedule
--   recalc_customer_fines     — per-customer fine recalculation
--   recalc_all_fines          — portfolio-wide fine recalculation
--   apply_overdue_fines       — scheduled fine accrual
--   calculate_and_apply_fines — scheduled fine accrual (older name)
--   generate_emi_schedule     — (re)builds a customer's EMI schedule
--   next_customer_code        — customer-code sequence allocator
--   _emi_period_metrics       — internal helper behind get_emi_analysis
--   *_impl                    — the renamed implementations above; they must
--                               never be reachable directly, or the wrappers'
--                               authorization checks could be side-stepped.
-- ----------------------------------------------------------------------------

DO $mig$
DECLARE
  r RECORD;
  server_only TEXT[] := ARRAY[
    'approve_payment_request',
    'recalc_customer_fines',
    'recalc_all_fines',
    'apply_overdue_fines',
    'calculate_and_apply_fines',
    'generate_emi_schedule',
    'next_customer_code',
    '_emi_period_metrics',
    'get_due_breakdown_impl',
    'get_emi_analysis_impl'
  ];
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(server_only)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC',        r.proname, r.args);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon',          r.proname, r.args);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM authenticated', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', r.proname, r.args);
  END LOOP;
END
$mig$;

-- The two user-facing RPCs stay reachable from the browser, but only for
-- logged-in users — and now behind the ownership / role checks added above.
DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_due_breakdown', 'get_emi_analysis', 'get_my_role', 'get_my_retailer_id')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC',         r.proname, r.args);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon',           r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',  r.proname, r.args);
  END LOOP;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 4. SEC-009 — pin search_path on every SECURITY DEFINER function.
--
-- A SECURITY DEFINER function runs with the privileges of its owner. Without a
-- pinned search_path, a role able to create objects in a schema earlier on the
-- caller's search_path can shadow a table or function the definer body
-- references and have it executed as the owner. Pinning search_path to
-- `public, pg_temp` closes that path.
--
-- ALTER FUNCTION ... SET search_path only changes the execution ENVIRONMENT.
-- It does not touch the function body, so no logic changes.
-- ----------------------------------------------------------------------------

DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef                                    -- SECURITY DEFINER only
      AND COALESCE(array_to_string(p.proconfig, ','), '') NOT LIKE '%search_path%'
  LOOP
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp', r.proname, r.args);
  END LOOP;
END
$mig$;

-- ----------------------------------------------------------------------------
-- 5. Defence in depth — customer_app_tokens.
--
-- migration 010 issued `GRANT SELECT ON customer_app_tokens TO anon`. RLS is
-- enabled on the table and no policy matches the anon role, so anonymous reads
-- are already denied — but the table-level grant means the ONLY thing standing
-- between the public and every customer's auto-login token is RLS being left
-- on. The grant is not needed by any code path (the customer app reads tokens
-- through /api/customer-app-token, which uses the service-role client).
-- ----------------------------------------------------------------------------

-- Guarded: customer_app_tokens is introduced by migration 010 and is absent
-- from some schema baselines. An unguarded REVOKE would abort this whole
-- transaction and silently roll back every fix above.
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'customer_app_tokens'
  ) THEN
    EXECUTE 'REVOKE SELECT ON customer_app_tokens FROM anon';
  END IF;
END
$mig$;

COMMIT;
