# Security regression tests

Database-level authorization tests for the TelePoint EMI portal. They exist to
prove two things at once:

1. the cross-tenant / privilege-escalation holes closed by
   `migrations/029_security_hardening.sql` stay closed, and
2. every legitimate flow — retailer reading their own book, super admin reading
   any book, the server approving a payment — still works exactly as before.

The second half matters as much as the first. A security fix that blocks real
retailer workflows is a failed fix.

## Running them

Any PostgreSQL 14+ will do; nothing here needs a live Supabase project.
`00_supabase_stub.sql` supplies the pieces the portal schema expects from
Supabase — the `auth` schema, `auth.uid()`, and the `anon` / `authenticated` /
`service_role` roles that PostgREST connects as. `auth.uid()` reads the
`request.jwt.claim.sub` GUC, so a test can "become" any user with `SET`.

```sh
createdb tp_sectest

psql -d tp_sectest -f tests/security/00_supabase_stub.sql
psql -d tp_sectest -f supabase/fresh_supabase_schema.sql
psql -d tp_sectest -f migrations/018_analysis_dashboard.sql
psql -d tp_sectest -f migrations/023_analysis_collection_by_date.sql
psql -d tp_sectest -f tests/security/10_seed.sql

# Baseline (optional): run the suite BEFORE the fix and watch the attacks pass.
psql -d tp_sectest -f tests/security/20_authorization_tests.sql

psql -d tp_sectest -f migrations/029_security_hardening.sql

psql -d tp_sectest -f tests/security/20_authorization_tests.sql
psql -d tp_sectest -f tests/security/30_bypass_tests.sql
```

Every line of output is `PASS` or `FAIL`. After the migration, expect 16 PASS
from the authorization suite and 13 from the bypass suite, with no FAIL.

## Fixture

`10_seed.sql` builds the smallest world that can express a tenancy bug:

| object | id suffix | belongs to |
| --- | --- | --- |
| retailer A / retailer B | `…00a` / `…00b` | — |
| customer of A / customer of B | `…00a` / `…00b` | A / B |
| PENDING payment request | `…00a` | A |
| super admin | `…0ad` | — |

EMI schedules are not inserted by hand — they are produced by the portal's own
`fn_generate_emi_schedule` trigger, so the fixture exercises real business
logic rather than a hand-made approximation.

## What is covered

`20_authorization_tests.sql`

- **Attacks** — retailer self-approving a payment request; retailer A reading
  retailer B's customer dues; retailer reading all-retailer analytics; retailer
  running portfolio-wide and foreign-customer fine recalculation; anonymous
  reads; cross-tenant table reads.
- **Legitimate flows** — retailer reads own customer dues; super admin reads
  any customer; super admin reads analytics; `service_role` reads dues for the
  customer portal; `service_role` approves a payment request and the EMI really
  flips to `APPROVED`; retailer reads own portfolio; the generated EMI schedule
  is intact.
- **Hardening** — no `SECURITY DEFINER` function is left without a pinned
  `search_path`.

`30_bypass_tests.sql` assumes the fix is deployed and tries to defeat it:
calling the renamed `*_impl` implementations directly, approving another
retailer's request, regenerating a foreign EMI schedule, anonymous access to
privileged functions and to customer auto-login tokens, creating or reassigning
a customer under another retailer, and self-escalating to `super_admin`.

## Note on the `*_impl` functions

Migration 029 renames `get_due_breakdown` and `get_emi_analysis` to
`*_impl` and puts a thin authorization wrapper in their place. The bodies are
never rewritten, so no calculation changes. The `*_impl` functions are
`REVOKE`d from `PUBLIC`, `anon` and `authenticated` — otherwise a caller could
skip the wrapper and reach the unguarded implementation directly. BYPASS-1 and
BYPASS-2 exist specifically to keep that true.
