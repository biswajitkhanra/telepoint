-- 025: Unique customer / loan ID (customer_code) - fixed 4-character numbers
--
-- Every customer gets a permanent unique ID of the form TP + 4 characters,
-- e.g. TP0001, TP0002 ... TP000A ... TPZZZZ. The 4 characters use digits and
-- capital letters (base-36), giving 1,679,616 unique IDs - so even far past
-- 1 lakh customers the ID NEVER grows beyond 4 characters and never repeats.
--
-- The ID is shown to the customer, leads the UPI payment reference, and is
-- searchable in the admin portal. Existing customers are numbered in creation
-- order; new customers get the next ID automatically via trigger.
--
-- Safe to run more than once. If an earlier version of this migration already
-- assigned IDs, they are kept (they already fit the TP + 4 format) - only
-- customers without a valid ID get one.
--
-- Paste this whole file into the Supabase SQL editor and run it.

CREATE SEQUENCE IF NOT EXISTS customer_code_seq START 1;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_code TEXT;

-- n -> fixed 4-char base-36 (digits + capital letters), zero-padded.
CREATE OR REPLACE FUNCTION to_code36(n bigint)
RETURNS text AS $$
DECLARE
  chars CONSTANT text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  result text := '';
  v bigint := GREATEST(n, 0);
BEGIN
  WHILE v > 0 LOOP
    result := substr(chars, (v % 36)::int + 1, 1) || result;
    v := v / 36;
  END LOOP;
  RETURN lpad(COALESCE(NULLIF(result, ''), '0'), 4, '0');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Next free code from the sequence, skipping anything already taken.
CREATE OR REPLACE FUNCTION next_customer_code()
RETURNS text AS $$
DECLARE
  candidate text;
BEGIN
  LOOP
    candidate := 'TP' || to_code36(nextval('customer_code_seq'));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM customers WHERE customer_code = candidate);
  END LOOP;
  RETURN candidate;
END;
$$ LANGUAGE plpgsql;

-- Backfill: only customers with no valid TP + 4-char ID yet, oldest first.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM customers
    WHERE customer_code IS NULL OR customer_code !~ '^TP[0-9A-Z]{4}$'
    ORDER BY created_at ASC, id ASC
  LOOP
    UPDATE customers SET customer_code = next_customer_code() WHERE id = r.id;
  END LOOP;
END $$;

-- Assign an ID to every new customer automatically.
CREATE OR REPLACE FUNCTION assign_customer_code()
RETURNS trigger AS $$
BEGIN
  IF NEW.customer_code IS NULL THEN
    NEW.customer_code := next_customer_code();
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
