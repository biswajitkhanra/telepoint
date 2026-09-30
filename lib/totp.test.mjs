// Run: node --test lib/totp.test.mjs
// Verifies the TOTP server implementation against the RFC 6238 SHA-1 test vector
// so it stays in lock-step with the native Totp.kt used for offline unlock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import Module from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadTs(absPath, cache = new Map()) {
  if (cache.has(absPath)) return cache.get(absPath).exports;
  const src = readFileSync(absPath, 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const m = { exports: {} };
  cache.set(absPath, m);
  const req = (spec) => {
    if (spec.startsWith('./') || spec.startsWith('../')) {
      let r = path.resolve(path.dirname(absPath), spec);
      if (!/\.[tj]s$/.test(r)) r += '.ts';
      return loadTs(r, cache);
    }
    return Module.createRequire(absPath)(spec);
  };
  new Function('exports', 'require', 'module', '__dirname', '__filename', js)(m.exports, req, m, path.dirname(absPath), absPath);
  return m.exports;
}

const { totpCode, totpNow, generateSecretBase32 } = loadTs(path.join(__dirname, 'totp.ts'));

// RFC 6238 SHA-1 test vector: secret = ASCII "12345678901234567890".
// base32("12345678901234567890") = GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('RFC 6238 vector: T=59s → 287082 (6-digit truncation of 94287082)', () => {
  assert.equal(totpCode(RFC_SECRET, 59_000), '287082');
});

test('RFC 6238 vector: T=1111111109s → 081804', () => {
  // 8-digit RFC value 07081804 → 6-digit = 081804
  assert.equal(totpCode(RFC_SECRET, 1_111_111_109_000), '081804');
});

test('the same 30-second window yields the same code', () => {
  assert.equal(totpCode(RFC_SECRET, 60_000), totpCode(RFC_SECRET, 89_000));
  assert.notEqual(totpCode(RFC_SECRET, 60_000), totpCode(RFC_SECRET, 90_000));
});

test('totpNow returns a 6-digit code with a sane expiry', () => {
  const { code, expiresIn } = totpNow(RFC_SECRET);
  assert.match(code, /^\d{6}$/);
  assert.ok(expiresIn >= 1 && expiresIn <= 30);
});

test('generateSecretBase32 returns a base32 string', () => {
  const s = generateSecretBase32();
  assert.match(s, /^[A-Z2-7]+$/);
  assert.ok(s.length >= 32);
});
