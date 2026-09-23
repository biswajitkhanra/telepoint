import type { NextRequest } from 'next/server';

/**
 * Small fixed-window rate limiter. State lives in the serverless instance's
 * memory, so it is best-effort (each warm instance counts separately) — but it
 * still stops a single client from hammering the public customer lookup to
 * enumerate mobile / Aadhaar numbers. Limits are deliberately generous because
 * many real customers share one carrier-NAT IP.
 */
type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip') || req.ip || 'unknown').trim();
}

function live(key: string, now: number): Bucket | undefined {
  const b = buckets.get(key);
  if (b && b.reset <= now) { buckets.delete(key); return undefined; }
  return b;
}

/** Seconds to wait if `key` is already over `limit` in its window, else 0. Does not count. */
export function limited(key: string, limit: number): number {
  const now = Date.now();
  const b = live(key, now);
  return b && b.count >= limit ? Math.ceil((b.reset - now) / 1000) : 0;
}

/** Count one event against `key`. */
export function hit(key: string, windowMs: number): void {
  const now = Date.now();
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
  const b = live(key, now);
  if (b) b.count += 1;
  else buckets.set(key, { count: 1, reset: now + windowMs });
}

/** Check-and-count in one step; returns seconds to wait when over the limit. */
export function rateLimit(key: string, limit: number, windowMs: number): number {
  const wait = limited(key, limit);
  if (wait) return wait;
  hit(key, windowMs);
  return 0;
}
