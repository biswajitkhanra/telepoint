// Run: node --test lib/fineCalc.test.mjs
// Guards the per-EMI fine breakdown that drives the loan statement's Fine
// column. The regression we fix here: a fine that has been PAID IN FULL was
// dropped from the breakdown, so the statement showed a blank "—" instead of
// "✓ Paid". Ledger mode (includeSettled=true) must surface it, frozen at the
// amount that was actually charged — never re-inflated by elapsed time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import Module from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Transpile + load a TS module on the fly (mirrors loanStatementHtml.test.mjs).
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

const { getPerEmiFineBreakdown } = loadTs(path.join(__dirname, 'fineCalc.ts'));

// A fine that was charged (EMI fell overdue), then PAID IN FULL, on an EMI that
// is now APPROVED and was never flagged with a late collection date. This is
// the exact shape that vanished from the loan statement.
const paidFineEmi = {
  id: 'e1', emi_no: 1, due_date: '2025-01-10', amount: 2500, status: 'APPROVED',
  fine_amount: 450, fine_paid_amount: 450, fine_paid_at: '2025-02-01',
  fine_waived: false, collection_requested_at: null,
};

test('default mode omits a fully-paid fine (reports only outstanding dues)', () => {
  const rows = getPerEmiFineBreakdown([paidFineEmi]);
  assert.equal(rows.length, 0, 'a settled fine is not an amount currently due');
});

test('ledger mode surfaces a fully-paid fine as ✓ Paid (remaining 0)', () => {
  const rows = getPerEmiFineBreakdown([paidFineEmi], 450, 25, true);
  assert.equal(rows.length, 1, 'paid fine is present in the ledger');
  const r = rows[0];
  assert.equal(r.emi_no, 1);
  assert.equal(r.paid, 450, 'shows the amount paid');
  assert.equal(r.remaining, 0, 'nothing remaining → renders as ✓ Paid');
});

test('ledger mode freezes a settled fine — elapsed time never resurrects a balance', () => {
  // due_date is long past; a naive live recompute would balloon the fine and
  // wrongly show money still owed. A fully-paid fine must stay at 450.
  const rows = getPerEmiFineBreakdown([paidFineEmi], 450, 25, true);
  assert.equal(rows[0].totalFine, 450, 'frozen at the charged/paid amount');
  assert.equal(rows[0].remaining, 0);
});

test('an unpaid overdue fine is reported in BOTH modes (no behaviour change)', () => {
  const unpaid = {
    id: 'e2', emi_no: 2, due_date: '2025-01-10', amount: 2500, status: 'UNPAID',
    fine_amount: 450, fine_paid_amount: 0, fine_waived: false,
  };
  assert.equal(getPerEmiFineBreakdown([unpaid]).length, 1, 'default includes outstanding');
  assert.equal(getPerEmiFineBreakdown([unpaid], 450, 25, true).length, 1, 'ledger includes it too');
});

test('ledger mode marks a LATE-collected, fully-paid fine as settled (✓ Paid)', () => {
  // collection_requested_at is after the due date, so isCollectedLate stays true
  // forever — the live day-count would otherwise keep growing the fine and never
  // let a fine the customer cleared read "✓ Paid".
  const lateButPaid = {
    id: 'e4', emi_no: 4, due_date: '2025-01-10', amount: 2500, status: 'APPROVED',
    fine_amount: 450, fine_paid_amount: 450, fine_waived: false,
    collection_requested_at: '2025-02-20',
  };
  const r = getPerEmiFineBreakdown([lateButPaid], 450, 25, true)[0];
  assert.equal(r.paid, 450);
  assert.equal(r.remaining, 0, 'a fully-paid late fine still reads ✓ Paid in the ledger');
});

test('default "amount due" mode is unchanged for a late-collected fine', () => {
  // Guard: the freeze is ledger-only. The live due view must still mirror the
  // server and keep accruing, so totals never silently diverge.
  const latePaid = {
    id: 'e5', emi_no: 5, due_date: '2025-01-10', amount: 2500, status: 'APPROVED',
    fine_amount: 450, fine_paid_amount: 450, fine_waived: false,
    collection_requested_at: '2025-02-20',
  };
  const r = getPerEmiFineBreakdown([latePaid])[0];
  assert.ok(r, 'still reported by default');
  assert.ok(r.remaining > 0, 'default view keeps accruing — behaviour preserved');
});

test('a partially-paid fine keeps a remaining balance in ledger mode', () => {
  const partial = {
    id: 'e3', emi_no: 3, due_date: '2025-01-10', amount: 2500, status: 'UNPAID',
    fine_amount: 450, fine_paid_amount: 200, fine_waived: false,
  };
  const r = getPerEmiFineBreakdown([partial], 450, 25, true)[0];
  assert.equal(r.paid, 200, 'partial amount shown');
  assert.ok(r.remaining > 0, 'still carries a balance');
});
