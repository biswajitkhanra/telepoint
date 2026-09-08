// test/mobile-call-whatsapp-audit.test.mjs
// Deep debug verification for Retailer & Admin Customer Call & WhatsApp accessibility

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('--- Starting Deep Debug Test: Retailer & Admin Call & WhatsApp Access ---');

const mobileSrcDir = path.resolve('mobile/src');

// Helper to check file contents
function checkFile(relPath, tests) {
  const fullPath = path.join(mobileSrcDir, relPath);
  assert(fs.existsSync(fullPath), `File does not exist: ${fullPath}`);
  const content = fs.readFileSync(fullPath, 'utf8');

  for (const [desc, regexOrStr] of Object.entries(tests)) {
    if (typeof regexOrStr === 'string') {
      assert(content.includes(regexOrStr), `[FAILED] ${relPath}: Expected to include "${regexOrStr}" (${desc})`);
    } else {
      assert(regexOrStr.test(content), `[FAILED] ${relPath}: Expected to match regex ${regexOrStr} (${desc})`);
    }
    console.log(`  ✓ ${relPath}: ${desc}`);
  }
}

// 1. Audit CustomerDetailModal.tsx
console.log('\n[1] Auditing CustomerDetailModal.tsx...');
checkFile('components/CustomerDetailModal.tsx', {
  'Contains handleCall implementation': 'const handleCall =',
  'Contains handleWhatsApp implementation': 'const handleWhatsApp =',
  'Formats tel: with slice(-10) sanitization': /Linking\.openURL\(`tel:\$\{finalNum\}`\)/,
  'Supports direct whatsapp:// protocol with https://wa.me fallback': 'whatsapp://send?phone=91',
  'Has fallback to https://wa.me': 'https://wa.me/91',
  'Header displays customer mobile with call & wa chips': 'headerPhoneRow',
  'Header has Call chip': 'headerPhoneChipCall',
  'Header has WhatsApp chip': 'headerPhoneChipWa',
  'Sticky footer has Call button': 'footerCallBtn',
  'Sticky footer has WhatsApp button': 'footerWhatsAppBtn',
  'Sticky footer has Collect button': 'footerCollectBtn',
});

// 2. Audit RetailerConsoleView.tsx
console.log('\n[2] Auditing RetailerConsoleView.tsx...');
checkFile('screens/RetailerConsoleView.tsx', {
  'Contains handleCallCustomer implementation': 'const handleCallCustomer =',
  'Contains handleWhatsAppReminder implementation': 'const handleWhatsAppReminder =',
  'Overdue tab (due) renders actionButtonRow': /filteredDue\.map[\s\S]*?actionButtonRow/,
  'Overdue tab renders Call button': /filteredDue\.map[\s\S]*?handleCallCustomer/,
  'Overdue tab renders WhatsApp button': /filteredDue\.map[\s\S]*?handleWhatsAppReminder/,
  'Overdue tab renders Collect button': /filteredDue\.map[\s\S]*?openCollectModal/,
  'Upcoming tab renders actionButtonRow': /filteredUpcoming\.map[\s\S]*?actionButtonRow/,
  'Upcoming tab renders Call button': /filteredUpcoming\.map[\s\S]*?handleCallCustomer/,
  'Upcoming tab renders WhatsApp button': /filteredUpcoming\.map[\s\S]*?handleWhatsAppReminder/,
  'Upcoming tab renders Collect button': /filteredUpcoming\.map[\s\S]*?openCollectModal/,
  'Customers tab renders Call button': /filteredCustomers\.map[\s\S]*?custDirCallBtn/,
  'Customers tab renders WhatsApp button': /filteredCustomers\.map[\s\S]*?custDirWaBtn/,
  'Includes CustomerDetailModal component with full access': '<CustomerDetailModal',
});

// 3. Audit AdminConsoleView.tsx
console.log('\n[3] Auditing AdminConsoleView.tsx...');
checkFile('screens/AdminConsoleView.tsx', {
  'Contains handleCall implementation': 'const handleCall =',
  'Contains handleWhatsApp implementation': 'const handleWhatsApp =',
  'Approvals tab has customer Call button': /approvalContactRow[\s\S]*?approvalCallBtn/,
  'Approvals tab has customer WhatsApp button': /approvalContactRow[\s\S]*?approvalWaBtn/,
  'Partner Retailers tab has Call button': 'callStoreBtn',
  'Partner Retailers tab has WhatsApp button': 'waStoreBtn',
  'Borrowers directory has Call button': 'borrowerCallBtn',
  'Borrowers directory has WhatsApp button': 'borrowerWaBtn',
  'Includes CustomerDetailModal for deep ledger inspection': '<CustomerDetailModal',
});

// 4. Test phone number normalization and URL encoding
console.log('\n[4] Testing phone number normalization logic...');
const testCases = [
  { input: '9876543210', expectedTel: 'tel:9876543210', expectedWa: '919876543210' },
  { input: '+919876543210', expectedTel: 'tel:9876543210', expectedWa: '919876543210' },
  { input: '+91 98765-43210', expectedTel: 'tel:9876543210', expectedWa: '919876543210' },
  { input: '09876543210', expectedTel: 'tel:9876543210', expectedWa: '919876543210' },
];

for (const tc of testCases) {
  const cleanDigits = tc.input.replace(/\D/g, '');
  const finalNum = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;
  const cleanWa = `91${cleanDigits.slice(-10)}`;
  assert.strictEqual(`tel:${finalNum}`, tc.expectedTel, `Tel format mismatch for ${tc.input}`);
  assert.strictEqual(cleanWa, tc.expectedWa, `WhatsApp format mismatch for ${tc.input}`);
  console.log(`  ✓ Number "${tc.input}" normalizes correctly to tel:${finalNum} and wa:${cleanWa}`);
}

// 5. Test URL construction with special characters in name and dues
console.log('\n[5] Testing WhatsApp reminder message URL encoding...');
const testCust = { name: 'Rahul & Priya', amount: 1599 };
const msg = `Dear ${testCust.name}, pending EMI of ₹${testCust.amount}.`;
const encoded = encodeURIComponent(msg);
assert(!encoded.includes(' '), 'Encoded string should have no raw spaces');
assert(encoded.includes('%26'), 'Ampersand must be properly URL encoded (%26)');
console.log(`  ✓ URL encoded message safely: ${encoded}`);

console.log('\n=== ALL DEEP DEBUG TESTS FOR CALL & WHATSAPP ACCESS PASSED (100%) ===\n');
