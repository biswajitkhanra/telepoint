import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('StaffPortalScreen integrates WebView and native header controls', () => {
  assert.ok(fs.existsSync('mobile/src/screens/StaffPortalScreen.tsx'), 'StaffPortalScreen must exist');
  const screen = fs.readFileSync('mobile/src/screens/StaffPortalScreen.tsx', 'utf8');
  assert.ok(screen.includes('WebView'), 'Must render WebView');
  assert.ok(screen.includes('PORTAL_BASE_URL'), 'Must point to portal base url');
  assert.ok(screen.includes('Switch to Customer'), 'Must have customer switch shortcut');
});
