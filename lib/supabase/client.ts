import { createBrowserClient } from '@supabase/ssr';

// Per-browser Supabase client.
//
// Sessions are stored in cookies (the @supabase/ssr default) so the server,
// middleware and browser all read the SAME per-request session. This is
// inherently isolated per user: every browser/device has its own cookie jar,
// its own access token and its own refresh token. There is NO global login
// state or shared flag anywhere — one user signing in or out can never touch
// another user's session.
//
// The auth options below are the SSR defaults, set explicitly to document the
// required behaviour and guard against accidental regressions:
//   • persistSession   — keep the session across page refresh / browser restart
//   • autoRefreshToken — silently refresh the access token (network reconnect)
//   • detectSessionInUrl — complete auth redirects
// We deliberately do NOT override storageKey — the default, project-scoped key
// must match the server so SSR can read the cookie.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );
}
