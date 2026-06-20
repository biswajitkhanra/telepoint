import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

// ─────────────────────────────────────────────────────────────────────────────
// Centralised API authorization guards.
//
// Every privileged route handler should start by awaiting one of these guards
// and bailing out on the `error` branch. They resolve the caller's identity
// from the (httpOnly, cookie-bound) Supabase session — validated against the
// auth server via getUser(), never trusting a client-supplied role — and then
// check the role recorded in the `profiles` table.
//
//   const auth = await requireSuperAdmin();
//   if ('error' in auth) return auth.error;   // 401 / 403 already shaped
//   const { user } = auth;                     // safe: verified super_admin
//
// Guards return a discriminated union so TypeScript forces the error check.
// ─────────────────────────────────────────────────────────────────────────────

export type Role = 'super_admin' | 'retailer';

export interface AuthContext {
  user: User;
  role: Role | null;
}

type Guarded<T> = T | { error: NextResponse };

const unauthorized = () =>
  NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
const forbidden = (msg = 'Forbidden') =>
  NextResponse.json({ error: msg }, { status: 403 });

/** Resolve the authenticated user + their role, or null if not signed in. */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single();
  return { user, role: (profile?.role as Role | undefined) ?? null };
}

/** Require any authenticated user (no role constraint). */
export async function requireUser(): Promise<Guarded<AuthContext>> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: unauthorized() };
  return ctx;
}

/** Require a signed-in super_admin. */
export async function requireSuperAdmin(): Promise<Guarded<AuthContext>> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: unauthorized() };
  if (ctx.role !== 'super_admin') return { error: forbidden('Forbidden — super admin only') };
  return ctx;
}

/** Require the caller to hold one of the listed roles. */
export async function requireRole(...roles: Role[]): Promise<Guarded<AuthContext>> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: unauthorized() };
  if (!ctx.role || !roles.includes(ctx.role)) return { error: forbidden('Not authorized') };
  return ctx;
}
