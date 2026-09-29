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
