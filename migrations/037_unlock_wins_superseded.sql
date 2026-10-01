-- ============================================================
-- 037 — UNLOCK-WINS (stale LOCK commands ack SUPERSEDED)
-- Safe to re-run. Idempotent.
--
-- The app now stamps a local unlock watermark on every unlock (backend UNLOCK,
-- offline TOTP code, offline SMS UNLOCK) and, when a LOCK command issued BEFORE
-- that watermark is polled, acks it with result SUPERSEDED instead of executing
-- it — so an offline unlock always sticks even when the server was not updated.
-- The ack route closes the command with status 'SUPERSEDED' and sets the device
-- management_status to ACTIVE.
--
-- The only schema change required: widen the device_commands.status CHECK
-- constraint to admit the new terminal status 'SUPERSEDED'.
--
-- NOTHING ELSE is needed for this change:
--   • devices.policies (migration 034) is JSONB and already stores the new
--     protection keys (uninstallBlocked, factoryResetBlocked, safeBootBlocked,
--     addUserBlocked, debuggingBlocked, userControlDisabled, frpSupported,
--     frpEnabled, accessibilityEnabled, overlayGranted, sdkInt).
--   • audit_log.action is unconstrained TEXT — the new LOCK_SUPERSEDED /
--     UNLOCK_SUPERSEDED audit strings insert without any change.
--   • The unlock watermark itself lives on the device (SharedPreferences),
--     not in the database.
--   • The admin payment-summary fix reads the existing get_due_breakdown RPC
--     and emi_schedule columns — no new SQL.
-- ============================================================

-- Deterministic auto-name: Postgres names an inline column CHECK
-- `{table}_{column}_check`, i.e. `device_commands_status_check`.
ALTER TABLE device_commands DROP CONSTRAINT IF EXISTS device_commands_status_check;

-- Bulletproof fallback: drop ANY check constraint touching the status column
-- (in case the live table's constraint was created under a different name),
-- then add ours back with the widened set. Idempotent. Guarded with
-- to_regclass so this file also runs standalone on a fresh database.
DO $$
DECLARE
  cname TEXT;
BEGIN
  IF to_regclass('public.device_commands') IS NOT NULL THEN
    FOR cname IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
      WHERE con.conrelid = 'public.device_commands'::regclass
        AND con.contype = 'c'
        AND att.attname = 'status'
    LOOP
      EXECUTE format('ALTER TABLE public.device_commands DROP CONSTRAINT %I', cname);
    END LOOP;
    ALTER TABLE public.device_commands ADD CONSTRAINT device_commands_status_check
      CHECK (status IN (
        'PENDING', 'RECEIVED', 'EXECUTED', 'FAILED', 'EXPIRED', 'CANCELLED', 'SUPERSEDED'
      ));
  END IF;
END $$;

DO $$ BEGIN
  RAISE NOTICE '037: device_commands.status admits SUPERSEDED (unlock-wins)';
END $$;
