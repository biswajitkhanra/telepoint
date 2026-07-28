-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 028: Add `payment_date` to payment_requests
--
-- The EMI Portal uses `approved_at` as a proxy for "when was this payment
-- collected?", but the actual payment may happen on a different calendar day
-- (e.g. a retailer collects cash on Saturday, admin approves on Monday).
--
-- `payment_date` is a DATE column (no timezone — it's always an IST calendar
-- date) that stores the real business date of the payment. Reports, analytics,
-- dashboard KPIs and exports must use this column for financial bucketing.
--
-- Backfill: existing APPROVED rows get payment_date derived from approved_at
-- (converted to IST) or created_at as fallback.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Add the column
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS payment_date DATE;

-- 2. Backfill existing APPROVED records
UPDATE payment_requests
SET payment_date = (COALESCE(approved_at, created_at) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::DATE
WHERE status = 'APPROVED' AND payment_date IS NULL;

-- 3. Backfill PENDING / REJECTED records too (use created_at)
UPDATE payment_requests
SET payment_date = (COALESCE(created_at, NOW()) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::DATE
WHERE payment_date IS NULL;

-- 4. Performance index for date-range queries on reports
CREATE INDEX IF NOT EXISTS idx_pr_payment_date
  ON payment_requests (payment_date)
  WHERE status = 'APPROVED';

-- 5. Composite index for retailer-scoped date queries
CREATE INDEX IF NOT EXISTS idx_pr_retailer_payment_date
  ON payment_requests (retailer_id, payment_date)
  WHERE status = 'APPROVED';

-- 6. Add comment
COMMENT ON COLUMN payment_requests.payment_date IS
  'IST calendar date when the payment was actually collected (user-selectable). '
  'Used for all financial reporting. Falls back to approved_at/created_at for legacy rows.';
