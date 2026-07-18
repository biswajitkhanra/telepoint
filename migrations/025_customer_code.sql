-- 025: Unique customer number (customer_code)
--
-- Every customer gets a short permanent unique number like TP1001, TP1002 ...
-- It is shown to the customer, included in the UPI payment reference, and
-- searchable in the admin portal search box.
--
-- Existing customers are numbered in the order they were created; new
-- customers pick up the next number automatically via trigger.
--
-- The app works before this migration is applied (it falls back to a code
-- derived from the customer id), but apply it to get the short permanent
-- TP-numbers. Paste this whole file into the Supabase SQL editor and run it.

CREATE SEQUENCE IF NOT EXISTS customer_code_seq START 1001;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_code TEXT;

-- Backfill existing customers in creation order, oldest first.
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM customers
  WHERE customer_code IS NULL
)
UPDATE customers c
SET customer_code = 'TP' || (1000 + o.rn)::text
FROM ordered o
WHERE c.id = o.id;

-- Keep the sequence ahead of everything already assigned.
SELECT setval(
  'customer_code_seq',
  GREATEST(
    1001,
    COALESCE(
      (SELECT MAX(NULLIF(regexp_replace(customer_code, '\D', '', 'g'), '')::bigint) FROM customers),
      1000
    ) + 1
  ),
  false
);

-- Assign a code to every new customer automatically.
CREATE OR REPLACE FUNCTION assign_customer_code()
RETURNS trigger AS $$
BEGIN
  IF NEW.customer_code IS NULL THEN
    NEW.customer_code := 'TP' || nextval('customer_code_seq')::text;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_customer_code ON customers;
CREATE TRIGGER trg_assign_customer_code
BEFORE INSERT ON customers
FOR EACH ROW EXECUTE FUNCTION assign_customer_code();

CREATE UNIQUE INDEX IF NOT EXISTS customers_customer_code_key
  ON customers (customer_code);
