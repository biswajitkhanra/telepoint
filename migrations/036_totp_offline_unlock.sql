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
