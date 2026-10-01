-- ============================================================
-- TelePoint — APPLY ALL device-management migrations (030–037)
-- Paste this whole file into the Supabase SQL Editor and RUN once.
-- Idempotent + additive: safe to re-run; does not touch existing data.
-- (Order: 030 → 031 → 032 → 034 → 035 → 036 → 037. There is no 033.)
-- ============================================================


-- >>>>>>>>>>>>>>>>>>>> 030_device_management.sql >>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- 030 — CONSENT-BASED EMI DEVICE MANAGEMENT
-- Safe to re-run. Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS).
--
-- TelePoint finances phones on EMI. The device is the collateral. With the
-- customer's explicit, in-app consent (Android device-admin permission granted
-- by the customer themselves), an authorised retailer/admin can request the
-- financed device to enter its lock state when the account is overdue. The
-- lock uses Android's documented DevicePolicyManager API — no root, no
-- exploits, no hidden APIs. Payment releases it.
--
-- MODEL NOTE: TelePoint has no separate "loans" table — each `customers` row
-- IS one financed phone and its loan. So device.customer_id is also the loan
-- identity; we do not invent a redundant loan_id column.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- SECTION 1: DEVICES — one registered Android install per customer/loan
-- ============================================================
CREATE TABLE IF NOT EXISTS devices (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id        UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  -- Denormalised owning retailer, resolved SERVER-SIDE from the customer at
  -- registration. Never trusted from the client. Kept in sync on re-register.
  retailer_id        UUID NOT NULL REFERENCES retailers(id) ON DELETE RESTRICT,
  -- Secure per-install identifier generated on the device (expo-application /
  -- SecureStore UUID). NOT a hardware id (no IMEI/serial harvested here).
  installation_id    TEXT NOT NULL CHECK (length(installation_id) BETWEEN 8 AND 128),
  device_model        TEXT,
  device_manufacturer TEXT,
  android_version     TEXT,
  app_version         TEXT,
  -- Lifecycle of the managed state as CONFIRMED by the device, not by intent.
  management_status  TEXT NOT NULL DEFAULT 'ACTIVE'
                       CHECK (management_status IN (
                         'ACTIVE', 'LOCK_PENDING', 'LOCKED',
                         'UNLOCK_PENDING', 'ADMIN_PERMISSION_MISSING', 'OFFLINE'
                       )),
  -- Whether the customer has granted the Android device-admin permission.
  admin_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  -- The device's Android management mode, reported by the app. DEVICE_OWNER is
  -- the only mode that supports the hard financing lock (kiosk, can't be exited
  -- or uninstalled by the customer); DEVICE_ADMIN is a soft screen lock only.
  -- Lets the admin panel show whether a given phone is truly hard-lock-enrolled.
  management_mode    TEXT DEFAULT 'UNMANAGED',
  -- Whether the customer accepted the in-app device-management consent screen.
  consent_granted_at TIMESTAMPTZ,
  last_seen_at       TIMESTAMPTZ,
  registered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A given app install maps to exactly one customer/loan.
  UNIQUE (customer_id, installation_id)
);

