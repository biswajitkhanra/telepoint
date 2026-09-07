import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Role onboarding screen exists and AuthContext manages device role', () => {
  assert.ok(fs.existsSync('mobile/src/screens/RoleSelectionScreen.tsx'), 'RoleSelectionScreen must exist');
  const auth = fs.readFileSync('mobile/src/context/AuthContext.tsx', 'utf8');
  assert.ok(auth.includes('deviceRole'), 'AuthContext must expose deviceRole');
  assert.ok(auth.includes('setRolePreference'), 'AuthContext must expose setRolePreference');
  assert.ok(auth.includes('STORAGE_KEYS.DEVICE_ROLE'), 'Must persist role to AsyncStorage');
});
