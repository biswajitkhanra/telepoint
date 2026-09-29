// Run: node --test lib/deviceCommands.test.mjs
// Verifies the pure device-command lifecycle rules that gate every LOCK/UNLOCK
// before the native module runs: ownership, device match, expiry, idempotency.
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

const {
  checkExecutable, isExpired, isTerminal, COMMAND_TTL_MS,
  pendingStatusFor, executedStatusFor, auditAction,
} = loadTs(path.join(__dirname, 'deviceCommands.ts'));

const NOW = Date.parse('2026-01-01T00:00:00Z');
const future = new Date(NOW + 5 * 60_000).toISOString();
const past = new Date(NOW - 60_000).toISOString();

const device = { id: 'dev-1', customer_id: 'cust-1', installation_id: 'inst-1' };
const baseCmd = {
  id: 'cmd-1', customer_id: 'cust-1', device_id: 'dev-1',
  command_type: 'LOCK', status: 'PENDING', expires_at: future,
};
const ctx = (over = {}) => ({
  authenticatedCustomerId: 'cust-1', installationId: 'inst-1', device, now: NOW, ...over,
});

test('valid command passes the gate', () => {
  assert.deepEqual(checkExecutable(baseCmd, ctx()), { ok: true });
});

test('expired command is refused', () => {
  const r = checkExecutable({ ...baseCmd, expires_at: past }, ctx());
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'expired');
});

test('already-executed command is refused (idempotency)', () => {
  const r = checkExecutable({ ...baseCmd, status: 'EXECUTED' }, ctx());
  assert.equal(r.ok, false);
  assert.match(r.reason, /already_/);
});

test('command for another customer is refused', () => {
  const r = checkExecutable({ ...baseCmd, customer_id: 'cust-2' }, ctx({ authenticatedCustomerId: 'cust-1' }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'customer_mismatch');
});

test('command for a different device is refused', () => {
  const r = checkExecutable({ ...baseCmd, device_id: 'dev-2' }, ctx());
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'device_mismatch');
});

test('mismatched installation id is refused', () => {
  const r = checkExecutable(baseCmd, ctx({ installationId: 'other-install' }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'installation_mismatch');
});

test('unregistered device is refused', () => {
  const r = checkExecutable(baseCmd, ctx({ device: null }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'device_not_registered');
});

test('RECEIVED command is still executable (retry after delivery)', () => {
  assert.deepEqual(checkExecutable({ ...baseCmd, status: 'RECEIVED' }, ctx()), { ok: true });
});

test('isExpired treats unparseable dates as expired', () => {
  assert.equal(isExpired({ expires_at: 'not-a-date' }, NOW), true);
});

test('terminal + status helpers', () => {
  assert.equal(isTerminal('EXECUTED'), true);
  assert.equal(isTerminal('PENDING'), false);
  assert.equal(pendingStatusFor('LOCK'), 'LOCK_PENDING');
  assert.equal(pendingStatusFor('UNLOCK'), 'UNLOCK_PENDING');
  assert.equal(executedStatusFor('LOCK'), 'LOCKED');
  assert.equal(executedStatusFor('UNLOCK'), 'ACTIVE');
  assert.equal(auditAction('LOCK', 'EXECUTED'), 'LOCK_EXECUTED');
  assert.ok(COMMAND_TTL_MS > 0);
});
