-- ============================================================
-- 029 — Push Notifications Infrastructure & Multi-Device Tokens
-- ------------------------------------------------------------
-- Safe to run multiple times (idempotent).
-- Extends customer_app_tokens for Expo/FCM push token registration
-- and introduces notification_deliveries for deterministic idempotency
-- and tracking of automatic EMI reminders and broadcast push alerts.
-- ============================================================

-- ── 1. Enhance customer_app_tokens ───────────────────────────
-- In addition to the auto-login token, this stores push notification tokens
-- and device metadata. Multiple devices per customer are supported.
ALTER TABLE customer_app_tokens
  ADD COLUMN IF NOT EXISTS push_token TEXT,
  ADD COLUMN IF NOT EXISTS device_id TEXT,
  ADD COLUMN IF NOT EXISTS device_name TEXT,
  ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'android',
  ADD COLUMN IF NOT EXISTS app_version TEXT,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ DEFAULT NOW();

-- Indexes for efficient push token lookups
CREATE INDEX IF NOT EXISTS idx_cat_customer_active 
  ON customer_app_tokens(customer_id, is_active);

CREATE INDEX IF NOT EXISTS idx_cat_push_token 
  ON customer_app_tokens(push_token) 
  WHERE push_token IS NOT NULL AND is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_cat_customer_device 
  ON customer_app_tokens(customer_id, device_id);

COMMENT ON COLUMN customer_app_tokens.push_token IS
  'Expo push token (ExponentPushToken[...]) or native FCM token for push delivery';

COMMENT ON COLUMN customer_app_tokens.device_id IS
  'Unique client device identifier to distinguish multiple devices belonging to the same customer';

-- ── 2. Create notification_deliveries table ───────────────────
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_type   TEXT NOT NULL CHECK (notification_type IN ('emi_reminder', 'broadcast', 'system')),
  customer_id         UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  emi_schedule_id     UUID REFERENCES emi_schedule(id) ON DELETE CASCADE,
  broadcast_id        UUID REFERENCES broadcast_messages(id) ON DELETE CASCADE,
  token_id            UUID REFERENCES customer_app_tokens(id) ON DELETE SET NULL,
  push_token          TEXT NOT NULL,
  title               TEXT NOT NULL,
  body                TEXT NOT NULL,
  data                JSONB DEFAULT '{}'::JSONB,
  idempotency_key     TEXT NOT NULL UNIQUE,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'invalid_token')),
  expo_ticket_id      TEXT,
  error_message       TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  sent_at             TIMESTAMPTZ
);

-- Indexes for performance & deduplication
CREATE INDEX IF NOT EXISTS idx_notif_deliveries_idemp 
  ON notification_deliveries(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_notif_deliveries_customer 
  ON notification_deliveries(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notif_deliveries_emi 
  ON notification_deliveries(emi_schedule_id);

CREATE INDEX IF NOT EXISTS idx_notif_deliveries_broadcast 
  ON notification_deliveries(broadcast_id);

CREATE INDEX IF NOT EXISTS idx_notif_deliveries_status 
  ON notification_deliveries(status);

-- ── 3. RLS for notification_deliveries ───────────────────────
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_deliveries_admin_all" ON notification_deliveries;
CREATE POLICY "notif_deliveries_admin_all" ON notification_deliveries
  FOR ALL USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS "notif_deliveries_retailer_read" ON notification_deliveries;
CREATE POLICY "notif_deliveries_retailer_read" ON notification_deliveries
  FOR SELECT USING (
    get_my_role() = 'retailer' AND
    customer_id IN (SELECT id FROM customers WHERE retailer_id = get_my_retailer_id())
  );

GRANT SELECT ON notification_deliveries TO anon;
GRANT SELECT, INSERT, UPDATE ON notification_deliveries TO authenticated;
GRANT ALL ON notification_deliveries TO service_role;

-- ── 4. Schema reload ──────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  RAISE NOTICE 'Migration 029 complete: push_tokens extended on customer_app_tokens, notification_deliveries table created.';
END $$;
