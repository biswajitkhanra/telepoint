// Run: node --test lib/analysis.test.mjs
// Guards the full-database analysis + year-wise P&L bucketing.
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


const { computeAnalysis, closedYear, istMonth } = loadTs(path.join(__dirname, 'analysis.ts'));

const cust = (id, over = {}) => ({ id, retailer_id: 'r1', status: 'COMPLETE', purchase_date: '2025-09-10', purchase_value: 15000, down_payment: 3000, ...over });
const emi = (customer_id, due_date, over = {}) => ({ customer_id, due_date, status: 'APPROVED', amount: 1500, partial_paid_amount: 0, fine_paid_amount: 0, paid_at: null, collection_requested_at: null, ...over });

test('imported history (APPROVED, no paid_at, no payment_requests) counts as collected in its due month', () => {
  const customers = [cust('a')];
  const emis = [emi('a', '2025-09-05'), emi('a', '2025-10-05')];
  const d = computeAnalysis(customers, emis, [{ id: 'r1', name: 'MAMA' }], 9, 2026);
  assert.equal(d.lastYear.collected, 1500, 'Sep 2025 collected must not be 0');
  assert.equal(d.lastYear.loanGiven, 12000);
  assert.equal(d.lastYear.customers, 1);
});

test('portal-era payment is bucketed by its collection date in IST', () => {
  const customers = [cust('b', { status: 'RUNNING', purchase_date: '2026-08-01' })];
  // Collected 1 Sep 00:30 IST = 31 Aug 19:00 UTC → belongs to September in IST.
  const emis = [emi('b', '2026-09-05', { paid_at: '2026-08-31T19:00:00Z', collection_requested_at: '2026-08-31T19:00:00Z', fine_paid_amount: 450 })];
  const d = computeAnalysis(customers, emis, [], 9, 2026);
  assert.equal(d.thisYear.collected, 1950);
  assert.equal(istMonth('2026-08-31T19:00:00Z'), '2026-09');
});

test('NPA / SETTLED loans are excluded from analysis like the RPC', () => {
  const d = computeAnalysis([cust('c', { status: 'NPA' })], [emi('c', '2025-09-05')], [], 9, 2026);
  assert.equal(d.lastYear.collected, 0);
  assert.equal(d.lastYear.loanGiven, 0);
});

test('more than 1000 customers are all counted (no row cap in the computation)', () => {
  const customers = Array.from({ length: 2500 }, (_, i) => cust('x' + i));
  const emis = customers.map(c => emi(c.id, '2025-09-05'));
  const d = computeAnalysis(customers, emis, [], 9, 2026);
  assert.equal(d.lastYear.customers, 2500);
  assert.equal(d.lastYear.collected, 2500 * 1500);
});

test('P&L year: imported completed loan goes to its real year, not the import year', () => {
  // completion_date stamped by the import in 2026, EMIs paid (no paid_at) through Jun 2024.
  const c = { status: 'COMPLETE', completion_date: '2026-05-20', purchase_date: '2023-10-01' };
  const emis = [emi('p', '2024-04-05'), emi('p', '2024-05-05'), emi('p', '2024-06-05')];
  assert.equal(closedYear(c, emis), '2024');
});

test('P&L year: portal-completed loan uses its last payment date', () => {
  const c = { status: 'COMPLETE', completion_date: '2026-03-02T10:00:00Z', purchase_date: '2025-06-01' };
  const emis = [emi('q', '2026-01-05', { paid_at: '2026-01-04T10:00:00Z' }), emi('q', '2026-04-05', { paid_at: '2026-03-01T10:00:00Z' })];
  assert.equal(closedYear(c, emis), '2026');
});

test('P&L year: settled loan uses settlement date; early closure never lands in the future', () => {
  assert.equal(closedYear({ status: 'SETTLED', settlement_date: '2025-11-20' }, [emi('s', '2026-01-05')]), '2025');
  const future = new Date(); future.setFullYear(future.getFullYear() + 1);
  const early = closedYear({ status: 'COMPLETE', completion_date: '2025-02-01T10:00:00Z' },
    [emi('e', future.toISOString().slice(0, 10))]);
  assert.equal(early, '2025');
});
