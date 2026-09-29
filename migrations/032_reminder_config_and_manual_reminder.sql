-- ============================================================
-- 032 — EMI REMINDER CONFIG + MANUAL EMI REMINDER + EXTENDED DEVICE STATUS
-- Safe to re-run. Idempotent (IF NOT EXISTS / DROP ... IF EXISTS).
--
-- Adds the per-customer/loan reminder configuration the customer app caches
-- locally for its OFFLINE reminder engine (voice on/off, language, overdue
-- on/off), a server-driven MANUAL "Send EMI Reminder" command type, and the two
-- extended device management statuses the brief requires (MANAGEMENT_LOST,
-- UNSUPPORTED).
--
-- MODEL NOTE (unchanged from 030): TelePoint has no separate "loans" table —
-- each `customers` row IS one financed phone and its loan, so the reminder
-- config is keyed by customer_id.
--
-- SCOPE: additive only. No existing row is modified; no financial logic is
-- touched. Automatic reminders NEVER hit the server (Section 11) — this config
-- is synced to the device once, then the device computes the schedule locally.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- SECTION 1: REMINDER_SETTINGS — one row per customer/loan
-- The customer app pulls this (via the service-role device API) and caches it;
-- the admin/retailer portal edits it. Defaults reproduce today's behaviour
-- (reminders on, Bengali voice on the due day only).
-- ============================================================
CREATE TABLE IF NOT EXISTS reminder_settings (
  customer_id              UUID PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  -- Master switch for the automatic local reminder engine.
  reminder_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  -- The every-5-minutes overdue burst. The portal can turn this OFF per loan
  -- (Section 14) without disabling the pre-due / due-day reminders.
  overdue_reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  -- Due-day voice (Section 17). Voice is due-day-only unless voice_on_overdue.
  voice_enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  voice_language           TEXT    NOT NULL DEFAULT 'bn',
  voice_on_overdue         BOOLEAN NOT NULL DEFAULT FALSE,
  -- Bumped whenever the config or the EMI schedule changes, so the device knows
  -- to recompute + reschedule its local alarms (idempotent apply, Section 20).
  schedule_version         INTEGER NOT NULL DEFAULT 1,
  updated_by               UUID REFERENCES auth.users(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reminder_settings_language_chk CHECK (voice_language IN ('bn', 'hi'))
);

CREATE INDEX IF NOT EXISTS idx_reminder_settings_updated ON reminder_settings(updated_at);

-- updated_at trigger (reuse the existing shared fn if present).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_set_updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_updated_at ON reminder_settings';
    EXECUTE 'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON reminder_settings
             FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()';
  END IF;
END $$;

-- Bump schedule_version automatically on any settings change, so a resync is
-- detectable by the device without comparing every field.
CREATE OR REPLACE FUNCTION fn_bump_reminder_version()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.schedule_version := COALESCE(OLD.schedule_version, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bump_reminder_version ON reminder_settings;
CREATE TRIGGER trg_bump_reminder_version
  BEFORE UPDATE ON reminder_settings
  FOR EACH ROW EXECUTE FUNCTION fn_bump_reminder_version();

-- ============================================================
-- SECTION 2: DEVICE_COMMANDS — add the MANUAL EMI reminder command type
-- The automatic reminders are LOCAL and never create a command. The MANUAL
-- admin "Send EMI Reminder" (Section 18) is server-driven, so it rides the same
-- authorised device_commands pipeline as LOCK/UNLOCK, carrying its own voice +
-- language options.
-- ============================================================
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS voice    BOOLEAN;
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS language TEXT;

ALTER TABLE device_commands DROP CONSTRAINT IF EXISTS device_commands_command_type_check;
ALTER TABLE device_commands ADD  CONSTRAINT device_commands_command_type_check
  CHECK (command_type IN ('LOCK', 'UNLOCK', 'EMI_REMINDER'));

ALTER TABLE device_commands DROP CONSTRAINT IF EXISTS device_commands_language_chk;
ALTER TABLE device_commands ADD  CONSTRAINT device_commands_language_chk
  CHECK (language IS NULL OR language IN ('bn', 'hi'));

-- The "one in-flight command per device" guard must apply ONLY to the mutually
-- exclusive lock-state commands. A transient EMI_REMINDER must never block a
-- LOCK/UNLOCK (and vice-versa), so re-scope the unique partial index.
DROP INDEX IF EXISTS uq_devcmd_active_per_device;
CREATE UNIQUE INDEX IF NOT EXISTS uq_devcmd_active_lock_per_device
  ON device_commands(device_id)
  WHERE status IN ('PENDING', 'RECEIVED') AND command_type IN ('LOCK', 'UNLOCK');

-- ============================================================
-- SECTION 3: DEVICES — extended management_status set (Section 29)
-- Adds MANAGEMENT_LOST (device admin/owner was removed while a loan is live —
-- the app reports this so the portal can act) and UNSUPPORTED (the Android
-- version/mode cannot enforce management at all). Existing values are kept.
-- ============================================================
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_management_status_check;
ALTER TABLE devices ADD  CONSTRAINT devices_management_status_check
  CHECK (management_status IN (
    'ACTIVE', 'LOCK_PENDING', 'LOCKED', 'UNLOCK_PENDING',
    'ADMIN_PERMISSION_MISSING', 'OFFLINE', 'MANAGEMENT_LOST', 'UNSUPPORTED'
  ));

-- ============================================================
-- SECTION 4: ROW LEVEL SECURITY for reminder_settings
-- Same model as devices/push_tokens: the customer app reads/writes through the
-- service-role Next.js API (bypasses RLS after verifying the signed customer
-- session); these policies protect the authenticated admin/retailer surface.
-- ============================================================
ALTER TABLE reminder_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reminder_admin_all"    ON reminder_settings;
DROP POLICY IF EXISTS "reminder_retailer_sel" ON reminder_settings;
DROP POLICY IF EXISTS "reminder_retailer_upd" ON reminder_settings;

CREATE POLICY "reminder_admin_all" ON reminder_settings
  FOR ALL USING (get_my_role() = 'super_admin');

-- Retailers may READ the reminder config of their own customers.
CREATE POLICY "reminder_retailer_sel" ON reminder_settings
  FOR SELECT USING (
    get_my_role() = 'retailer'
    AND customer_id IN (SELECT id FROM customers WHERE retailer_id = get_my_retailer_id())
  );

-- Retailers may UPDATE the reminder config of their own customers (voice,
-- language, overdue toggle). Creation of the row is done server-side.
CREATE POLICY "reminder_retailer_upd" ON reminder_settings
  FOR UPDATE USING (
    get_my_role() = 'retailer'
    AND customer_id IN (SELECT id FROM customers WHERE retailer_id = get_my_retailer_id())
  ) WITH CHECK (
    get_my_role() = 'retailer'
    AND customer_id IN (SELECT id FROM customers WHERE retailer_id = get_my_retailer_id())
  );

GRANT SELECT, UPDATE ON reminder_settings TO authenticated;

-- ============================================================
-- SECTION 5: BACKFILL — one default settings row per existing customer, so the
-- app always has config to cache. ON CONFLICT DO NOTHING keeps it idempotent
-- and never overwrites an admin's chosen settings.
-- ============================================================
INSERT INTO reminder_settings (customer_id)
SELECT id FROM customers
ON CONFLICT (customer_id) DO NOTHING;

DO $$ BEGIN
  RAISE NOTICE '032: reminder_settings + EMI_REMINDER command + extended device status';
END $$;
