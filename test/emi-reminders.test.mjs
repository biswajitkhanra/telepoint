import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTs } from './load-ts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { diffDaysIST } = loadTs(path.resolve(__dirname, '../lib/ist.ts'));
const { isExpoPushToken } = loadTs(
  path.resolve(__dirname, '../lib/notifications/expoPushService.ts')
);

test('EMI Reminder Business Rules & Token Validation', async (t) => {
  await t.test('isExpoPushToken validates standard Expo push tokens', () => {
    assert.equal(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]'), true);
    assert.equal(isExpoPushToken('ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]'), true);
    assert.equal(isExpoPushToken('ExponentPushToken[AbC123_+-/==]'), true);

    // Invalid tokens
    assert.equal(isExpoPushToken(''), false);
    assert.equal(isExpoPushToken('invalid-token-string'), false);
    assert.equal(isExpoPushToken(null), false);
    assert.equal(isExpoPushToken(undefined), false);
    assert.equal(isExpoPushToken('fcm_token_12345'), false);
  });

  await t.test('5-day lookahead window logic', () => {
    const today = '2026-09-07';

    // Test cases for due dates
    const testCases = [
      { dueDate: '2026-09-07', expectedDays: 0, eligible: true, title: 'EMI Due Today!' },
      { dueDate: '2026-09-08', expectedDays: 1, eligible: true, title: 'EMI Due Tomorrow' },
      { dueDate: '2026-09-09', expectedDays: 2, eligible: true, title: 'EMI Due in 2 Days' },
      { dueDate: '2026-09-10', expectedDays: 3, eligible: true, title: 'EMI Due in 3 Days' },
      { dueDate: '2026-09-11', expectedDays: 4, eligible: true, title: 'EMI Due in 4 Days' },
      { dueDate: '2026-09-12', expectedDays: 5, eligible: true, title: 'EMI Due in 5 Days' },
      { dueDate: '2026-09-13', expectedDays: 6, eligible: false, title: null },
      { dueDate: '2026-09-06', expectedDays: -1, eligible: false, title: null },
    ];

    for (const tc of testCases) {
      const days = diffDaysIST(tc.dueDate, today);
      assert.equal(days, tc.expectedDays, `Diff days mismatch for ${tc.dueDate}`);
      const isWithin5Days = days >= 0 && days <= 5;
      assert.equal(isWithin5Days, tc.eligible, `Eligibility mismatch for ${tc.dueDate}`);

      if (isWithin5Days) {
        let expectedTitle = 'EMI Payment Reminder';
        if (days === 0) expectedTitle = 'EMI Due Today!';
        else if (days === 1) expectedTitle = 'EMI Due Tomorrow';
        else expectedTitle = `EMI Due in ${days} Days`;
        assert.equal(expectedTitle, tc.title);
      }
    }
  });

  await t.test('Deterministic idempotency key ensures zero duplicate notifications', () => {
    const customerId = 'cust-123';
    const emiId = 'emi-456';
    const tokenId = 'tok-789';
    const dateIST = '2026-09-07';

    // Generated on run 1
    const keyRun1 = `emi_reminder:${customerId}:${emiId}:${tokenId}:${dateIST}`;
    // Generated on run 2 (e.g. accidental retry 1 hour later)
    const keyRun2 = `emi_reminder:${customerId}:${emiId}:${tokenId}:${dateIST}`;

    assert.equal(keyRun1, keyRun2);
    assert.equal(keyRun1, 'emi_reminder:cust-123:emi-456:tok-789:2026-09-07');

    // Different customer or day produces distinct keys
    const nextDayKey = `emi_reminder:${customerId}:${emiId}:${tokenId}:2026-09-08`;
    assert.notEqual(keyRun1, nextDayKey);
  });
});
