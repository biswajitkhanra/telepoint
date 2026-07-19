-- 026: Performance indexes
--
-- The portal's hot queries (reports, analysis, retailer dashboard, searches,
-- approvals) filter on columns that had no index, so Postgres was doing full
-- table scans on every request. These indexes cover every hot path. All
-- statements are idempotent (IF NOT EXISTS) - safe to run more than once.
-- Paste this whole file into the Supabase SQL editor and run it.

-- Trigram extension: makes ILIKE '%name%' searches use an index.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── customers ────────────────────────────────────────────────────────────────
-- Retailer portfolio scans (metrics, emi-lists, retailer summary, dashboards).
CREATE INDEX IF NOT EXISTS idx_customers_retailer_status
  ON customers (retailer_id, status);
-- Status-scoped scans (running book, exports by status).
CREATE INDEX IF NOT EXISTS idx_customers_status
  ON customers (status);
-- Login + admin/retailer search by exact identifiers.
CREATE INDEX IF NOT EXISTS idx_customers_mobile   ON customers (mobile);
CREATE INDEX IF NOT EXISTS idx_customers_aadhaar  ON customers (aadhaar);
CREATE INDEX IF NOT EXISTS idx_customers_imei     ON customers (imei);
-- Name search uses ILIKE '%query%' - needs a trigram GIN index to be fast.
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm
  ON customers USING gin (customer_name gin_trgm_ops);
-- Analysis / top-products bucket by purchase date.
CREATE INDEX IF NOT EXISTS idx_customers_purchase_date
  ON customers (purchase_date);

-- ── emi_schedule ─────────────────────────────────────────────────────────────
-- THE most important one: every per-customer EMI fetch joins on customer_id.
-- Postgres does NOT auto-index foreign keys.
CREATE INDEX IF NOT EXISTS idx_emi_customer_emino
  ON emi_schedule (customer_id, emi_no);
-- Due-date windows (EMI filters, collection sheets, upcoming/overdue lists).
CREATE INDEX IF NOT EXISTS idx_emi_status_due
  ON emi_schedule (status, due_date);
CREATE INDEX IF NOT EXISTS idx_emi_due_date
  ON emi_schedule (due_date);

-- ── payment_requests ─────────────────────────────────────────────────────────
-- Approvals inbox (status filter, newest first).
CREATE INDEX IF NOT EXISTS idx_payreq_status_created
  ON payment_requests (status, created_at DESC);
-- Retailer-scoped payment reads (metrics, reports, retailer history).
CREATE INDEX IF NOT EXISTS idx_payreq_retailer_status
  ON payment_requests (retailer_id, status);
-- Per-customer payment history.
CREATE INDEX IF NOT EXISTS idx_payreq_customer
  ON payment_requests (customer_id);
-- Month-wise collection reports bucket by approval time.
CREATE INDEX IF NOT EXISTS idx_payreq_approved_at
  ON payment_requests (approved_at);
-- UTR / reference search.
CREATE INDEX IF NOT EXISTS idx_payreq_utr
  ON payment_requests (utr);

-- ── broadcast_messages ───────────────────────────────────────────────────────
-- Every customer/retailer login pulls active broadcasts for one retailer.
CREATE INDEX IF NOT EXISTS idx_broadcast_retailer_expiry
  ON broadcast_messages (target_retailer_id, expires_at);

-- ── customer_app_tokens ──────────────────────────────────────────────────────
-- Token auto-login lookup + per-customer upsert.
CREATE INDEX IF NOT EXISTS idx_app_tokens_token
  ON customer_app_tokens (token);
CREATE INDEX IF NOT EXISTS idx_app_tokens_customer
  ON customer_app_tokens (customer_id);

-- ── profiles / retailers ─────────────────────────────────────────────────────
-- Role check on every API request; retailer resolution by auth user.
CREATE INDEX IF NOT EXISTS idx_profiles_user_id
  ON profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_retailers_auth_user
  ON retailers (auth_user_id);

-- Refresh planner statistics so the new indexes are used immediately.
ANALYZE customers;
ANALYZE emi_schedule;
ANALYZE payment_requests;
ANALYZE broadcast_messages;
ANALYZE customer_app_tokens;
ANALYZE profiles;
ANALYZE retailers;