CREATE INDEX IF NOT EXISTS idx_devices_customer_id  ON devices(customer_id);
CREATE INDEX IF NOT EXISTS idx_devices_retailer_id  ON devices(retailer_id);
CREATE INDEX IF NOT EXISTS idx_devices_status       ON devices(management_status);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen    ON devices(last_seen_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_devices_installation ON devices(installation_id);

-- Idempotent add for environments where `devices` already existed from an
-- earlier partial run of this migration (CREATE TABLE IF NOT EXISTS is a no-op
-- then, so the new column would be skipped).
ALTER TABLE devices ADD COLUMN IF NOT EXISTS management_mode TEXT DEFAULT 'UNMANAGED';

-- ============================================================
-- SECTION 2: DEVICE_COMMANDS — server-authorised LOCK / UNLOCK intents
-- The command is the single source of truth. "PENDING" means requested;
-- only the device may move it to EXECUTED/FAILED after it actually runs.
-- ============================================================
CREATE TABLE IF NOT EXISTS device_commands (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id      UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  customer_id    UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  retailer_id    UUID NOT NULL REFERENCES retailers(id) ON DELETE RESTRICT,
  command_type   TEXT NOT NULL CHECK (command_type IN ('LOCK', 'UNLOCK')),
  reason         TEXT,
  -- Snapshot of the amount due when the command was issued (for the locked
  -- screen). The live value is always re-read from get_due_breakdown too.
  emi_amount     NUMERIC(12,2),
  status         TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN (
                     'PENDING', 'RECEIVED', 'EXECUTED', 'FAILED', 'EXPIRED', 'CANCELLED'
                   )),
  issued_by      UUID REFERENCES auth.users(id),
  issued_by_role TEXT CHECK (issued_by_role IN ('super_admin', 'retailer')),
  expires_at     TIMESTAMPTZ NOT NULL,
  received_at    TIMESTAMPTZ,
  executed_at    TIMESTAMPTZ,
  failure_reason TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devcmd_device_id   ON device_commands(device_id);
CREATE INDEX IF NOT EXISTS idx_devcmd_customer_id ON device_commands(customer_id);
CREATE INDEX IF NOT EXISTS idx_devcmd_retailer_id ON device_commands(retailer_id);
CREATE INDEX IF NOT EXISTS idx_devcmd_status      ON device_commands(status);
CREATE INDEX IF NOT EXISTS idx_devcmd_created_at  ON device_commands(created_at);
CREATE INDEX IF NOT EXISTS idx_devcmd_expires_at  ON device_commands(expires_at);

-- At most one in-flight (PENDING/RECEIVED) command per device — prevents a
-- backlog of duplicate LOCK/UNLOCK intents racing on the device.
CREATE UNIQUE INDEX IF NOT EXISTS uq_devcmd_active_per_device
  ON device_commands(device_id)
  WHERE status IN ('PENDING', 'RECEIVED');

-- ============================================================
-- SECTION 3: updated_at triggers (reuse existing fn_set_updated_at)
-- ============================================================
DO $$
DECLARE tbl TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_set_updated_at') THEN
    FOREACH tbl IN ARRAY ARRAY['devices', 'device_commands'] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at ON %I', tbl);
      EXECUTE format(
        'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()', tbl);
    END LOOP;
  END IF;
END $$;

-- ============================================================
-- SECTION 4: ROW LEVEL SECURITY
-- Customer-facing reads/writes go through Next.js API routes that hold the
-- signed customer session token and use the service-role key (which bypasses
-- RLS), so no anon customer policy is needed. These policies protect the
-- authenticated admin/retailer surface.
-- ============================================================
ALTER TABLE devices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_commands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "devices_admin_all"    ON devices;
DROP POLICY IF EXISTS "devices_retailer_sel" ON devices;
DROP POLICY IF EXISTS "devices_retailer_upd" ON devices;

CREATE POLICY "devices_admin_all" ON devices
  FOR ALL USING (get_my_role() = 'super_admin');

-- A retailer may READ only devices of customers they own.
CREATE POLICY "devices_retailer_sel" ON devices
  FOR SELECT USING (
    get_my_role() = 'retailer'
    AND customer_id IN (SELECT id FROM customers WHERE retailer_id = get_my_retailer_id())
  );

-- A retailer may UPDATE only devices they own, and never reassign ownership
-- (retailer_id / customer_id are pinned by the WITH CHECK to their tenant).
CREATE POLICY "devices_retailer_upd" ON devices
  FOR UPDATE USING (
    get_my_role() = 'retailer'
    AND retailer_id = get_my_retailer_id()
  ) WITH CHECK (
    get_my_role() = 'retailer'
    AND retailer_id = get_my_retailer_id()
    AND customer_id IN (SELECT id FROM customers WHERE retailer_id = get_my_retailer_id())
  );

DROP POLICY IF EXISTS "devcmd_admin_all"    ON device_commands;
DROP POLICY IF EXISTS "devcmd_retailer_sel" ON device_commands;

CREATE POLICY "devcmd_admin_all" ON device_commands
  FOR ALL USING (get_my_role() = 'super_admin');

-- Retailers may READ the command history for their own customers. Command
-- CREATION is intentionally NOT granted to authenticated retailers here — it
-- flows only through the server route (service role) after full authorisation
-- and audit logging, so a retailer session cannot craft a raw command row.
CREATE POLICY "devcmd_retailer_sel" ON device_commands
  FOR SELECT USING (
    get_my_role() = 'retailer'
    AND retailer_id = get_my_retailer_id()
  );

-- ============================================================
-- SECTION 5: SECURITY FIX — close the open audit_log insert policy.
-- The original policy was `WITH CHECK (TRUE)`, letting any holder of the
-- public anon key write fabricated audit rows over the REST API. Every
-- legitimate insert comes from a SECURITY DEFINER function or a service-role
-- server route (both bypass RLS), so direct inserts can be restricted to
-- super admins — mirroring the fix migration 029 applied to fine_history.
-- ============================================================
DROP POLICY IF EXISTS "audit_service_ins" ON audit_log;
DROP POLICY IF EXISTS "audit_admin_ins"   ON audit_log;
CREATE POLICY "audit_admin_ins" ON audit_log
  FOR INSERT WITH CHECK (get_my_role() = 'super_admin');

-- ============================================================
-- SECTION 6: GRANTS — no direct client execute needed; server uses service role
-- ============================================================
GRANT SELECT ON devices          TO authenticated;
GRANT SELECT ON device_commands  TO authenticated;

DO $$ BEGIN
  RAISE NOTICE '030: devices + device_commands + RLS + audit_log insert hardened';
END $$;
-- <<<<<<<<<<<<<<<<<<<< end 030_device_management.sql <<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>> 031_push_tokens.sql >>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- 031 — PUSH TOKENS (Expo push notifications)
-- Safe to re-run. Idempotent.
--
-- Stores the Expo push token for each customer install so the server can send
-- a real push (device lock/unlock, EMI reminders, broadcasts) that wakes the
-- app even when it is closed. The token is NOT sensitive on its own; writes go
-- through the Next.js API (service role) after verifying the customer session.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS push_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,                       -- ExponentPushToken[...]
  device_id   TEXT,
  platform    TEXT DEFAULT 'android',
  app_version TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_customer ON push_tokens(customer_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_active   ON push_tokens(is_active);

-- updated_at trigger (reuse existing fn if present)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_set_updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_updated_at ON push_tokens';
    EXECUTE 'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON push_tokens
             FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()';
  END IF;
END $$;

-- RLS: customer writes flow through the service-role API route (bypasses RLS).
-- Admins may read; retailers may read tokens of their own customers.
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_admin_all"    ON push_tokens;
DROP POLICY IF EXISTS "push_retailer_sel" ON push_tokens;

CREATE POLICY "push_admin_all" ON push_tokens
  FOR ALL USING (get_my_role() = 'super_admin');

CREATE POLICY "push_retailer_sel" ON push_tokens
  FOR SELECT USING (
    get_my_role() = 'retailer'
    AND customer_id IN (SELECT id FROM customers WHERE retailer_id = get_my_retailer_id())
  );

GRANT SELECT ON push_tokens TO authenticated;

DO $$ BEGIN RAISE NOTICE '031: push_tokens created'; END $$;
-- <<<<<<<<<<<<<<<<<<<< end 031_push_tokens.sql <<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>> 032_reminder_config_and_manual_reminder.sql >>>>>>>>>>>>>>>>>>>>
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
-- <<<<<<<<<<<<<<<<<<<< end 032_reminder_config_and_manual_reminder.sql <<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>> 034_device_actions.sql >>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- 034 — ADVANCED DEVICE ACTIONS (Device Owner)
-- Safe to re-run. Idempotent.
--
-- Adds the generic DEVICE_ACTION command (camera / bluetooth / wifi / usb /
-- airplane / outgoing-calls / wallpaper lock, reboot, app hide) carried in a
-- JSON payload, and a `policies` snapshot on devices that the app reports so the
-- admin panel can show the LIVE state of each toggle (never a guessed state).
--
-- All of these are enforced on-device ONLY under Device Owner; the app reports
-- honestly when a policy could not be applied.
-- ============================================================

-- DEVICE_ACTION command + its JSON payload {action, enabled, package?}.
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS payload JSONB;

ALTER TABLE device_commands DROP CONSTRAINT IF EXISTS device_commands_command_type_check;
ALTER TABLE device_commands ADD  CONSTRAINT device_commands_command_type_check
  CHECK (command_type IN ('LOCK', 'UNLOCK', 'EMI_REMINDER', 'DEVICE_ACTION'));

-- Live policy snapshot reported by the device (camera/bluetooth/wifi/usb/
-- airplane/outgoingCalls/wallpaper booleans + mode). Read by the admin panel.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS policies JSONB;

DO $$ BEGIN
  RAISE NOTICE '034: DEVICE_ACTION command + device_commands.payload + devices.policies';
END $$;
-- <<<<<<<<<<<<<<<<<<<< end 034_device_actions.sql <<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>> 035_device_location_sim.sql >>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- 035 — DEVICE LOCATION + SIM INFORMATION reporting
-- Safe to re-run. Idempotent.
--
-- The admin panel can request the phone's last-known location and its SIM
-- information (carrier / number / slot). The phone reads them with the user's
-- (or Device Owner) granted permission and reports them here; the panel shows
-- what was actually reported (with the time), never a guessed value.
-- ============================================================

-- { lat, lng, accuracy, provider, at } — last location the device reported.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_location JSONB;

-- { count, at, sims: [{ slot, carrier, number, display }] } — reported SIM info.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS sim_info JSONB;

DO $$ BEGIN
  RAISE NOTICE '035: devices.last_location + devices.sim_info';
END $$;
-- <<<<<<<<<<<<<<<<<<<< end 035_device_location_sim.sql <<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>> 036_totp_offline_unlock.sql >>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- 036 — TOTP OFFLINE UNLOCK secret
-- Safe to re-run. Idempotent.
--
-- Per-device shared secret (base32) for RFC-6238 TOTP offline unlock. The device
-- verifies the code locally (no internet); the admin portal shows the current
-- code to read to the customer. Generated server-side at registration.
-- ============================================================

ALTER TABLE devices ADD COLUMN IF NOT EXISTS totp_secret TEXT;

DO $$ BEGIN RAISE NOTICE '036: devices.totp_secret'; END $$;
-- <<<<<<<<<<<<<<<<<<<< end 036_totp_offline_unlock.sql <<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>> 037_unlock_wins_superseded.sql >>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- 037 — UNLOCK-WINS (stale LOCK commands ack SUPERSEDED)
-- Safe to re-run. Idempotent.
--
-- The app now stamps a local unlock watermark on every unlock (backend UNLOCK,
-- offline TOTP code, offline SMS UNLOCK) and acks any LOCK command issued BEFORE
-- that watermark with result SUPERSEDED instead of executing it — so an offline
-- unlock always sticks even when the server was not updated. The ack route
-- closes the command with status 'SUPERSEDED' and sets the device ACTIVE.
-- ============================================================

ALTER TABLE device_commands DROP CONSTRAINT IF EXISTS device_commands_status_check;

-- Bulletproof fallback: drop ANY check constraint touching the status column
-- (in case the live table's constraint was created under a different name),
-- then add ours back with the widened set. Idempotent.
DO $$
DECLARE
  cname TEXT;
BEGIN
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
END $$;

ALTER TABLE public.device_commands ADD CONSTRAINT device_commands_status_check
  CHECK (status IN (
    'PENDING', 'RECEIVED', 'EXECUTED', 'FAILED', 'EXPIRED', 'CANCELLED', 'SUPERSEDED'
  ));

DO $$ BEGIN
  RAISE NOTICE '037: device_commands.status admits SUPERSEDED (unlock-wins)';
END $$;
-- <<<<<<<<<<<<<<<<<<<< end 037_unlock_wins_superseded.sql <<<<<<<<<<<<<<<<<<<<
