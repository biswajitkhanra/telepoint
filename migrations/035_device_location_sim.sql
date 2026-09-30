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
