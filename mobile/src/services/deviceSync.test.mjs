import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const js = ts.transpileModule(readFileSync(new URL('./deviceSync.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function setup(response, released = true) {
  const calls = [];
  const record = (name, result) => async (...args) => { calls.push([name, ...args]); return result; };
  const dependencies = {
    './deviceApi': {
      getInstallationId: async () => 'install', pollCommands: async () => response,
      ackCommand: record('ack'), sendHeartbeat: record('heartbeat'),
    },
    './deviceManagement': {
      isDeviceManagementSupported: () => true,
      applyFinancingProtection: record('protect', { applied: true }),
      releaseManagedRestrictions: record('release', { ok: released }),
      getDeviceManagementStatus: async () => ({ adminActive: true, mode: 'DEVICE_OWNER' }),
      getDevicePolicies: async () => ({}), isTrackingEnabled: async () => false,
      executeAuthorizedLock: record('lock', { ok: true }),
      executeAuthorizedUnlock: record('unlock', { ok: true }),
      getLastUnlockedAt: async () => 0,
    },
    './reminderService': { syncReminderConfigFromServer: async () => {}, cacheCustomerPhoto: async () => {}, cancelAllReminders: record('cancelReminders') },
    '../config': { FRP_PROTECTION_ACCOUNTS: [] },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => {
    assert.ok(dependencies[name], `Unexpected dependency ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return { run: () => module.exports.syncDeviceCommandsOnce('customer'), calls };
}

const device = { id: 'device', management_status: 'ACTIVE' };
for (const response of [null, {}, { device }, { device, breakdown: { customer_status: 'UNKNOWN' } }]) {
  test(`unconfirmed loan status does not activate protection: ${JSON.stringify(response)}`, async () => {
    const { run, calls } = setup(response);
    await run();
    assert.equal(calls.some(([name]) => name === 'protect' || name === 'release'), false);
  });
}
test('an outstanding registered loan retains protection', async () => {
  const { run, calls } = setup({ device, breakdown: { customer_status: 'RUNNING' } });
  await run();
  assert.equal(calls.filter(([name]) => name === 'protect').length, 1);
});
for (const status of ['COMPLETE', 'SETTLED']) {
  test(`${status} releases management and never executes a queued lock`, async () => {
    const { run, calls } = setup({ device, loan_status: status, commands: [{
      id: 'stale-lock', device_id: 'device', customer_id: 'customer', command_type: 'LOCK',
      status: 'PENDING', expires_at: new Date(Date.now() + 60000).toISOString(),
    }] });
    const result = await run();
    assert.equal(calls.filter(([name]) => name === 'release').length, 1);
    assert.equal(calls.some(([name]) => name === 'lock' || name === 'protect'), false);
    assert.equal(result.lockedChangeTo, false);
  });
}
test('failed release is not reported as unlocked', async () => {
  const { run } = setup({ device, loan_status: 'COMPLETE' }, false);
  assert.equal((await run()).lockedChangeTo, undefined);
});
