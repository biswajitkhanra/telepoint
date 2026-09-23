// Run: node --test lib/customerSession.test.mjs
// Guards the customer-portal session token, Aadhaar masking and rate limiter.
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
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const m = { exports: {} };
  cache.set(absPath, m);
  const req = (spec) => {
    let resolved = spec;
    if (spec.startsWith('@/lib/')) resolved = path.join(__dirname, spec.slice('@/lib/'.length));
    else if (spec.startsWith('./') || spec.startsWith('../')) resolved = path.resolve(path.dirname(absPath), spec);
    else return Module.createRequire(absPath)(spec);
    if (!/\.[tj]s$/.test(resolved)) resolved += '.ts';
    return loadTs(resolved, cache);
  };
  new Function('exports', 'require', 'module', '__dirname', '__filename', js)(
    m.exports, req, m, path.dirname(absPath), absPath,
  );
  return m.exports;
}


process.env.CUSTOMER_SESSION_SECRET = 'test-secret-for-unit-tests';
const { issueCustomerSession, verifyCustomerSession, sessionCustomerIds } = loadTs(path.join(__dirname, 'customerSession.ts'));
const { maskAadhaar } = loadTs(path.join(__dirname, 'pii.ts'));
const { limited, hit, rateLimit } = loadTs(path.join(__dirname, 'rateLimit.ts'));

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

test('a session covers exactly the customers it was issued for', () => {
  const t = issueCustomerSession([A]);
  assert.equal(verifyCustomerSession(t, A), true);
  assert.equal(verifyCustomerSession(t, B), false);
  assert.deepEqual(sessionCustomerIds(t), [A]);
});

test('tampered, foreign or malformed sessions are rejected', () => {
  const t = issueCustomerSession([A]);
  const [payload, mac] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ ids: [A, B], exp: Date.now() + 1e9 })).toString('base64url');
  assert.equal(verifyCustomerSession(`${forged}.${mac}`, B), false);
  assert.equal(verifyCustomerSession(`${payload}.${mac.slice(0, -2)}xx`, A), false);
  for (const bad of [undefined, null, 42, '', 'abc', 'a.b.c', 'x'.repeat(5000)]) {
    assert.equal(verifyCustomerSession(bad, A), false);
  }
  process.env.CUSTOMER_SESSION_SECRET = 'a-different-secret';
  assert.equal(verifyCustomerSession(t, A), false, 'token from another deployment secret');
  process.env.CUSTOMER_SESSION_SECRET = 'test-secret-for-unit-tests';
});

test('expired sessions are rejected', () => {
  const realNow = Date.now;
  const t = issueCustomerSession([A]);
  Date.now = () => realNow() + 31 * 24 * 60 * 60 * 1000;
  try { assert.equal(verifyCustomerSession(t, A), false); } finally { Date.now = realNow; }
});

test('Aadhaar is masked to the last 4 digits', () => {
  assert.equal(maskAadhaar('482110003333'), 'XXXXXXXX3333');
  assert.equal(maskAadhaar('4821 1000 3333'), 'XXXXXXXX3333');
  assert.equal(maskAadhaar(null), null);
  assert.equal(maskAadhaar(''), null);
});

test('rate limiter blocks after the limit and only counts hits', () => {
  const key = 'test:' + Math.random();
  assert.equal(limited(key, 2), 0);
  hit(key, 60_000); hit(key, 60_000);
  assert.ok(limited(key, 2) > 0);
  const k2 = 'test2:' + Math.random();
  assert.equal(rateLimit(k2, 1, 60_000), 0);
  assert.ok(rateLimit(k2, 1, 60_000) > 0);
});
