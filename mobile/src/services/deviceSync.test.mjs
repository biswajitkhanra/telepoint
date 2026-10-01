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
      isLockCommandStale: async () => staleLocks,
      showLockOverlay: record('overlay'),
      grantLocationSimPermissionsIfOwner: record('grantPerms', { granted: true }),
      getLocation: record('location', { ok: true }), getSimInfo: record('sim', { ok: true }),
      rebootDevice: record('reboot', { ok: true }), stopCommandService: record('stopSvc'),
      hideAllUserApps: record('hideAll', 0), setApplicationHidden: record('hideOne', { applied: true }),
      setAppsSuspended: record('suspend', { ok: true }), configureAppLock: record('appLock', { ok: true }),
      setAppLockEnabled: record('appLockOn', { ok: true }), setAirplaneMode: record('airplane', 'global'),
      setTrackingEnabled: record('track', { ok: true }), setWifiEnabled: record('wifi', { ok: true }),
      setDevicePolicy: record('policy', { ok: true }), openOemAutostartSettings: record('oem', { opened: true }),
    },
    './reminderService': {
      syncReminderConfigFromServer: async () => {}, cacheCustomerPhoto: async () => {},
      cancelAllReminders: record('cancelReminders'), presentManualReminder: record('remind'),
    },
    '../config': { FRP_PROTECTION_ACCOUNTS: [] },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => {
    assert.ok(dependencies[name], `Unexpected dependency ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return { run: () => module.exports.syncDeviceCommandsOnce('customer'), calls };
}

let staleLocks = false;

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

const pending = (id, command_type) => ({
  id, device_id: 'device', customer_id: 'customer', command_type,
  status: 'PENDING', expires_at: new Date(Date.now() + 60000).toISOString(),
  created_at: new Date().toISOString(),
});

test('stale LOCK issued before a local unlock is acked SUPERSEDED and never executed', async () => {
  staleLocks = true;
  try {
    const { run, calls } = setup({ device, loan_status: 'RUNNING', server_now: new Date().toISOString(), commands: [pending('stale', 'LOCK')] });
    const result = await run();
    assert.equal(calls.filter(([name]) => name === 'lock').length, 0);
    const ack = calls.find(([name]) => name === 'ack');
    assert.ok(ack, 'expected a SUPERSEDED ack');
    assert.equal(ack[4], 'SUPERSEDED');
    assert.equal(result.lockedChangeTo, undefined);
  } finally { staleLocks = false; }
});

test('fresh LOCK executes and reports locked', async () => {
  const { run, calls } = setup({ device, loan_status: 'RUNNING', server_now: new Date().toISOString(), commands: [pending('fresh', 'LOCK')] });
  const result = await run();
  assert.equal(calls.filter(([name]) => name === 'lock').length, 1);
  assert.equal(result.lockedChangeTo, true);
});

test('UNLOCK always executes even when the stale guard would fire', async () => {
  staleLocks = true;
  try {
    const { run, calls } = setup({ device, loan_status: 'RUNNING', server_now: new Date().toISOString(), commands: [pending('unlock', 'UNLOCK')] });
    const result = await run();
    assert.equal(calls.filter(([name]) => name === 'unlock').length, 1);
    assert.equal(result.lockedChangeTo, false);
  } finally { staleLocks = false; }
});
