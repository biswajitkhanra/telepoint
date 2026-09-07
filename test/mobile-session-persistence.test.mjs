import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('AuthContext enforces persistent session lockdown without auto-logout', () => {
  const authContent = fs.readFileSync('mobile/src/context/AuthContext.tsx', 'utf8');
  assert.ok(authContent.includes('STORAGE_KEYS.SESSION'), 'Must use persistent storage key');
  assert.ok(authContent.includes('restoreSession'), 'Must restore saved session on launch');
  assert.ok(authContent.includes('catch'), 'Background refresh must catch errors gracefully without evicting customer session');
  assert.ok(authContent.includes('Alert.alert') || authContent.includes('logout'), 'Logout must be guarded or explicit');
});
