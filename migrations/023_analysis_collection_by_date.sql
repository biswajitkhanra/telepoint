-- ============================================================
-- 023 — ANALYSIS: anchor money to the DATA date, not the upload date
-- ------------------------------------------------------------
-- Fixes the Analysis tab so every figure reflects WHEN something
-- actually happened in the business, never when the row was
-- uploaded / approved on the portal:
--
--   • collected  — summed from emi_schedule by each EMI's own
--     collection date (collection_requested_at → paid_at →
--     due_date), plus the 1st-EMI charge in the month it was paid.
--     Previously read payment_requests.approved_at, but history
--     imported from the Google sheet has NO payment_requests, so
--     old months read ₹0 and everything piled into the upload day.
--
--   • bounce     — an installment due this month is a bounce only
--     if it was NOT collected on schedule. A COMPLETE customer's
--     EMIs are paid by definition (even if the imported schedule
--     row still says UNPAID), so they never count as bounced.
--
--   • leaderboards — now list EVERY participating retailer (the
--     LIMIT 5 cap is gone); the collection board is also sourced
--     from emi_schedule by collection date.
--
-- Supersedes the get_emi_analysis / _emi_period_metrics bodies in
-- 018_analysis_dashboard.sql. Idempotent — safe to re-run.
-- Run in: Supabase -> SQL Editor -> New query -> Run
-- ============================================================

-- ── Index that makes the collection-date scan fast ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_emi_paid_at ON emi_schedule(paid_at);

-- ── Per-period metric helper ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _emi_period_metrics(p_month INT, p_year INT)
RETURNS JSONB
LANGUAGE sql STABLE
AS $$
  -- Counts both RUNNING (active) and COMPLETE (finished) loans; SETTLED
  -- early-closures and NPA write-offs are excluded from the business figures.
  SELECT jsonb_build_object(
    'loanGiven', COALESCE((
      SELECT SUM(CASE WHEN COALESCE(disburse_amount, 0) > 0
                      THEN disburse_amount
                      ELSE GREATEST(0, COALESCE(purchase_value, 0) - COALESCE(down_payment, 0)) END)
      FROM customers
      WHERE status IN ('RUNNING', 'COMPLETE')
        AND EXTRACT(YEAR  FROM COALESCE(purchase_date, created_at::date)) = p_year
        AND EXTRACT(MONTH FROM COALESCE(purchase_date, created_at::date)) = p_month), 0),

    'customers', COALESCE((
      SELECT COUNT(*) FROM customers
      WHERE status IN ('RUNNING', 'COMPLETE')
        AND EXTRACT(YEAR  FROM COALESCE(purchase_date, created_at::date)) = p_year
        AND EXTRACT(MONTH FROM COALESCE(purchase_date, created_at::date)) = p_month), 0),

    -- Collected: EMI principal + fine, dated by each EMI's collection date,
    -- plus the 1st-EMI charge in the month it was paid.
    'collected', (
      COALESCE((
        SELECT SUM(
          CASE WHEN es.status = 'APPROVED' OR c.status = 'COMPLETE'
               THEN COALESCE(es.amount, 0)
               ELSE COALESCE(es.partial_paid_amount, 0) END
          + COALESCE(es.fine_paid_amount, 0))
        FROM emi_schedule es
        JOIN customers c ON c.id = es.customer_id AND c.status IN ('RUNNING', 'COMPLETE')
        WHERE (es.status = 'APPROVED' OR c.status = 'COMPLETE'
               OR COALESCE(es.partial_paid_amount, 0) > 0
               OR COALESCE(es.fine_paid_amount, 0) > 0)
          AND EXTRACT(YEAR  FROM COALESCE(es.collection_requested_at::date, es.paid_at::date, es.due_date)) = p_year
          AND EXTRACT(MONTH FROM COALESCE(es.collection_requested_at::date, es.paid_at::date, es.due_date)) = p_month
      ), 0)
      + COALESCE((
        SELECT SUM(first_emi_charge_amount) FROM customers
        WHERE status IN ('RUNNING', 'COMPLETE') AND first_emi_charge_paid_at IS NOT NULL
          AND EXTRACT(YEAR  FROM first_emi_charge_paid_at) = p_year
          AND EXTRACT(MONTH FROM first_emi_charge_paid_at) = p_month
      ), 0)
    ),

    'dueEmis', COALESCE((
      SELECT COUNT(*) FROM emi_schedule es
      JOIN customers c ON c.id = es.customer_id AND c.status IN ('RUNNING', 'COMPLETE')
      WHERE EXTRACT(YEAR  FROM es.due_date) = p_year
        AND EXTRACT(MONTH FROM es.due_date) = p_month), 0),

    -- Bounce: due this month AND not collected on schedule. A COMPLETE
    -- customer's installment is paid by definition, so never a bounce.
    'bouncedEmis', COALESCE((
      SELECT COUNT(*) FROM emi_schedule es
      JOIN customers c ON c.id = es.customer_id AND c.status IN ('RUNNING', 'COMPLETE')
      WHERE EXTRACT(YEAR  FROM es.due_date) = p_year
        AND EXTRACT(MONTH FROM es.due_date) = p_month
        AND es.status <> 'APPROVED'
        AND c.status <> 'COMPLETE'), 0)
  );
