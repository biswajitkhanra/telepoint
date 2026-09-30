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
