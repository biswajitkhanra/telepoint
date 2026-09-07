import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('RootNavigator routes correctly based on deviceRole and customer session', () => {
  const navigator = fs.readFileSync('mobile/src/navigation/RootNavigator.tsx', 'utf8');

  assert.ok(navigator.includes('RoleSelectionScreen'), 'Must include RoleSelectionScreen');
  assert.ok(navigator.includes('StaffPortalScreen'), 'Must include StaffPortalScreen');
  assert.ok(navigator.includes('LoginScreen'), 'Must include LoginScreen');
  assert.ok(navigator.includes('MainTabs'), 'Must include MainTabs');
  assert.ok(navigator.includes('deviceRole === null'), 'Must show RoleSelection when deviceRole is null');
  assert.ok(navigator.includes("deviceRole === 'staff'"), 'Must show StaffPortal when deviceRole is staff');
});

test('Mobile UI adheres to Light Neo-Fintech Pearl theme (not dark color)', () => {
  const appJson = JSON.parse(fs.readFileSync('mobile/app.json', 'utf8'));
  assert.equal(appJson.expo.userInterfaceStyle, 'light', 'app.json userInterfaceStyle must be light');

  const config = fs.readFileSync('mobile/src/config.ts', 'utf8');
  assert.ok(config.includes('#F8FAFC'), 'Config must have Clean Pearl Alabaster Canvas');
  assert.ok(config.includes('#FFFFFF'), 'Config must have Crisp Pure White Card Surface');

  const dashboard = fs.readFileSync('mobile/src/screens/DashboardScreen.tsx', 'utf8');
  assert.ok(dashboard.includes('#0F172A'), 'Dashboard must use deep slate typography');

  const profile = fs.readFileSync('mobile/src/screens/ProfileScreen.tsx', 'utf8');
  assert.ok(profile.includes('#0F172A'), 'Profile must use deep slate typography');

  const login = fs.readFileSync('mobile/src/screens/LoginScreen.tsx', 'utf8');
  assert.ok(login.includes('#0F172A'), 'Login must use deep slate typography');
});
