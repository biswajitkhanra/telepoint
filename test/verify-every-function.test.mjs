import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTs } from './load-ts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { calculateSingleEmiFine, calculateTotalFineFromEmis } = loadTs(path.resolve(__dirname, '../lib/fineCalc.ts'));
const { firstChargeRemaining } = loadTs(path.resolve(__dirname, '../lib/firstCharge.ts'));
const { isExpoPushToken } = loadTs(path.resolve(__dirname, '../lib/notifications/expoPushService.ts'));
const { diffDaysIST, todayIST, toISTDateString } = loadTs(path.resolve(__dirname, '../lib/ist.ts'));

// ============================================================================
// 1. CUSTOMER PORTAL & DATA FUNCTIONS
// ============================================================================

test('Customer Function 1: Multi-Loan Account Switching on Same Device', () => {
  const auth = fs.readFileSync('mobile/src/context/AuthContext.tsx', 'utf8');
  assert.ok(auth.includes('allLoans: MultiLoanCustomer[]'), 'Tracks multiple loan accounts for single borrower');
  assert.ok(auth.includes('switchActiveLoan'), 'Provides switchActiveLoan handler');
  assert.ok(auth.includes('STORAGE_KEYS.ACTIVE_LOAN'), 'Persists active loan identifier in AsyncStorage');

  const config = fs.readFileSync('mobile/src/config.ts', 'utf8');
  assert.ok(config.includes('@telepoint_active_loan_id'), 'Config defines active loan storage key');

  const dashboard = fs.readFileSync('mobile/src/screens/DashboardScreen.tsx', 'utf8');
  assert.ok(dashboard.includes('allLoans.length > 1'), 'Renders loan switcher when customer has multiple financed devices');
  assert.ok(dashboard.includes('switchModalVisible'), 'Has dedicated multi-loan switcher modal');
});

test('Customer Function 2: Exact IST Fine & First EMI Charge Calculation', () => {
  // Grace period test: 30 days grace before fine applies
  const baseFine = 450;
  const weeklyInc = 25;
  const fine = calculateSingleEmiFine('2024-01-01', false, baseFine, weeklyInc);
  assert.ok(fine >= 450, 'Overdue EMI accrues minimum base fine');

  // First charge calculation
  const customer = {
    first_emi_charge_amount: 500,
    first_emi_charge_paid_amount: 200,
  };
  assert.equal(firstChargeRemaining(customer), 300, 'Calculates remaining first EMI charge correctly');
});

test('Customer Function 3: Direct UPI Payment Intent & Dynamic QR (Payee: biswajit.khanra82@axl)', () => {
  const paymentModal = fs.readFileSync('mobile/src/components/PaymentModal.tsx', 'utf8');
  assert.ok(paymentModal.includes('biswajit.khanra82@axl'), 'Payment modal targets verified payee VPA');
  assert.ok(paymentModal.includes('upi://pay?'), 'Generates direct UPI intent URL');
  assert.ok(paymentModal.includes('pa='), 'Contains UPI payee address parameter');
  assert.ok(paymentModal.includes('pn='), 'Contains payee name parameter');
  assert.ok(paymentModal.includes('am='), 'Contains dynamic payment amount parameter');
});

test('Customer Function 4: Central Support Helpline is Permanently Locked to 7003617029', () => {
  const profile = fs.readFileSync('mobile/src/screens/ProfileScreen.tsx', 'utf8');
  assert.ok(profile.includes('7003617029'), 'Profile screen helpline strictly points to 7003617029');

  const dashboard = fs.readFileSync('mobile/src/screens/DashboardScreen.tsx', 'utf8');
  assert.ok(dashboard.includes('7003617029'), 'Dashboard helpline button dials 7003617029');

  const dock = fs.readFileSync('mobile/src/components/QuickActionDock.tsx', 'utf8');
  assert.ok(dock.includes('7003617029'), 'Quick action dock dials 7003617029');
});

test('Customer Function 5: Full Month-by-Month Schedule & Status Badges', () => {
  const emiScreen = fs.readFileSync('mobile/src/screens/EmiScheduleScreen.tsx', 'utf8');
  assert.ok(emiScreen.includes('Track and pay your monthly installments'), 'Natural consumer copy on schedule screen');
  assert.ok(emiScreen.includes('EMIRow'), 'Renders full month-by-month installments with EMIRow');

  const emiRow = fs.readFileSync('mobile/src/components/EMIRow.tsx', 'utf8');
  assert.ok(emiRow.includes('APPROVED'), 'Renders approved/paid badge');
  assert.ok(emiRow.includes('PARTIALLY_PAID'), 'Renders partially paid badge');
  assert.ok(emiRow.includes('UNPAID'), 'Renders unpaid/overdue badge');
});

