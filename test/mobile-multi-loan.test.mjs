import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Customer multi-loan switching logic is implemented', () => {
  const auth = fs.readFileSync('mobile/src/context/AuthContext.tsx', 'utf8');
  assert.ok(auth.includes('allLoans'), 'AuthContext must track all loans for customer');
  assert.ok(auth.includes('switchActiveLoan'), 'AuthContext must support switching active loan');

  const dashboard = fs.readFileSync('mobile/src/screens/DashboardScreen.tsx', 'utf8');
  assert.ok(
    dashboard.includes('switchModalVisible') ||
      dashboard.includes('Switch Financed Device') ||
      dashboard.includes('Switch Device') ||
      dashboard.includes('allLoans'),
    'Dashboard must have loan switch UI'
  );

  const profile = fs.readFileSync('mobile/src/screens/ProfileScreen.tsx', 'utf8');
  assert.ok(
    profile.includes('Switch App Mode') ||
      profile.includes('resetRolePreference') ||
      profile.includes('setRolePreference'),
    'Profile must support switching device mode'
  );
});