$$;

-- ── Main RPC consumed by components/AnalysisDashboard.tsx ────────────────────
CREATE OR REPLACE FUNCTION get_emi_analysis(p_month INT, p_year INT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'thisYear', _emi_period_metrics(p_month, p_year),
    'lastYear', _emi_period_metrics(p_month, p_year - 1),

    -- Lead Generation Leaderboard: new customers each retailer added this
    -- month (current year). ALL retailers, no top-N cap.
    'leadLeaderboard', (
      SELECT COALESCE(
        jsonb_agg(jsonb_build_object('retailerId', id, 'name', name, 'value', cnt) ORDER BY cnt DESC),
        '[]'::jsonb)
      FROM (
        SELECT r.id, r.name, COUNT(c.id) AS cnt
        FROM retailers r
        JOIN customers c ON c.retailer_id = r.id AND c.status IN ('RUNNING', 'COMPLETE')
        WHERE EXTRACT(YEAR  FROM COALESCE(c.purchase_date, c.created_at::date)) = p_year
          AND EXTRACT(MONTH FROM COALESCE(c.purchase_date, c.created_at::date)) = p_month
        GROUP BY r.id, r.name
        ORDER BY cnt DESC
      ) s
    ),

    -- Collection Leaderboard: rupees each retailer collected this month, by
    -- collection date (EMI principal + fine + 1st-EMI charge). ALL retailers.
    'collectionLeaderboard', (
      SELECT COALESCE(
        jsonb_agg(jsonb_build_object('retailerId', id, 'name', name, 'value', total) ORDER BY total DESC),
        '[]'::jsonb)
      FROM (
        SELECT r.id, r.name, SUM(x.amt) AS total
        FROM (
          SELECT c.retailer_id AS rid,
            (CASE WHEN es.status = 'APPROVED' OR c.status = 'COMPLETE'
                  THEN COALESCE(es.amount, 0)
                  ELSE COALESCE(es.partial_paid_amount, 0) END
             + COALESCE(es.fine_paid_amount, 0)) AS amt,
            COALESCE(es.collection_requested_at::date, es.paid_at::date, es.due_date) AS cdate
          FROM emi_schedule es
          JOIN customers c ON c.id = es.customer_id AND c.status IN ('RUNNING', 'COMPLETE')
          WHERE (es.status = 'APPROVED' OR c.status = 'COMPLETE'
                 OR COALESCE(es.partial_paid_amount, 0) > 0
                 OR COALESCE(es.fine_paid_amount, 0) > 0)
          UNION ALL
          SELECT c.retailer_id AS rid,
            COALESCE(c.first_emi_charge_amount, 0) AS amt,
            c.first_emi_charge_paid_at::date AS cdate
          FROM customers c
          WHERE c.status IN ('RUNNING', 'COMPLETE')
            AND c.first_emi_charge_paid_at IS NOT NULL
            AND COALESCE(c.first_emi_charge_amount, 0) > 0
        ) x
        JOIN retailers r ON r.id = x.rid
        WHERE EXTRACT(YEAR  FROM x.cdate) = p_year
          AND EXTRACT(MONTH FROM x.cdate) = p_month
        GROUP BY r.id, r.name
        HAVING SUM(x.amt) > 0
        ORDER BY total DESC
      ) s
    )
  );
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION _emi_period_metrics(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_emi_analysis(INT, INT)    TO authenticated;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Example:
--   SELECT get_emi_analysis(6, 2026);   -- June 2026 vs June 2025
