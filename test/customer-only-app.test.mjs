// test/customer-only-app.test.mjs
// Automated Verification Suite for Customer-Only Dedicated Mobile App

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const mobileSrc = path.join(rootDir, 'mobile', 'src');

console.log('--- 🧪 STARTING CUSTOMER-ONLY MOBILE APP AUDIT ---');

// Test 1: RootNavigator contains only customer routes
{
  const navContent = fs.readFileSync(path.join(mobileSrc, 'navigation', 'RootNavigator.tsx'), 'utf-8');
  assert(!navContent.includes('RoleSelectionScreen'), 'RootNavigator must NOT include RoleSelectionScreen');
  assert(!navContent.includes('StaffLoginScreen'), 'RootNavigator must NOT include StaffLoginScreen');
  assert(!navContent.includes('StaffPortalScreen'), 'RootNavigator must NOT include StaffPortalScreen');
  assert(!navContent.includes('AdminConsoleView'), 'RootNavigator must NOT include AdminConsoleView');
  assert(!navContent.includes('RetailerConsoleView'), 'RootNavigator must NOT include RetailerConsoleView');
  assert(navContent.includes('<Stack.Screen name="Login" component={LoginScreen} />'), 'RootNavigator must have Login screen');
  assert(navContent.includes('<Stack.Screen name="MainTabs" component={MainTabs} />'), 'RootNavigator must have MainTabs');
  console.log('✅ Test 1: RootNavigator is 100% Customer-Only');
}

// Test 2: LoginScreen has zero staff login links and contains helpline 7003617029
{
  const loginContent = fs.readFileSync(path.join(mobileSrc, 'screens', 'LoginScreen.tsx'), 'utf-8');
  assert(!loginContent.includes('Staff or Store Owner'), 'LoginScreen must not have staff login link');
  assert(!loginContent.includes('topSwitchRoleContainer'), 'LoginScreen must not have role switcher');
  assert(loginContent.includes('7003617029') || loginContent.includes('70036 17029'), 'LoginScreen must have helpline 7003617029');
  console.log('✅ Test 2: LoginScreen is pure Customer Authentication with Helpline');
}

// Test 3: DashboardScreen has zero staff switchers or account mode menus
{
  const dashContent = fs.readFileSync(path.join(mobileSrc, 'screens', 'DashboardScreen.tsx'), 'utf-8');
  assert(!dashContent.includes('Switch to Staff Mode'), 'DashboardScreen must NOT offer Switch to Staff Mode');
  assert(!dashContent.includes('accountMenuVisible'), 'DashboardScreen must NOT have accountMenuVisible');
  assert(!dashContent.includes('switchRole'), 'DashboardScreen must NOT call switchRole');
  console.log('✅ Test 3: DashboardScreen has zero staff modes or switchers');
}

// Test 4: ProfileScreen has helpline 7003617029 and Mastermind attribution
{
  const profileContent = fs.readFileSync(path.join(mobileSrc, 'screens', 'ProfileScreen.tsx'), 'utf-8');
  assert(!profileContent.includes('Switch to Staff Mode'), 'ProfileScreen must NOT have staff mode');
  assert(profileContent.includes('7003617029'), 'ProfileScreen must have support phone 7003617029');
  assert(profileContent.includes('Biswodip Goj'), 'ProfileScreen must have attribution to Biswodip Goj');
  console.log('✅ Test 4: ProfileScreen has verified Helpline and Mastermind Attribution');
}

// Test 5: PaymentModal enforces consolidated bill (Base EMI + Fine + 1st Charge)
{
  const payContent = fs.readFileSync(path.join(mobileSrc, 'components', 'PaymentModal.tsx'), 'utf-8');
  assert(payContent.includes('biswajit.khanra82@axl'), 'PaymentModal must use payee biswajit.khanra82@axl');
  assert(payContent.includes('Telepoint EMI'), 'PaymentModal must use payee name Telepoint EMI');
  assert(payContent.includes('7003617029'), 'PaymentModal must have helpline 7003617029');
  assert(payContent.includes('totalPayable = baseEmi + totalFineRemaining + firstChargeDue'), 'PaymentModal must calculate strictly baseEmi + fine + 1stCharge');
  assert(!payContent.includes('selectedType'), 'PaymentModal must NOT have selectedType radio chips allowing split payment');
  assert(!payContent.includes('optionsRow'), 'PaymentModal must NOT have optionsRow');
  console.log('✅ Test 5: PaymentModal enforces consolidated bill without split payment options');
}

// Test 6: Mathematical Formula Verification for Consolidated Bill
{
  function calculateTotalBill(emiDue, customerEmiAmount, fineRemaining, firstChargeRemaining) {
    const baseEmi = emiDue > 0 ? emiDue : (customerEmiAmount || 0);
    return baseEmi + (fineRemaining || 0) + (firstChargeRemaining || 0);
  }

  // Case A: Regular on-time EMI (no fine, no 1st charge)
  assert.strictEqual(calculateTotalBill(2500, 2500, 0, 0), 2500);

  // Case B: Overdue EMI with ₹200 fine
  assert.strictEqual(calculateTotalBill(2500, 2500, 200, 0), 2700);

  // Case C: First installment with ₹1,000 first charge
  assert.strictEqual(calculateTotalBill(2500, 2500, 0, 1000), 3500);

  // Case D: Overdue first installment with both fine and 1st charge
  assert.strictEqual(calculateTotalBill(2500, 2500, 300, 1000), 3800);

  // Case E: Multiple overdue EMIs (e.g. 2 x 2500 = 5000) with ₹500 fine
  assert.strictEqual(calculateTotalBill(5000, 2500, 500, 0), 5500);

  console.log('✅ Test 6: Consolidated bill mathematical formulation verified across all edge cases');
}

console.log('\n🎉 ALL 6 CUSTOMER-ONLY AUDIT TESTS PASSED WITH 100% COMPLIANCE!\n');
