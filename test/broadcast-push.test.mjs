import test from 'node:test';
import assert from 'node:assert/strict';

test('Broadcast Push Notification Targeting & Deduplication', async (t) => {
  await t.test('Single Customer Targeting vs Retailer-Wide Targeting resolution', () => {
    const retailerCustomers = [
      { id: 'cust-1', retailer_id: 'ret-A' },
      { id: 'cust-2', retailer_id: 'ret-A' },
      { id: 'cust-3', retailer_id: 'ret-A' },
      { id: 'cust-4', retailer_id: 'ret-B' },
    ];

    // Scenario A: Single customer broadcast
    const singleCustomerBroadcast = {
      id: 'bcast-single',
      target_retailer_id: 'ret-A',
      target_customer_id: 'cust-2',
      message: 'Exclusive discount for you!',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    };

    let targetIdsA = [];
    if (singleCustomerBroadcast.target_customer_id) {
      targetIdsA = [singleCustomerBroadcast.target_customer_id];
    } else {
      targetIdsA = retailerCustomers
        .filter(c => c.retailer_id === singleCustomerBroadcast.target_retailer_id)
        .map(c => c.id);
    }

    assert.equal(targetIdsA.length, 1);
    assert.equal(targetIdsA[0], 'cust-2');
    assert.equal(targetIdsA.includes('cust-1'), false);
    assert.equal(targetIdsA.includes('cust-3'), false);

    // Scenario B: Retailer-wide broadcast
    const retailerBroadcast = {
      id: 'bcast-all',
      target_retailer_id: 'ret-A',
      target_customer_id: null,
      message: 'Store holiday tomorrow!',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    };

    let targetIdsB = [];
    if (retailerBroadcast.target_customer_id) {
      targetIdsB = [retailerBroadcast.target_customer_id];
    } else {
      targetIdsB = retailerCustomers
        .filter(c => c.retailer_id === retailerBroadcast.target_retailer_id)
        .map(c => c.id);
    }

    assert.equal(targetIdsB.length, 3);
    assert.deepEqual(targetIdsB, ['cust-1', 'cust-2', 'cust-3']);
    assert.equal(targetIdsB.includes('cust-4'), false);
  });

  await t.test('Expired broadcasts are rejected before push dispatch', () => {
    const expiredTimestamp = new Date(Date.now() - 3600000).toISOString();
    const futureTimestamp = new Date(Date.now() + 3600000).toISOString();

    const isExpiredA = new Date(expiredTimestamp).getTime() <= Date.now();
    const isExpiredB = new Date(futureTimestamp).getTime() <= Date.now();

    assert.equal(isExpiredA, true, 'Past expiry must evaluate to expired');
    assert.equal(isExpiredB, false, 'Future expiry must evaluate to active');
  });

  await t.test('Broadcast idempotency key format', () => {
    const broadcastId = 'bcast-99';
    const customerId = 'cust-123';
    const tokenId = 'token-abc';

    const key = `broadcast:${broadcastId}:${customerId}:${tokenId}`;
    assert.equal(key, 'broadcast:bcast-99:cust-123:token-abc');
  });
});
