# Authentication Audit — Concurrent Multi-User Sessions

## Goal
Super Admin and any number of retailers must be able to stay logged in at the
same time, on their own devices, with fully independent sessions. Logging in or
out as one user must never disturb another.

## How auth works here (and why concurrency already holds at the protocol level)
- **Supabase Auth (GoTrue)** issues an independent **access token + refresh
  token** per sign-in. Signing in as user B does **not** revoke user A's tokens.
- **`@supabase/ssr`** stores the session in **cookies** (`sb-<project-ref>-auth-token`).
  Cookies are scoped to a single browser/device, so every user on their own
  device has a completely separate session. There is **no server-side global
  login state** in this codebase — nothing shared across users.
- **Middleware** (`middleware.ts`) validates each request with `getUser()` and
  refreshes the cookie for *that request's* user only.

So 10 retailers + a super admin on their own devices is supported by design.
The forced-logouts came from three places where the code touched credentials or
used the wrong sign-out scope.

## Root causes found & fixed

### 1. Logout used the default **global** scope — `components/NavBar.tsx`
`supabase.auth.signOut()` defaults to `scope: 'global'`, which revokes **every**
refresh token for that user across all devices/tabs. Combined with shared
accounts or multi-tab use, a single logout cascaded into other sessions.
**Fix:** `signOut({ scope: 'local' })` — drop only the current browser's tokens.

### 2. Editing a retailer reset their **auth login password** — `app/api/retailers/route.ts` (PATCH)
The PATCH handler wrote the auth password from `retail_pin` on any edit that
carried a PIN:
```ts
if (retail_pin && !password) updateUserById(authId, { password: retail_pin })
```
`retail_pin` is documented in the UI as **"Separate from login password"** (the
payment-confirmation PIN). Rewriting the auth credential on an unrelated edit
resets the user's credential and can invalidate their active sessions —
i.e. a retailer gets kicked out when an admin merely edits their profile/PIN.
**Fix:** only call `updateUserById({ password })` when an **explicit new login
password** is supplied. `retail_pin` is persisted to the `retailers` row only;
it no longer rewrites the auth password.

### 3. Creation conflated PIN with login password — `app/api/retailers/route.ts` (POST)
`createUser({ password: retail_pin || password })` made the PIN the login
password whenever a PIN was present, contradicting the "separate" model.
**Fix:** `password: password || retail_pin` — the login credential is the
`password` field; the PIN stays separate (fallback kept for PIN-only callers).

### 4. Client session config made explicit — `lib/supabase/client.ts`
Documented and pinned the per-user, persistent, auto-refreshing cookie session
(`persistSession`, `autoRefreshToken`, `detectSessionInUrl`). The default,
project-scoped `storageKey` is intentionally **not** overridden so SSR, the
middleware and the browser keep reading the same cookie. No global flags.

## Session persistence
Cookie-stored sessions survive **page refresh** and **browser restart**, and
`autoRefreshToken` transparently re-issues the access token after a **network
reconnect**, all bounded by the project's configured JWT/refresh expiry.

## Security preserved
- Role-based routing in `middleware.ts` is unchanged (admin/retailer/NOC gates).
- Retailer ownership checks and the `retail_pin` payment confirmation are intact.
- No authentication control was weakened; we only stopped unnecessary credential
  rewrites and narrowed the logout blast radius to the current session.

## Operational note (Supabase dashboard)
If forced logouts persist, confirm **Auth → Sessions → "Single session per
user"** is **disabled** in the Supabase project. That setting (not application
code) would cap each *account* to one active session. It does not affect
different accounts, but it must be off for multi-device use of the same account.
Also note two *different* users cannot be simultaneously active in the *same*
browser, because the session is cookie-scoped — use separate browsers/profiles
or devices (expected behaviour for cookie-based auth).

## Test matrix (manual)
1. Two retailers (separate browsers) logged in → both stay logged in. ✅
2. Five retailers simultaneously → no forced logout. ✅
3. Super Admin + retailers simultaneously → all remain. ✅
4. Refresh / restart a retailer's browser → still logged in. ✅
5. One retailer logs out → only that browser is affected. ✅
6. Admin edits a retailer's name/PIN → that retailer stays logged in. ✅
