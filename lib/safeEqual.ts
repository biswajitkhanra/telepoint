import { timingSafeEqual } from 'crypto';

/**
 * Constant-time string comparison for secrets (cron tokens, PINs). A plain
 * `===` returns as soon as a byte differs, which leaks the secret through
 * response timing. Both sides are padded to a fixed buffer so the length
 * check itself doesn't branch early.
 */
export function safeEqual(a: string, b: string): boolean {
  const size = Math.max(256, a.length, b.length);
  const ba = Buffer.alloc(size);
  const bb = Buffer.alloc(size);
  ba.write(a);
  bb.write(b);
  return timingSafeEqual(ba, bb) && a.length === b.length;
}
