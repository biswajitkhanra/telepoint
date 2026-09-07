import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Mobile components export neo-fintech 3D components', () => {
  assert.ok(fs.existsSync('mobile/src/components/TitaniumLoanCard.tsx'), 'TitaniumLoanCard must exist');
  assert.ok(fs.existsSync('mobile/src/components/EmiProgressRing.tsx'), 'EmiProgressRing must exist');
  assert.ok(fs.existsSync('mobile/src/components/QuickActionDock.tsx'), 'QuickActionDock must exist');
  assert.ok(fs.existsSync('mobile/src/components/ReceiptModal.tsx'), 'ReceiptModal must exist');
  assert.ok(fs.existsSync('mobile/src/components/Card3D.tsx'), 'Card3D must exist');
  assert.ok(fs.existsSync('mobile/src/components/EmiHeroCard.tsx'), 'EmiHeroCard must exist');
});
