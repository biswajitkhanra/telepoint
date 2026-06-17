// Run: node --test lib/loanStatementHtml.test.mjs
// Verifies the loan-statement document is well-formed and NEVER blank — the
// repeated "blank PDF" report. We compile the TS helper on the fly with esbuild
// (already present via Next) is not available here, so we import through a tiny
// ts loader: instead we re-implement nothing — we transpile with the TypeScript
// compiler API at runtime.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import Module from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Transpile + load the TS helper (resolving the date-fns / formatters deps).
function loadTs(absPath, cache = new Map()) {
  if (cache.has(absPath)) return cache.get(absPath).exports;
  const src = readFileSync(absPath, 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, jsx: ts.JsxEmit.React },
  }).outputText;
  const m = { exports: {} };
  cache.set(absPath, m);
  const req = (spec) => {
    let resolved = spec;
    if (spec.startsWith('@/lib/')) resolved = path.join(__dirname, spec.slice('@/lib/'.length));
    else if (spec.startsWith('./') || spec.startsWith('../')) resolved = path.resolve(path.dirname(absPath), spec);
    else return Module.createRequire(absPath)(spec); // node_modules (date-fns, etc.)
    if (!/\.[tj]s$/.test(resolved)) resolved += '.ts';
    return loadTs(resolved, cache);
  };
  new Function('exports', 'require', 'module', '__dirname', '__filename', js)(
    m.exports, req, m, path.dirname(absPath), absPath,
  );
  return m.exports;
}

const { buildLoanStatementHtml } = loadTs(path.join(__dirname, 'loanStatementHtml.ts'));

const customer = {
  id: 'abcdef12-3456', customer_name: 'Ravi Kumar', mobile: '9876543210',
  model_no: 'Galaxy A15', imei: '356938035643809', status: 'RUNNING',
  purchase_date: '2025-01-10', purchase_value: 18000, down_payment: 3000,
  emi_amount: 2500, emi_tenure: 6,
};

const emis = [
  // Paid EMI with a paid fine via UPI
  { id: 1, emi_no: 1, due_date: '2025-02-10', amount: 2500, status: 'APPROVED',
    paid_at: '2025-02-15', mode: 'UPI', utr: '99887766',
    fine_amount: 450, fine_paid_amount: 450 },
  // Overdue, unpaid EMI with an unpaid fine
  { id: 2, emi_no: 2, due_date: '2025-03-10', amount: 2500, status: 'UNPAID',
    fine_amount: 0, fine_paid_amount: 0 },
  // Future, upcoming EMI
  { id: 3, emi_no: 3, due_date: '2999-04-10', amount: 2500, status: 'UNPAID' },
];

function buildArgs() {
  const fineByEmi = new Map([
    [1, { total: 450, paid: 450, remaining: 0 }],
    [2, { total: 475, paid: 0, remaining: 475 }],
  ]);
  const emiPaidOf = (e) => e.status === 'APPROVED' ? Number(e.amount || 0)
    : Math.min(Number(e.amount || 0), Number(e.partial_paid_amount || 0));
  const totals = {
    emiContract: 7500, emiPaid: 2500, emiRemaining: 5000,
    fineAccrued: 925, finePaid: 450, fineRemaining: 475,
    firstChargeAmt: 0, firstChargePaid: 0, firstChargeRemaining: 0,
    paidCount: 1,
  };
  return {
    customer, sorted: emis, fineByEmi, totals,
    grandPaid: 2950, grandRemaining: 5475, loanAmount: 15000,
    firstDue: emis[0].due_date, lastDue: emis[2].due_date, emiPaidOf,
  };
}

test('produces a complete, non-blank HTML document', () => {
  const html = buildLoanStatementHtml(buildArgs());
  assert.ok(html.length > 2000, 'document should be substantial, not blank');
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<\/html>\s*$/i);
  const dom = new JSDOM(html);
  const body = dom.window.document.body;
  assert.ok(body, 'body exists');
  assert.ok(body.textContent.trim().length > 200, 'body has visible text content');
});

test('renders borrower + account details', () => {
  const html = buildLoanStatementHtml(buildArgs());
  const { document } = new JSDOM(html).window;
  const text = document.body.textContent;
  assert.match(text, /Ravi Kumar/);
  assert.match(text, /Statement of Loan Account/);
  assert.match(text, /Galaxy A15/);
  assert.match(text, /356938035643809/);
});

test('ledger has one row per EMI plus header + total', () => {
  const html = buildLoanStatementHtml(buildArgs());
  const { document } = new JSDOM(html).window;
  const bodyRows = document.querySelectorAll('tbody tr');
  assert.equal(bodyRows.length, 3, 'three EMI rows');
  assert.ok(document.querySelector('tfoot'), 'has totals footer');
});

test('fine cell shows PAID status + UPI method for a settled fine', () => {
  const html = buildLoanStatementHtml(buildArgs());
  const { document } = new JSDOM(html).window;
  const row1 = document.querySelectorAll('tbody tr')[0];
  const fineCellText = row1.children[6].textContent; // Fine column (index 6)
  assert.match(fineCellText, /Paid/, 'fine marked paid');
  assert.match(fineCellText, /UPI/, 'fine method shown');
});

test('fine cell shows UNPAID for an unpaid fine', () => {
  const html = buildLoanStatementHtml(buildArgs());
  const { document } = new JSDOM(html).window;
  const row2 = document.querySelectorAll('tbody tr')[1];
  const fineCellText = row2.children[6].textContent;
  assert.match(fineCellText, /Unpaid/);
});

test('totals appear in the document', () => {
  const html = buildLoanStatementHtml(buildArgs());
  const { document } = new JSDOM(html).window;
  const text = document.body.textContent;
  assert.match(text, /Total Paid/);
  assert.match(text, /Outstanding/);
  assert.match(text, /EMIs Cleared/);
  assert.match(text, /1 \/ 3/, 'EMIs cleared count');
});
