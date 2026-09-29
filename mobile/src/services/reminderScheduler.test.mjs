// Run: node --test src/services/reminderScheduler.test.mjs   (from mobile/)
// Verifies the pure, offline EMI reminder scheduler: the exact PRE_DUE /
// DUE_DAY / OVERDUE cadence, IST timezone correctness, voice rules, language,
// paid-cancellation and idempotent (duplicate-proof) stable ids.
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
    if (spec.startsWith('./') || spec.startsWith('../')) resolved = path.resolve(path.dirname(absPath), spec);
    else return Module.createRequire(absPath)(spec);
    if (!/\.[tj]s$/.test(resolved)) resolved += '.ts';
    return loadTs(resolved, cache);
  };
  new Function('exports', 'require', 'module', '__dirname', '__filename', js)(
    m.exports, req, m, path.dirname(absPath), absPath,
  );
  return m.exports;
}

const { computeReminderPlan, diffPlan, nextUnpaidEmi, OVERDUE_INTERVAL_MS } =
  loadTs(path.join(__dirname, 'reminderScheduler.ts'));
const { midnightIST } = loadTs(path.join(__dirname, '../utils/ist.ts'));

const DUE = '2026-10-15';
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Epoch for an IST wall-clock date+hour+minute (matches the scheduler math). */
function istEpoch(dateStr, hour = 0, minute = 0) {
  return midnightIST(dateStr) + (hour * 60 + minute) * MIN;
}

function emi(over = {}) {
  return { id: 'emi-1', emi_no: 3, due_date: DUE, amount: 2500, status: 'UNPAID', ...over };
}

const baseConfig = {
  reminderEnabled: true,
  overdueReminderEnabled: true,
  voiceEnabled: true,
  voiceLanguage: 'bn',
  voiceOnOverdue: false,
};
const cfg = (over = {}) => ({ ...baseConfig, ...over });

// A wide horizon that reaches the end of the due day, with OVERDUE off so the
// PRE_DUE + DUE_DAY sets are exactly countable.
function preDuePlan() {
  return computeReminderPlan([emi()], cfg({ overdueReminderEnabled: false }), {
    now: istEpoch(DUE, 0, 0) - 6 * DAY, // 6 days before due midnight
    horizonMs: 7 * DAY,
  });
}

test('nextUnpaidEmi picks the earliest unpaid, skipping paid ones', () => {
  const list = [
    emi({ id: 'a', due_date: '2026-09-15', status: 'collected' }),
    emi({ id: 'b', due_date: '2026-10-15', status: 'UNPAID' }),
    emi({ id: 'c', due_date: '2026-11-15', status: 'UNPAID' }),
  ];
  assert.equal(nextUnpaidEmi(list).id, 'b');
});

test('all EMIs paid → empty plan (payment cancels reminders)', () => {
  const list = [emi({ status: 'collected' }), emi({ id: 'x', status: 'APPROVED' })];
  assert.deepEqual(computeReminderPlan(list, cfg(), { now: istEpoch(DUE, 0) - 3 * DAY }), []);
});

test('reminderEnabled=false → empty plan', () => {
  assert.deepEqual(
    computeReminderPlan([emi()], cfg({ reminderEnabled: false }), { now: istEpoch(DUE, 0) - 3 * DAY }),
    [],
  );
});

