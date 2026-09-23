-- 029 — Security hardening (safe to re-run)
--
-- fine_history accepted INSERTs from ANY caller (`WITH CHECK (TRUE)`), which
-- means anyone holding the public anon key could write fake fine records over
-- the REST API without logging in. Every legitimate insert comes from the
-- SECURITY DEFINER fine / approval functions, which bypass RLS, so the open
-- policy is not needed. Restrict direct inserts to super admins.

DROP POLICY IF EXISTS "fh_insert" ON fine_history;
CREATE POLICY "fh_insert" ON fine_history
  FOR INSERT WITH CHECK (get_my_role() = 'super_admin');
