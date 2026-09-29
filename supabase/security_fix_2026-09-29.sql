-- ============================================================================
-- SECURITY FIX for the Supabase "Security Advisor" warnings (2026-09-29)
-- Changes ONLY function settings and function permissions.
-- Does NOT read-modify-write any customer / EMI / payment row.
-- Paste the WHOLE file into Supabase -> SQL Editor -> Run. Safe to run again.
-- The table shown at the end is read-only evidence for the 4 EMIs (see PART 3).
-- ============================================================================


-- ============================================================================
-- PART 1 — "Function Search Path Mutable" (lint 0011)
-- Pins search_path on every function from this repository. None of their
-- bodies uses an object outside the public schema except auth.uid(), which is
-- already schema-qualified, so behaviour is unchanged.
-- The 2 functions that are NOT in the repository (force_reset_telepoint_admin,
-- handle_new_portal_user) are NOT changed here: their code is unknown, and
-- pinning search_path could break them.
-- ============================================================================
DO $$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.get_my_role()',
    'public.get_my_retailer_id()',
    'public.to_code36(bigint)',
    'public.next_customer_code()',
    'public.assign_customer_code()',
    'public.generate_emi_schedule(uuid)',
    'public.trigger_generate_emi_schedule()',
    'public.trigger_regenerate_emi_on_update()',
    'public.fn_generate_emi_schedule()',
    'public.fn_check_auto_complete()',
    'public.fn_set_updated_at()',
    'public.recalc_customer_fines(uuid)',
    'public.recalc_all_fines()',
    'public.get_due_breakdown(uuid, integer)',
    'public.approve_payment_request(uuid, uuid, text)',
    'public.submit_payment_request(uuid, uuid, uuid, text, text, text, uuid[], integer[], numeric, numeric, numeric, numeric, numeric, integer, date, jsonb, text, boolean)',
    'public._emi_period_metrics(integer, integer)',
    'public.get_emi_analysis(integer, integer)'
  ]
  LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', f);
    ELSE
      RAISE NOTICE 'skipped (not present): %', f;
    END IF;
  END LOOP;
END $$;


-- ============================================================================
-- PART 2 — "Public / Signed-In Users Can Execute SECURITY DEFINER Function"
-- (lints 0028 / 0029). Removes the ability to call these directly over the
-- REST API (/rest/v1/rpc/...). Triggers keep working: PostgreSQL does not
-- check EXECUTE permission when a trigger fires.
-- ============================================================================
DO $$
DECLARE
  v_uses_generate BOOLEAN;
BEGIN
  -- Trigger-only functions — never meant to be called over the API.
  IF to_regprocedure('public.fn_check_auto_complete()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.fn_check_auto_complete() FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.fn_generate_emi_schedule()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.fn_generate_emi_schedule() FROM PUBLIC, anon, authenticated;
  END IF;

  -- generate_emi_schedule(uuid) DELETES a customer's whole EMI schedule and
  -- rebuilds it. Anyone could call it over the API. It is only needed when
  -- the customer triggers are bound to the older migration-001 functions;
  -- this database uses fn_generate_emi_schedule (report row 8). The check
  -- below leaves it callable if that ever changes.
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.customers'::regclass AND NOT t.tgisinternal
      AND p.proname IN ('trigger_generate_emi_schedule', 'trigger_regenerate_emi_on_update')
  ) INTO v_uses_generate;
  IF to_regprocedure('public.generate_emi_schedule(uuid)') IS NOT NULL THEN
    IF v_uses_generate THEN
      REVOKE EXECUTE ON FUNCTION public.generate_emi_schedule(uuid) FROM anon;
      RAISE NOTICE 'generate_emi_schedule: revoked from anon only (still used by the customer triggers).';
    ELSE
      REVOKE EXECUTE ON FUNCTION public.generate_emi_schedule(uuid) FROM PUBLIC, anon, authenticated;
    END IF;
  END IF;

  -- NOT in the repository and NOT called by the app. By its name it resets
  -- the admin account, and right now anyone on the internet can call it.
  -- Locked (not deleted): service_role and the dashboard can still use it.
  IF to_regprocedure('public.force_reset_telepoint_admin()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.force_reset_telepoint_admin() FROM PUBLIC, anon, authenticated;
  END IF;

  -- NOT in the repository. By its name it is a trigger on new sign-ups;
  -- a trigger keeps firing after EXECUTE is revoked.
  IF to_regprocedure('public.handle_new_portal_user()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.handle_new_portal_user() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- "Security Definer View" (lint 0010) — emi_schedule_state (migration 015)
-- ran with its creator's rights, bypassing emi_schedule's RLS: anyone with the
-- public anon key could read every customer's EMI rows through it. No app code
-- reads this view (it appears only in SQL files). security_invoker makes it
-- obey the caller's RLS, exactly like emi_schedule itself; anon gets no access.
ALTER VIEW public.emi_schedule_state SET (security_invoker = true);
REVOKE ALL ON public.emi_schedule_state FROM anon;

-- INTENTIONALLY LEFT AS THEY ARE (these warnings will remain, by design):
--   * get_my_role(), get_my_retailer_id() — every RLS policy calls them as
--     the signed-in user; revoking would break every table read in the app.
--     They only return the caller's own role / retailer id.
--   * get_due_breakdown(uuid, integer), get_emi_analysis(integer, integer) —
--     called from the browser by the admin / retailer pages; both check the
--     caller inside the function (migration 028).

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- PART 3 — READ-ONLY evidence for the 4 part-paid EMIs from the last check.
-- Nothing is changed. Look up these 4 in a backup taken BEFORE
-- 2026-09-29 06:05 IST (Supabase: Database -> Backups, or your own
-- Google Drive / GitHub backup):
--   * if their status there was APPROVED, this morning's bad upgrade flipped
--     them, and they should go back to APPROVED;
--   * if it was already PARTIALLY_PAID, they are correct and stay as they are.
-- ============================================================================
SELECT c.customer_code,
       c.customer_name,
       c.status                          AS customer_status,
       es.emi_no,
       es.status                         AS emi_status_now,
       es.amount,
       es.partial_paid_amount,
       es.amount - es.partial_paid_amount AS shown_as_still_due,
       es.due_date,
       es.paid_at,
       es.fine_amount,
       es.fine_paid_amount,
       (SELECT COALESCE(SUM(pri.amount), 0)
          FROM payment_request_items pri
          JOIN payment_requests pr ON pr.id = pri.payment_request_id AND pr.status = 'APPROVED'
         WHERE pri.emi_schedule_id = es.id) AS approved_requests_total
FROM emi_schedule es
JOIN customers c ON c.id = es.customer_id
WHERE es.status = 'PARTIALLY_PAID'
  AND es.paid_at IS NOT NULL
  AND es.updated_at = '2026-09-29 06:05:00.079735+05:30'::timestamptz
ORDER BY c.customer_code, es.emi_no;
