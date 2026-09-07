import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('THEME configuration contains light neo-fintech tokens and role storage keys', () => {
  const config = fs.readFileSync('mobile/src/config.ts', 'utf8');
  assert.ok(config.includes('#F8FAFC') || config.includes('#FFFFFF'), 'Must include light canvas');
  assert.ok(config.includes('#0F172A'), 'Must include deep slate text');
  assert.ok(config.includes('#2563EB'), 'Must include royal blue');
  assert.ok(config.includes('DEVICE_ROLE'), 'Must include DEVICE_ROLE storage key');
  assert.ok(config.includes('ACTIVE_LOAN'), 'Must include ACTIVE_LOAN storage key');
});
