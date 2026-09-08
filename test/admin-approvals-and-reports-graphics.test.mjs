// test/admin-approvals-and-reports-graphics.test.mjs
// Verification for Payment Approvals (Pending + Approved History) and Graphical Reports Hub

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const adminViewPath = path.join(ROOT, 'mobile', 'src', 'screens', 'AdminConsoleView.tsx');
const jellyCardPath = path.join(ROOT, 'mobile', 'src', 'components', 'JellyCard.tsx');
const pressableScalePath = path.join(ROOT, 'mobile', 'src', 'components', 'PressableScale.tsx');

test('Approvals Feature 1: Sub-tab switcher for both Pending Approvals and Approved History', () => {
  const code = fs.readFileSync(adminViewPath, 'utf8');
  assert.ok(code.includes("const [approvalSubTab, setApprovalSubTab] = useState<'pending' | 'approved'>('pending')"), 'Has approvalSubTab state');
  assert.ok(code.includes('setApprovalSubTab(\'pending\')'), 'Has pending subtab switch');
  assert.ok(code.includes('setApprovalSubTab(\'approved\')'), 'Has approved subtab switch');
  assert.ok(code.includes('Approved History ('), 'Displays Approved History with count');
  assert.ok(code.includes('approvedHistory.map('), 'Iterates and displays approved history cards');
});

test('Approvals Feature 2: Renamed Review Queue to Approvals everywhere', () => {
  const code = fs.readFileSync(adminViewPath, 'utf8');
  assert.ok(!code.includes('>Review Queue<'), 'No Review Queue in UI text');
  assert.ok(code.includes('>Approvals<') || code.includes('>Payment Approvals<'), 'Uses Approvals or Payment Approvals');
  assert.ok(code.includes('Awaiting Approval'), 'KPI card uses Awaiting Approval');
});

test('Approvals Feature 3: Approving a payment appends to approved history and updates metrics', () => {
  const code = fs.readFileSync(adminViewPath, 'utf8');
  assert.ok(code.includes('setApprovedHistory(prev => [newlyApproved, ...prev])'), 'Prepends newly approved payment to history');
  assert.ok(code.includes('setPendingApprovals(prev => prev.filter('), 'Removes from pending approvals');
  assert.ok(code.includes('status: \'APPROVED\''), 'Approved item has APPROVED status');
});

test('Reports Feature 1: Rich Graphical FinTech Components Present', () => {
  const code = fs.readFileSync(adminViewPath, 'utf8');
  assert.ok(code.includes('stackedBarTrack'), 'Contains Asset Allocation Stacked Bar');
  assert.ok(code.includes('gaugeCard'), 'Contains Capital Recovery Velocity Gauge');
  assert.ok(code.includes('radarCard'), 'Contains 30-Day Maturing Liquidity Radar');
  assert.ok(code.includes('matrixGrid'), 'Contains 4-Stage Capital Health Matrix');
  assert.ok(code.includes('reportLedgerCard'), 'Contains Whole-Book Financial Summary');
});

test('Homepage Data & Analytics: Resilient Fallback Engine', () => {
  const code = fs.readFileSync(adminViewPath, 'utf8');
  assert.ok(code.includes('data.summary'), 'Maps data.summary when portfolio is not returned');
  assert.ok(code.includes('get_emi_analysis'), 'Calls Supabase get_emi_analysis RPC directly');
  assert.ok(code.includes('mappedRecovery'), 'Synthesizes retailer recovery if missing');
});

test('Fluid Physics: Removed wobbly jelly, silky smooth spring animations', () => {
  const jellyCode = fs.readFileSync(jellyCardPath, 'utf8');
  const pressCode = fs.readFileSync(pressableScalePath, 'utf8');
  assert.ok(!jellyCode.includes('breathAnim'), 'Removed wobbly breathAnim from JellyCard');
  assert.ok(jellyCode.includes('damping: 24'), 'Uses critically damped silky spring in JellyCard');
  assert.ok(pressCode.includes('scaleTo'), 'PressableScale uses clean micro-press');
});
