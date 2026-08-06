import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// SECURITY: Fail-fast if required env vars are missing at runtime.
// Empty strings are used as build-time placeholders (Next.js static analysis)
// but createClient/createServiceClient will validate before use.
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  || '';
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SERVICE_ROLE  = process.env.SUPABASE_SERVICE_ROLE_KEY  || '';

function requireEnv(name: string, value: string): string {
  if (!value || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}


export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', SUPABASE_ANON),
    {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {}
      },
    },
  });
}

export function createServiceClient() {
  return createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE),
    {
    cookies: {
      getAll() { return []; },
      setAll() {},
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
