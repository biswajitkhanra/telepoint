-- STEP 2 of 6 — RESTORE (the ONLY step that writes). Run ONLY if Step 1 showed 139 / 29 / 263440.00.
-- Changes nothing unless it matches exactly 139 rows. Safe to re-run.

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
