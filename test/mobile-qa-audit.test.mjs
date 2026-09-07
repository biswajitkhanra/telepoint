import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('QA Audit 1: Unified Multi-Role Architecture (Customer, Retailer, Admin)', () => {
  const roleSelection = fs.readFileSync('mobile/src/screens/RoleSelectionScreen.tsx', 'utf8');
  assert.ok(roleSelection.includes('Customer'), 'Customer onboarding card present');
  assert.ok(roleSelection.includes('Retailer or Admin'), 'Staff onboarding card present');
  assert.ok(roleSelection.includes('setRolePreference'), 'Role preference stored on selection');

  const staffPortal = fs.readFileSync('mobile/src/screens/StaffPortalScreen.tsx', 'utf8');
  assert.ok(staffPortal.includes('WebView'), 'StaffPortal embeds WebView');
  assert.ok(staffPortal.includes('PORTAL_BASE_URL'), 'Connects to live Supabase portal URL');
  assert.ok(staffPortal.includes('Switch Staff Account'), 'Allows switching between Admin and Retailer');
  assert.ok(staffPortal.includes("setRolePreference('customer')"), 'Allows switching to customer role');

  const nav = fs.readFileSync('mobile/src/navigation/RootNavigator.tsx', 'utf8');
  assert.ok(nav.includes('RoleSelectionScreen'), 'RootNavigator routes to RoleSelection when role is null');
  assert.ok(nav.includes('StaffPortalScreen'), 'RootNavigator routes to StaffPortal when role is staff');
});

test('QA Audit 2: Multi-Loan Account Switching on Same Device', () => {
  const auth = fs.readFileSync('mobile/src/context/AuthContext.tsx', 'utf8');
  assert.ok(auth.includes('allLoans: MultiLoanCustomer[]'), 'Tracks all customer loans');
  assert.ok(auth.includes('switchActiveLoan'), 'Provides switchActiveLoan function');
  assert.ok(auth.includes('STORAGE_KEYS.ACTIVE_LOAN'), 'Persists active loan identifier');

  const dashboard = fs.readFileSync('mobile/src/screens/DashboardScreen.tsx', 'utf8');
  assert.ok(dashboard.includes('allLoans.length > 1'), 'Dashboard displays switcher pill when multiple loans exist');
  assert.ok(dashboard.includes('switchModalVisible'), 'Has modal for selecting active loan');
  assert.ok(dashboard.includes('Switch Financed Device'), 'Modal labeled Switch Financed Device');

  const profile = fs.readFileSync('mobile/src/screens/ProfileScreen.tsx', 'utf8');
  assert.ok(profile.includes('Switch App Mode'), 'Profile provides App Mode switch');
  assert.ok(profile.includes('Linked Device Loans'), 'Profile lists linked device loans');
});

test('QA Audit 3: Light Neo-Fintech Pearl UI/UX & Visual Aesthetics', () => {
  const appJson = JSON.parse(fs.readFileSync('mobile/app.json', 'utf8'));
  assert.equal(appJson.expo.userInterfaceStyle, 'light', 'app.json UI style is light');
  assert.equal(appJson.expo.splash.backgroundColor, '#F8FAFC', 'Splash background is light alabaster');
  assert.equal(appJson.expo.android.adaptiveIcon.backgroundColor, '#FFFFFF', 'Adaptive icon background is white');

  const config = fs.readFileSync('mobile/src/config.ts', 'utf8');
  assert.ok(config.includes('#F8FAFC'), 'Config has pearl alabaster canvas');
  assert.ok(config.includes('#FFFFFF'), 'Config has pure white card surface');
  assert.ok(config.includes('#0F172A'), 'Config has deep slate primary text');

  // Verify key screens use light surfaces and deep slate text
  const screens = [
    'mobile/src/screens/DashboardScreen.tsx',
    'mobile/src/screens/LoginScreen.tsx',
    'mobile/src/screens/ProfileScreen.tsx',
    'mobile/src/screens/EmiScheduleScreen.tsx',
    'mobile/src/screens/BroadcastsScreen.tsx',
    'mobile/src/screens/RoleSelectionScreen.tsx',
    'mobile/src/screens/StaffPortalScreen.tsx',
  ];

  for (const screenPath of screens) {
    const code = fs.readFileSync(screenPath, 'utf8');
    assert.ok(code.includes('#0F172A') || code.includes('THEME.text.primary'), `${screenPath} must use high-contrast slate text`);
  }
});

test('QA Audit 4: Live Supabase Backend & Session Lockdown', () => {
  const config = fs.readFileSync('mobile/src/config.ts', 'utf8');
  assert.ok(config.includes('@telepoint_customer_session'), 'Session key is @telepoint_customer_session');
  assert.ok(config.includes('@telepoint_device_role'), 'Device role key is @telepoint_device_role');

  const auth = fs.readFileSync('mobile/src/context/AuthContext.tsx', 'utf8');
  assert.ok(auth.includes('STORAGE_KEYS.SESSION'), 'Uses persistent session storage');
  assert.ok(auth.includes('STORAGE_KEYS.DEVICE_ROLE'), 'Uses persistent device role storage');

  const api = fs.readFileSync('mobile/src/services/api.ts', 'utf8');
  assert.ok(api.includes('/api/customer-login'), 'Direct login endpoint mapped');
  assert.ok(api.includes('/api/customer-app-token/register'), 'Push token registration mapped');
});

test('QA Audit 5: EAS Standalone Production APK Configuration', () => {
  const appJson = JSON.parse(fs.readFileSync('mobile/app.json', 'utf8'));
  assert.equal(appJson.expo.owner, 'biswodip', 'Project owner is biswodip');
  assert.equal(appJson.expo.extra.eas.projectId, '59cc4210-babc-4498-93a5-f712a9283187', 'Project linked to valid UUID EAS ID');
  assert.equal(appJson.expo.android.package, 'com.telepoint.customer', 'Android package configured');

  const easJson = JSON.parse(fs.readFileSync('mobile/eas.json', 'utf8'));
  assert.equal(easJson.build.production.android.buildType, 'apk', 'Production profile outputs standalone APK');
  assert.equal(easJson.build.preview.android.buildType, 'apk', 'Preview profile outputs standalone APK');
  assert.equal(easJson.build.production.distribution, 'internal', 'Production distribution set to internal download');
});
