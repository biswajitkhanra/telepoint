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