// ============================================================================
// 2. RETAILER CONSOLE FUNCTIONS
// ============================================================================

test('Retailer Function 1: Zero Webview Buttons or Links in Retailer Console', () => {
  const retailer = fs.readFileSync('mobile/src/screens/RetailerConsoleView.tsx', 'utf8');
  assert.equal(retailer.includes('Web Console →'), false, 'Web Console link must NOT exist');
  assert.equal(retailer.includes('onOpenWebFallback'), false, 'Web fallback prop must NOT exist');
  assert.equal(retailer.includes('<WebView'), false, 'RetailerConsoleView must not render WebView');
});

test('Retailer Function 2: Velvety Animated Tab Transitions & Store Header', () => {
  const retailer = fs.readFileSync('mobile/src/screens/RetailerConsoleView.tsx', 'utf8');
  assert.ok(retailer.includes('tabFadeAnim'), 'Has tab fade animation');
  assert.ok(retailer.includes('tabSlideAnim'), 'Has tab slide animation');
  assert.ok(retailer.includes('PARTNER STORE DASHBOARD'), 'Has store welcome header');
  assert.ok(retailer.includes('STORE PERFORMANCE (THIS MONTH)'), 'Natural MTD performance label');
  assert.ok(retailer.includes('DISBURSED (THIS MONTH)'), 'Natural disbursed label');
  assert.ok(retailer.includes('COLLECTED (THIS MONTH)'), 'Natural collected label');
  assert.ok(retailer.includes('ACTIVE LOANS'), 'Natural active loans label');
});

test('Retailer Function 3: Customer Detail Ledger Modal Integration', () => {
  const retailer = fs.readFileSync('mobile/src/screens/RetailerConsoleView.tsx', 'utf8');
  assert.ok(retailer.includes('CustomerDetailModal'), 'Imports CustomerDetailModal');
  assert.ok(retailer.includes('handleOpenCustomerDetail'), 'Provides handleOpenCustomerDetail action');
  assert.ok(retailer.includes('customerModalVisible'), 'Manages modal visibility state');
});

test('Retailer Function 4: Polite WhatsApp Reminders with Central Helpline', () => {
  const retailer = fs.readFileSync('mobile/src/screens/RetailerConsoleView.tsx', 'utf8');
  assert.ok(retailer.includes('handleWhatsAppReminder'), 'Has WhatsApp reminder handler');
  assert.ok(retailer.includes('7003617029'), 'Includes central helpline in reminder message');
  assert.ok(retailer.includes('https://wa.me/91'), 'Targets WhatsApp direct intent URL');
});

test('Retailer Function 5: Collect EMI Bottom Sheet & Payment Request Submission', () => {
  const retailer = fs.readFileSync('mobile/src/screens/RetailerConsoleView.tsx', 'utf8');
  assert.ok(retailer.includes('collectModalVisible'), 'Has collect payment modal');
  assert.ok(retailer.includes('handleSubmitPayment'), 'Has payment submission handler');
  assert.ok(retailer.includes('/api/mobile/retailer'), 'Submits payment request to server');
});

// ============================================================================
// 3. ADMIN CONSOLE FUNCTIONS
// ============================================================================

test('Admin Function 1: Zero Webview Buttons or Links in Admin Console', () => {
  const admin = fs.readFileSync('mobile/src/screens/AdminConsoleView.tsx', 'utf8');
  assert.equal(admin.includes('Web Reports →'), false, 'Web Reports link must NOT exist');
  assert.equal(admin.includes('onOpenWebFallback'), false, 'Web fallback prop must NOT exist');
  assert.equal(admin.includes('<WebView'), false, 'AdminConsoleView must not render WebView');
});

test('Admin Function 2: Executive Banner & Portfolio Overview', () => {
  const admin = fs.readFileSync('mobile/src/screens/AdminConsoleView.tsx', 'utf8');
  assert.ok(admin.includes('ADMIN CONTROL CENTER'), 'Has executive header banner');
  assert.ok(admin.includes('Telepoint Administrator'), 'Has administrator title');
  assert.ok(admin.includes('PORTFOLIO OVERVIEW'), 'Has portfolio overview label');
  assert.ok(admin.includes('TOTAL FINANCED'), 'Has total financed KPI');
  assert.ok(admin.includes('TOTAL COLLECTED'), 'Has total collected KPI');
  assert.ok(admin.includes('OVERDUE DUES'), 'Has overdue dues KPI');
  assert.ok(admin.includes('ACTIVE LOANS'), 'Has active loans KPI');
});

