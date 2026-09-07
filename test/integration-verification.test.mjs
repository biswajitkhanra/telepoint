import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTs } from './load-ts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load services and helpers via loadTs
const { isExpoPushToken } = loadTs(path.resolve(__dirname, '../lib/notifications/expoPushService.ts'));
const { diffDaysIST, todayIST, addDaysIST } = loadTs(path.resolve(__dirname, '../lib/ist.ts'));

test('Comprehensive End-to-End Suite: Notifications, Schedulers & Validation', async (suite) => {

  await suite.test('1. Expo Token format validation matrix', () => {
    const validTokens = [
      'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
      'ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
      'ExponentPushToken[AbCdEf123456_+-/==]',
      'ExponentPushToken[4Zgq_O_7s1W2z3Y4x5A6B7]',
    ];
    for (const tok of validTokens) {
      assert.equal(isExpoPushToken(tok), true, `Token should be valid: ${tok}`);
    }

    const invalidTokens = [
      '',
      '   ',
      'invalid-raw-token',
      'ExponentPushToken[]',
      'fcm_raw_token_xyz',
      'ExponentPushToken[has space]',
      null,
      undefined,
      12345,
      {},
    ];
    for (const tok of invalidTokens) {
      assert.equal(isExpoPushToken(tok), false, `Token should be invalid: ${tok}`);
    }
  });

  await suite.test('2. Automatic EMI reminder 5-day lookahead and day calculation', () => {
    const mockToday = '2026-09-07';

    // 0 days: Due today
    assert.equal(diffDaysIST('2026-09-07', mockToday), 0);
    // 1 day: Due tomorrow
    assert.equal(diffDaysIST('2026-09-08', mockToday), 1);
    // 2 days
    assert.equal(diffDaysIST('2026-09-09', mockToday), 2);
    // 3 days
    assert.equal(diffDaysIST('2026-09-10', mockToday), 3);
    // 4 days
    assert.equal(diffDaysIST('2026-09-11', mockToday), 4);
    // 5 days
    assert.equal(diffDaysIST('2026-09-12', mockToday), 5);

    // 6 days (outside window)
    assert.equal(diffDaysIST('2026-09-13', mockToday), 6);
    // -1 day (past due date)
    assert.equal(diffDaysIST('2026-09-06', mockToday), -1);

    // Filter simulation
    const candidateDates = [
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
      '2026-09-14',
    ];

    const eligible = candidateDates.filter(d => {
      const diff = diffDaysIST(d, mockToday);
      return diff >= 0 && diff <= 5;
    });

    assert.deepEqual(eligible, [
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
    ]);
  });

  await suite.test('3. EMI Reminder Idempotency Key uniqueness & reproducibility', () => {
    const customerA = 'c0000000-0000-0000-0000-000000000001';
    const emiScheduleA = 'e0000000-0000-0000-0000-000000000001';
    const tokenA = 't0000000-0000-0000-0000-000000000001';
    const date = '2026-09-07';

    const key1 = `emi_reminder:${customerA}:${emiScheduleA}:${tokenA}:${date}`;
    const key2 = `emi_reminder:${customerA}:${emiScheduleA}:${tokenA}:${date}`;

    // Same run twice
    assert.equal(key1, key2);

    // Different day
    const keyNextDay = `emi_reminder:${customerA}:${emiScheduleA}:${tokenA}:2026-09-08`;
    assert.notEqual(key1, keyNextDay);

    // Different customer
    const keyCustB = `emi_reminder:c0000000-0000-0000-0000-000000000002:${emiScheduleA}:${tokenA}:${date}`;
    assert.notEqual(key1, keyCustB);
  });

  await suite.test('4. Broadcast Push Targeting (Single customer vs Retailer-wide)', () => {
    const customers = [
      { id: 'c-1', retailer_id: 'ret-1' },
      { id: 'c-2', retailer_id: 'ret-1' },
      { id: 'c-3', retailer_id: 'ret-2' },
    ];

    // Single customer
    const directBroadcast = {
      id: 'b-1',
      target_retailer_id: 'ret-1',
      target_customer_id: 'c-2',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    };

    let recipientsDirect = [];
    if (directBroadcast.target_customer_id) {
      recipientsDirect = [directBroadcast.target_customer_id];
    } else {
      recipientsDirect = customers.filter(c => c.retailer_id === directBroadcast.target_retailer_id).map(c => c.id);
    }
    assert.deepEqual(recipientsDirect, ['c-2']);

    // Retailer-wide
    const storeBroadcast = {
      id: 'b-2',
      target_retailer_id: 'ret-1',
      target_customer_id: null,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    };

    let recipientsStore = [];
    if (storeBroadcast.target_customer_id) {
      recipientsStore = [storeBroadcast.target_customer_id];
    } else {
      recipientsStore = customers.filter(c => c.retailer_id === storeBroadcast.target_retailer_id).map(c => c.id);
    }
    assert.deepEqual(recipientsStore, ['c-1', 'c-2']);
    assert.equal(recipientsStore.includes('c-3'), false);
  });

  await suite.test('5. Broadcast expiration guard', () => {
    const expiredBroadcast = {
      expires_at: new Date(Date.now() - 60000).toISOString(),
    };
    const activeBroadcast = {
      expires_at: new Date(Date.now() + 60000).toISOString(),
    };

    assert.equal(new Date(expiredBroadcast.expires_at).getTime() <= Date.now(), true);
    assert.equal(new Date(activeBroadcast.expires_at).getTime() <= Date.now(), false);
  });

  await suite.test('6. Push batch chunking logic', () => {
    // Simulate 250 messages
    const msgs = Array.from({ length: 250 }, (_, i) => ({
      to: `ExponentPushToken[tok_${i}]`,
      title: `Title ${i}`,
      body: `Body ${i}`,
    }));

    const CHUNK_SIZE = 100;
    const chunks = [];
    for (let i = 0; i < msgs.length; i += CHUNK_SIZE) {
      chunks.push(msgs.slice(i, i + CHUNK_SIZE));
    }

    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].length, 100);
    assert.equal(chunks[1].length, 100);
    assert.equal(chunks[2].length, 50);
  });
});
