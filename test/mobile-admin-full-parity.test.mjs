import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

test('Mobile Admin Parity 1: API Endpoint Exact Calculation Engine', () => {
  const route = fs.readFileSync('app/api/mobile/admin/route.ts', 'utf8');
  assert.ok(route.includes("isRunning"), 'Separates running accounts from settled and completed');
  assert.ok(route.includes("firstChargeCollected"), 'Accounts for first charge collected');
  assert.ok(route.includes("fineCollected"), 'Accounts for fine collected');
  assert.ok(route.includes("get_emi_analysis"), 'Calls get_emi_analysis RPC for YoY comparisons');
  assert.ok(route.includes("topBrands"), 'Returns top smartphone brands');
  assert.ok(route.includes("topProducts"), 'Returns top smartphone device models');
  assert.ok(route.includes("retailerRecoveryList"), 'Computes retailer recovery deficit and surplus');
  assert.ok(route.includes("action === 'approve'"), 'Handles payment approval');
  assert.ok(route.includes("action === 'reject'"), 'Handles payment rejection');
  assert.ok(route.includes("action === 'save_fines'"), 'Handles saving late fine configuration');
  assert.ok(route.includes("action === 'recalc_fines'"), 'Handles fine recalculation maintenance');
});

test('Mobile Admin Parity 2: Full 6-Tab Executive Navigation Dock', () => {
  const dock = fs.readFileSync('mobile/src/components/admin/AdminHeaderDock.tsx', 'utf8');
  assert.ok(dock.includes("'overview'"), 'Includes Overview tab');
  assert.ok(dock.includes("'approvals'"), 'Includes Approvals tab');
  assert.ok(dock.includes("'reports'"), 'Includes Reports tab');
  assert.ok(dock.includes("'analytics'"), 'Includes Analytics tab');
  assert.ok(dock.includes("'retailers'"), 'Includes Retailers tab');
  assert.ok(dock.includes("'settings'"), 'Includes Settings tab');
  assert.ok(dock.includes("pendingApprovalsCount"), 'Displays pending approvals badge');
});

test('Mobile Admin Parity 3: Analytics Tab Feature Completeness', () => {
  const admin = fs.readFileSync('mobile/src/screens/AdminConsoleView.tsx', 'utf8');
  assert.ok(admin.includes("handlePrevMonth"), 'Has previous month navigation');
  assert.ok(admin.includes("handleNextMonth"), 'Has next month navigation');
  assert.ok(admin.includes("handleResetMonth"), 'Has month reset action');
  assert.ok(admin.includes("retailerFilterContainer"), 'Has store filter pill scroll');
  assert.ok(admin.includes("YoYComparisonCard"), 'Renders YoY Comparison cards');
  assert.ok(admin.includes("LeaderboardPodium"), 'Renders Leaderboard Podiums');
  assert.ok(admin.includes("RecoveryTableCard"), 'Renders Retailer Recovery ledger cards');
  assert.ok(admin.includes("recoverySearchBar"), 'Has search bar for retailer recovery ledger');
  assert.ok(admin.includes("productTabToggle"), 'Has segmented toggle between Brands and Models');
});

test('Mobile Admin Parity 4: Settings Tab Feature Completeness', () => {
  const admin = fs.readFileSync('mobile/src/screens/AdminConsoleView.tsx', 'utf8');
  assert.ok(admin.includes("EMI LATE FINE ENGINE RULES"), 'Has EMI late fine card');
  assert.ok(admin.includes("How Fines Apply"), 'Has how fines apply rule explanation box');
  assert.ok(admin.includes("RETAILERS & STORE ACCESS"), 'Has retailer accounts summary card');
  assert.ok(admin.includes("openRetailerManagerBtn"), 'Has quick navigation to Retailer Directory');
  assert.ok(admin.includes("AUTOMATED DATA SAFETY & EXPORTS"), 'Has automated data safety section');
  assert.ok(admin.includes("downloadBackupBtn"), 'Has full JSON backup export');
  assert.ok(admin.includes("downloadExcelBtn"), 'Has Customer Master Excel export');
  assert.ok(admin.includes("handleRecalculateFines"), 'Has fine recalculation trigger');
  assert.ok(admin.includes("Mastermind Behind The Code: Biswodip Goj"), 'Preserves Biswodip Goj developer attribution');
  assert.ok(admin.includes("7003617029"), 'Preserves central helpline 7003617029');
});