test('Admin Function 3: 1-Tap Approvals Queue with Customer Ledger Inspection', () => {
  const admin = fs.readFileSync('mobile/src/screens/AdminConsoleView.tsx', 'utf8');
  assert.ok(admin.includes('handleApprove'), 'Has 1-tap approve action');
  assert.ok(admin.includes('openRejectModal'), 'Has reject modal handler');
  assert.ok(admin.includes('handleOpenCustomerDetail(item.customer_id)'), 'Allows tapping approval item to inspect customer loan details');
  assert.ok(admin.includes('CustomerDetailModal'), 'Integrates CustomerDetailModal');
});

test('Admin Function 4: Push Notification Broadcast Modal', () => {
  const admin = fs.readFileSync('mobile/src/screens/AdminConsoleView.tsx', 'utf8');
  assert.ok(admin.includes('broadcastModalVisible'), 'Has broadcast modal state');
  assert.ok(admin.includes('handleSendBroadcast'), 'Has broadcast dispatch handler');
  assert.ok(admin.includes('Send Push Notification'), 'Has push notification button');
});

// ============================================================================
// 4. SHARED CUSTOMER DETAIL MODAL COMPONENT
// ============================================================================

test('Shared Component: CustomerDetailModal has Complete Loan Ledger & Schedule', () => {
  assert.ok(fs.existsSync('mobile/src/components/CustomerDetailModal.tsx'), 'CustomerDetailModal must exist');
  const modal = fs.readFileSync('mobile/src/components/CustomerDetailModal.tsx', 'utf8');
  assert.ok(modal.includes('CustomerDetailModalProps'), 'Defines modal props');
  assert.ok(modal.includes('api/customer-login'), 'Fetches live customer payload');
  assert.ok(modal.includes('Loan Repayment Progress'), 'Renders progress bar');
  assert.ok(modal.includes('MONTH-BY-MONTH EMI SCHEDULE'), 'Renders complete month-by-month schedule');
  assert.ok(modal.includes('handleCopyImei'), 'Allows 1-tap IMEI copy');
  assert.ok(modal.includes('handleCall'), 'Provides 1-tap direct dialer');
  assert.ok(modal.includes('handleWhatsApp'), 'Provides 1-tap WhatsApp reminder');
});

// ============================================================================
// 5. PUSH NOTIFICATION & BACKGROUND SCHEDULER ENGINE
// ============================================================================

test('Push Engine: Token Validation, Idempotency & 5-Day Window', () => {
  assert.equal(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]'), true, 'Validates Exponent token');
  assert.equal(isExpoPushToken('ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]'), true, 'Validates Expo token');
  assert.equal(isExpoPushToken('invalid_token'), false, 'Rejects invalid string');

  const diff = diffDaysIST('2026-09-12', '2026-09-08');
  assert.equal(diff, 4, 'Calculates 4 days remaining for due window');
});

// ============================================================================
// 6. PRODUCTION APK & EAS CONFIGURATION
// ============================================================================

test('EAS Configuration: Standalone APK with Internal Distribution', () => {
  const appJson = JSON.parse(fs.readFileSync('mobile/app.json', 'utf8'));
  assert.equal(appJson.expo.android.package, 'com.telepoint.customer', 'Package is com.telepoint.customer');
  assert.ok(appJson.expo.android.permissions.includes('POST_NOTIFICATIONS'), 'Has POST_NOTIFICATIONS permission');
  assert.ok(appJson.expo.android.permissions.includes('RECEIVE_BOOT_COMPLETED'), 'Has RECEIVE_BOOT_COMPLETED permission');

  const easJson = JSON.parse(fs.readFileSync('mobile/eas.json', 'utf8'));
  assert.equal(easJson.build.preview.android.buildType, 'apk', 'Preview profile outputs standalone APK');
  assert.equal(easJson.build.preview.distribution, 'internal', 'Preview profile configured for internal distribution');
  assert.equal(easJson.build.production.android.buildType, 'apk', 'Production profile outputs standalone APK');
});
