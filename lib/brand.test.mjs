// Run: node --test lib/brand.test.mjs
// Guards the retailer-dashboard business rule: a device's BRAND is the FIRST
// word of its model name ("Redmi 5A" → "Redmi"), case-insensitively bucketed,
// while the full model line is its "category".
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

const { brandOf, categoryOf } = loadTs(path.join(__dirname, 'brand.ts'));

test('brand = first word of the device, title-cased', () => {
  assert.equal(brandOf('Redmi 5A'), 'Redmi');
  assert.equal(brandOf('redmi note 13'), 'Redmi');
  assert.equal(brandOf('SAMSUNG A14 5G'), 'Samsung');
  assert.equal(brandOf('iphone 13'), 'Iphone');
});

test('the example from the brief: "redmi 5a" → "redmi"', () => {
  // Case-folded so every casing collapses into ONE brand bucket.
  assert.equal(brandOf('redmi 5a'), brandOf('REDMI 5A'));
  assert.equal(brandOf('redmi 5a'), brandOf('Redmi 5a'));
});

test('blank / missing model falls back to "Unknown"', () => {
  assert.equal(brandOf(''), 'Unknown');
  assert.equal(brandOf(null), 'Unknown');
  assert.equal(brandOf(undefined), 'Unknown');
  assert.equal(brandOf('   '), 'Unknown');
});

test('extra whitespace does not create phantom brands', () => {
  assert.equal(brandOf('  Vivo   Y21  '), 'Vivo');
});

test('category = the full model line, whitespace-collapsed', () => {
  assert.equal(categoryOf('Redmi   5A'), 'Redmi 5A');
  assert.equal(categoryOf('  oppo a17  '), 'oppo a17');
  assert.equal(categoryOf(''), 'Unknown');
  assert.equal(categoryOf(null), 'Unknown');
});
