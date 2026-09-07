import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTs } from './load-ts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { todayIST, toISTDateString, diffDaysIST, addDaysIST } = loadTs(
  path.resolve(__dirname, '../lib/ist.ts')
);

test('IST calendar calculations', async (t) => {
  await t.test('todayIST returns valid YYYY-MM-DD string', () => {
    const today = todayIST();
    assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  });

  await t.test('toISTDateString handles Date objects and ISO strings', () => {
    const d = new Date('2026-09-07T00:00:00.000Z');
    const istStr = toISTDateString(d);
    assert.equal(istStr, '2026-09-07');
  });

  await t.test('diffDaysIST calculates exact day difference', () => {
    assert.equal(diffDaysIST('2026-09-12', '2026-09-07'), 5);
    assert.equal(diffDaysIST('2026-09-08', '2026-09-07'), 1);
    assert.equal(diffDaysIST('2026-09-07', '2026-09-07'), 0);
    assert.equal(diffDaysIST('2026-09-06', '2026-09-07'), -1);
  });

  await t.test('addDaysIST correctly rolls across days and month boundaries', () => {
    assert.equal(addDaysIST('2026-09-07', 5), '2026-09-12');
    assert.equal(addDaysIST('2026-09-28', 5), '2026-10-03');
    assert.equal(addDaysIST('2026-12-30', 3), '2027-01-02');
  });
});
