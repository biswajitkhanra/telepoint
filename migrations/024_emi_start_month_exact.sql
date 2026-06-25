-- ============================================================
-- Migration 024 - EMI start month is honoured EXACTLY
-- ============================================================
-- BUG: When a retailer/admin selected a specific first-EMI month
-- (customers.emi_start_date), the schedule generator still added an
-- extra month -- e.g. selecting July produced a first EMI in August.
-- This happened because the loop ran "start_date + i months" with i
-- beginning at 1, so the chosen month was always pushed forward by one.
--
-- FIX: Treat emi_start_date as the EXACT month the FIRST EMI falls in.
-- Start the loop at offset 0 so EMI #1 lands in the selected month, and
-- only apply the legacy "+1 month after purchase" default when no start
-- month was chosen. Both schema lineages (generate_emi_schedule and the
-- fn_generate_emi_schedule trigger) are redefined so the fix holds no
-- matter how a given database was provisioned.
-- ============================================================

-- Lineage A: generate_emi_schedule(p_customer_id)
CREATE OR REPLACE FUNCTION generate_emi_schedule(p_customer_id UUID)
RETURNS VOID AS $$
DECLARE
  v_customer    RECORD;
  v_base_month  DATE;   -- first day of the month the FIRST EMI falls in
  v_month_start DATE;
  v_last_day    DATE;
  v_due_date    DATE;
  i             INT;
BEGIN
  SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;

  DELETE FROM emi_schedule WHERE customer_id = p_customer_id;

  -- Honour the chosen start month EXACTLY - no automatic +1 shift.
  -- Default (no month chosen) = the month after the purchase month.
  IF v_customer.emi_start_date IS NOT NULL THEN
    v_base_month := DATE_TRUNC('month', v_customer.emi_start_date)::DATE;
  ELSE
    v_base_month := (DATE_TRUNC('month', v_customer.purchase_date) + INTERVAL '1 month')::DATE;
  END IF;

  FOR i IN 0..(v_customer.emi_tenure - 1) LOOP
    v_month_start := (v_base_month + (i || ' months')::INTERVAL)::DATE;
    v_last_day    := (v_month_start + INTERVAL '1 month - 1 day')::DATE;
    -- Clamp emi_due_day to the month end (e.g. day 30 in February).
    v_due_date    := LEAST(v_month_start + (v_customer.emi_due_day - 1), v_last_day);

    INSERT INTO emi_schedule (customer_id, emi_no, due_date, amount)
    VALUES (p_customer_id, i + 1, v_due_date, v_customer.emi_amount);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Make sure an edit to the start month regenerates the schedule.
CREATE OR REPLACE FUNCTION trigger_regenerate_emi_on_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.emi_tenure    != NEW.emi_tenure    OR
     OLD.emi_amount    != NEW.emi_amount    OR
     OLD.purchase_date != NEW.purchase_date OR
     OLD.emi_due_day   != NEW.emi_due_day   OR
     COALESCE(OLD.emi_start_date::TEXT, '') != COALESCE(NEW.emi_start_date::TEXT, '')
  THEN
    PERFORM generate_emi_schedule(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Lineage B: fn_generate_emi_schedule() trigger function
CREATE OR REPLACE FUNCTION fn_generate_emi_schedule()
RETURNS TRIGGER AS $$
DECLARE
  v_base_month  DATE;
  v_due_day     INT;
  v_i           INT;
  v_due_date    DATE;
  v_month_start DATE;
  v_last_day    DATE;
BEGIN
  -- Honour the chosen start month EXACTLY; default to month after purchase.
  IF NEW.emi_start_date IS NOT NULL THEN
    v_base_month := DATE_TRUNC('month', NEW.emi_start_date)::DATE;
  ELSE
    v_base_month := (DATE_TRUNC('month', NEW.purchase_date) + INTERVAL '1 month')::DATE;
  END IF;
  v_due_day := COALESCE(NEW.emi_due_day, EXTRACT(DAY FROM NEW.purchase_date)::INT);

  IF TG_OP = 'UPDATE' THEN
    IF OLD.emi_amount = NEW.emi_amount AND OLD.emi_tenure = NEW.emi_tenure
       AND OLD.emi_due_day IS NOT DISTINCT FROM NEW.emi_due_day
       AND OLD.emi_start_date IS NOT DISTINCT FROM NEW.emi_start_date THEN
      RETURN NEW;
    END IF;
    -- Delete only UNPAID EMIs on update (preserve paid ones)
    DELETE FROM emi_schedule WHERE customer_id = NEW.id AND status = 'UNPAID';
  END IF;

  FOR v_i IN 0..(NEW.emi_tenure - 1) LOOP
    v_month_start := (v_base_month + (v_i || ' months')::INTERVAL)::DATE;
    v_last_day    := (v_month_start + INTERVAL '1 month - 1 day')::DATE;
    v_due_date    := LEAST(v_month_start + (v_due_day - 1), v_last_day);

    INSERT INTO emi_schedule (customer_id, emi_no, due_date, amount)
    VALUES (NEW.id, v_i + 1, v_due_date, NEW.emi_amount)
    ON CONFLICT (customer_id, emi_no) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  RAISE NOTICE 'Migration 024 complete: EMI start month is now honoured exactly (no +1 shift).';
END $$;
