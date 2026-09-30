import crypto from 'crypto';

/**
 * RFC 6238 TOTP (HMAC-SHA1, 30s step, 6 digits) — the server side of the offline
 * unlock. The device and the server share a per-device base32 secret; the portal
 * shows the current code for the admin to read to the customer, and the device
 * verifies it locally (see native Totp.kt). Must stay in lock-step with the
 * native implementation.
 */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30;
const DIGITS = 6;

/** A fresh random base32 secret (default 20 bytes = 160 bits). */
export function generateSecretBase32(bytes = 20): string {
  return base32Encode(crypto.randomBytes(bytes));
}

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < buf.length; i += 1) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.trim().toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('bad base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

/** The TOTP code for a given instant (ms). */
export function totpCode(secretB32: string, timeMs: number = Date.now()): string {
  const counter = Math.floor(timeMs / 1000 / STEP);
  const key = base32Decode(secretB32);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = h[h.length - 1] & 0x0f;
  const bin =
    ((h[offset] & 0x7f) << 24) |
    ((h[offset + 1] & 0xff) << 16) |
    ((h[offset + 2] & 0xff) << 8) |
    (h[offset + 3] & 0xff);
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

/** Current code plus seconds until it rolls over. */
export function totpNow(secretB32: string): { code: string; expiresIn: number } {
  const now = Date.now();
  return { code: totpCode(secretB32, now), expiresIn: STEP - Math.floor((now / 1000) % STEP) };
}