test('PRE_DUE: 5 days × (10:00 + 18:00) = 10 slots, none on the due day', () => {
  const pre = preDuePlan().filter((o) => o.phase === 'PRE_DUE');
  assert.equal(pre.length, 10);
  const days = new Set(pre.map((o) => o.dueDate === DUE && o.fireAtIST.slice(0, 10)));
  // Every PRE_DUE slot is at minute 00 and hour 10 or 18.
  for (const o of pre) {
    const [, hm] = o.fireAtIST.split(' ');
    assert.match(hm, /^(10|18):00$/);
    assert.notEqual(o.fireAtIST.slice(0, 10), DUE); // never on the due day
    assert.equal(o.voice, false); // no voice before the due day
  }
  // Days covered are exactly Oct 10..14.
  const dates = [...new Set(pre.map((o) => o.fireAtIST.slice(0, 10)))].sort();
  assert.deepEqual(dates, ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14']);
});

test('10:00 IST maps to 04:30 UTC and 18:00 IST to 12:30 UTC (timezone correctness)', () => {
  const pre = preDuePlan().filter((o) => o.phase === 'PRE_DUE');
  const ten = pre.find((o) => o.fireAtIST === '2026-10-10 10:00');
  const six = pre.find((o) => o.fireAtIST === '2026-10-10 18:00');
  assert.ok(ten && six);
  const d10 = new Date(ten.fireAt);
  assert.equal(d10.getUTCHours(), 4);
  assert.equal(d10.getUTCMinutes(), 30);
  const d18 = new Date(six.fireAt);
  assert.equal(d18.getUTCHours(), 12);
  assert.equal(d18.getUTCMinutes(), 30);
});

test('DUE_DAY: every hour 00:00..23:00 = 24 slots, all with voice when enabled', () => {
  const due = preDuePlan().filter((o) => o.phase === 'DUE_DAY');
  assert.equal(due.length, 24);
  const hours = due.map((o) => Number(o.fireAtIST.split(' ')[1].slice(0, 2))).sort((a, b) => a - b);
  assert.deepEqual(hours, Array.from({ length: 24 }, (_, i) => i));
  for (const o of due) {
    assert.equal(o.fireAtIST.slice(0, 10), DUE);
    assert.equal(o.voice, true);
  }
});

test('voiceEnabled=false → due-day reminders carry no voice', () => {
  const plan = computeReminderPlan([emi()], cfg({ overdueReminderEnabled: false, voiceEnabled: false }), {
    now: istEpoch(DUE, 0) - 6 * DAY,
    horizonMs: 7 * DAY,
  });
  for (const o of plan.filter((x) => x.phase === 'DUE_DAY')) assert.equal(o.voice, false);
});

test('OVERDUE: every 5 minutes from 00:00 the day after due, voice off by default', () => {
  const now = istEpoch('2026-10-16', 9, 0); // day after due, 09:00 IST
  const plan = computeReminderPlan([emi()], cfg(), { now, horizonMs: HOUR });
  assert.ok(plan.length > 0);
  assert.ok(plan.every((o) => o.phase === 'OVERDUE'));
  // 09:05, 09:10, … 10:00  → 12 slots inside a 1-hour horizon.
  assert.equal(plan.length, 12);
  for (let i = 1; i < plan.length; i += 1) {
    assert.equal(plan[i].fireAt - plan[i - 1].fireAt, OVERDUE_INTERVAL_MS);
  }
  assert.ok(plan.every((o) => o.voice === false)); // due-day-only voice
  assert.ok(plan.every((o) => o.fireAt > now));
});

test('overdue voice plays only when explicitly configured', () => {
  const now = istEpoch('2026-10-16', 9, 0);
  const plan = computeReminderPlan([emi()], cfg({ voiceOnOverdue: true }), { now, horizonMs: 30 * MIN });
  assert.ok(plan.length > 0);
  assert.ok(plan.every((o) => o.voice === true));
});

test('overdueReminderEnabled=false → no overdue reminders after the due day', () => {
  const now = istEpoch('2026-10-16', 9, 0);
  const plan = computeReminderPlan([emi()], cfg({ overdueReminderEnabled: false }), { now, horizonMs: DAY });
  assert.deepEqual(plan, []);
});

test('language propagates (Bengali and Hindi)', () => {
  const bn = preDuePlan();
  assert.ok(bn.every((o) => o.language === 'bn'));
  const hiPlan = computeReminderPlan([emi()], cfg({ voiceLanguage: 'hi', overdueReminderEnabled: false }), {
    now: istEpoch(DUE, 0) - 6 * DAY,
    horizonMs: 7 * DAY,
  });
  assert.ok(hiPlan.every((o) => o.language === 'hi'));
});

test('occurrences stay strictly inside (now, now+horizon]', () => {
  const now = istEpoch(DUE, 0) - 2 * DAY;
  const horizonMs = 3 * DAY;
  const plan = computeReminderPlan([emi()], cfg({ overdueReminderEnabled: false }), { now, horizonMs });
  for (const o of plan) {
    assert.ok(o.fireAt > now, `fireAt ${o.fireAtIST} must be after now`);
    assert.ok(o.fireAt <= now + horizonMs, `fireAt ${o.fireAtIST} must be within horizon`);
  }
});

test('idempotent: recomputing yields identical stable ids (no duplicates)', () => {
  const opts = { now: istEpoch(DUE, 0) - 6 * DAY, horizonMs: 7 * DAY };
  const a = computeReminderPlan([emi()], cfg({ overdueReminderEnabled: false }), opts);
  const b = computeReminderPlan([emi()], cfg({ overdueReminderEnabled: false }), opts);
  assert.deepEqual(a.map((o) => o.id), b.map((o) => o.id));
  // No id appears twice within a single plan.
  assert.equal(new Set(a.map((o) => o.id)).size, a.length);
});

test('diffPlan schedules only new alarms and cancels stale ones', () => {
  const opts = { now: istEpoch(DUE, 0) - 6 * DAY, horizonMs: 7 * DAY };
  const plan = computeReminderPlan([emi()], cfg({ overdueReminderEnabled: false }), opts);
  const ids = plan.map((o) => o.id);

  // Nothing scheduled yet → schedule all, cancel none.
  const fresh = diffPlan(plan, []);
  assert.equal(fresh.toSchedule.length, plan.length);
  assert.equal(fresh.toCancel.length, 0);

  // Everything already scheduled → no-op.
  const steady = diffPlan(plan, ids);
  assert.equal(steady.toSchedule.length, 0);
  assert.equal(steady.toCancel.length, 0);

  // EMI paid → empty plan → cancel every previously-scheduled alarm.
  const paid = computeReminderPlan([emi({ status: 'collected' })], cfg(), opts);
  const afterPay = diffPlan(paid, ids);
  assert.equal(afterPay.toSchedule.length, 0);
  assert.deepEqual(afterPay.toCancel.sort(), [...ids].sort());
});

test('ids encode emi + phase + instant so a rescheduled EMI replaces cleanly', () => {
  const opts = { now: istEpoch(DUE, 0) - 6 * DAY, horizonMs: 7 * DAY };
  const oldPlan = computeReminderPlan([emi()], cfg({ overdueReminderEnabled: false }), opts);
  // Due date moves by a month → all ids differ → old ones cancelled, new ones scheduled.
  const newPlan = computeReminderPlan([emi({ due_date: '2026-11-15' })], cfg({ overdueReminderEnabled: false }), {
    now: istEpoch('2026-11-15', 0) - 6 * DAY,
    horizonMs: 7 * DAY,
  });
  const d = diffPlan(newPlan, oldPlan.map((o) => o.id));
  assert.equal(d.toSchedule.length, newPlan.length);
  assert.equal(d.toCancel.length, oldPlan.length);
});

test('maxOccurrences caps a long overdue horizon', () => {
  const now = istEpoch('2026-10-16', 0, 0);
  const plan = computeReminderPlan([emi()], cfg(), { now, horizonMs: 30 * DAY, maxOccurrences: 50 });
  assert.ok(plan.length <= 50);
});
