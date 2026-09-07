import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('1. Expo App Configuration (app.json) is valid for Android production APK', () => {
  const appJson = JSON.parse(fs.readFileSync('mobile/app.json', 'utf8'));
  const expo = appJson.expo;

  assert.equal(expo.name, 'Telepoint', 'App name must be Telepoint');
  assert.equal(expo.slug, 'telepoint', 'App slug must be telepoint');
  assert.equal(expo.android.package, 'com.telepoint.customer', 'Package name must match');
  assert.equal(expo.icon, './assets/icon.png', 'App icon path must be configured');
  assert.equal(expo.splash.image, './assets/splash.png', 'Splash image path must be configured');
  assert.equal(expo.android.adaptiveIcon.foregroundImage, './assets/adaptive-icon.png', 'Adaptive icon must be configured');
  assert.ok(expo.android.permissions.includes('NOTIFICATIONS'), 'Must have NOTIFICATIONS permission');
  assert.ok(expo.android.permissions.includes('RECEIVE_BOOT_COMPLETED'), 'Must have RECEIVE_BOOT_COMPLETED permission');
});

test('2. EAS Build Configuration (eas.json) is configured for standalone APKs without Google Play', () => {
  const easJson = JSON.parse(fs.readFileSync('mobile/eas.json', 'utf8'));
  
  assert.equal(easJson.build.preview.android.buildType, 'apk', 'Preview profile must build standalone APK');
  assert.equal(easJson.build.preview.distribution, 'internal', 'Preview must be internal distribution');
  assert.equal(easJson.build.production.android.buildType, 'apk', 'Production profile must build standalone APK');
});

test('3. Mobile launcher and splash assets are valid high-res PNG files', () => {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // \x89PNG

  const iconBuffer = fs.readFileSync('mobile/assets/icon.png');
  assert.ok(iconBuffer.subarray(0, 4).equals(pngHeader), 'icon.png must be valid PNG');
  assert.ok(iconBuffer.length > 5000, 'icon.png must be high resolution');

  const adaptiveBuffer = fs.readFileSync('mobile/assets/adaptive-icon.png');
  assert.ok(adaptiveBuffer.subarray(0, 4).equals(pngHeader), 'adaptive-icon.png must be valid PNG');
  assert.ok(adaptiveBuffer.length > 5000, 'adaptive-icon.png must be high resolution');

  const splashBuffer = fs.readFileSync('mobile/assets/splash.png');
  assert.ok(splashBuffer.subarray(0, 4).equals(pngHeader), 'splash.png must be valid PNG');
  assert.ok(splashBuffer.length > 5000, 'splash.png must be high resolution');

  const notifBuffer = fs.readFileSync('mobile/assets/notification-icon.png');
  assert.ok(notifBuffer.subarray(0, 4).equals(pngHeader), 'notification-icon.png must be valid PNG');
});

test('4. Neo-Fintech Design System Tokens & Brand Constants', () => {
  const config = fs.readFileSync('mobile/src/config.ts', 'utf8');

  assert.ok(config.includes('#080B11'), 'Must have Deep Obsidian Canvas');
  assert.ok(config.includes('#0E131F'), 'Must have Titanium Card Surface');
  assert.ok(config.includes('#10B981'), 'Must have Emerald Mint');
  assert.ok(config.includes('#3B82F6'), 'Must have Electric Sapphire');
  assert.ok(config.includes('SPRING_CONFIG'), 'Must have spring animation physics');
  assert.ok(config.includes('TELEPOINT_BRAND'), 'Must have Telepoint brand metadata');
});

test('5. Telepoint SVG Brand Logo matches web app specifications', () => {
  const logo = fs.readFileSync('mobile/src/components/TelepointLogo.tsx', 'utf8');

  assert.ok(logo.includes('#1b3e7d'), 'Must include Telepoint navy gradient stop');
  assert.ok(logo.includes('#0a1f44'), 'Must include Telepoint dark navy stop');
  assert.ok(logo.includes('#5cc6ff'), 'Must include orbit blue gradient stop');
  assert.ok(logo.includes('#2563eb'), 'Must include electric blue gradient stop');
  assert.ok(logo.includes('#8ad4ff'), 'Must include satellite beacon dot');
});

test('6. Persistent Session Lockdown in AuthContext', () => {
  const auth = fs.readFileSync('mobile/src/context/AuthContext.tsx', 'utf8');

  assert.ok(auth.includes('STORAGE_KEYS.SESSION'), 'Must write to persistent storage key');
  assert.ok(auth.includes('restoreSession'), 'Must restore saved session on app launch');
  assert.ok(auth.includes('retaining persistent session safely'), 'Must retain cached session on background refresh error');
});

test('7. 3D Tactile Components & Hardware-Accelerated Physics', () => {
  const card3d = fs.readFileSync('mobile/src/components/Card3D.tsx', 'utf8');
  assert.ok(card3d.includes('Animated.spring'), 'Must use spring physics');
  assert.ok(card3d.includes('useNativeDriver: true'), 'Must use native driver for 60/120fps');

  const titanium = fs.readFileSync('mobile/src/components/TitaniumLoanCard.tsx', 'utf8');
  assert.ok(titanium.includes('SECURE IMEI'), 'Must display secure IMEI');
  assert.ok(titanium.includes('LOAN ACCOUNT'), 'Must display loan account');
  assert.ok(titanium.includes('Clipboard.setStringAsync'), 'Must support copy to clipboard');

  const progressRing = fs.readFileSync('mobile/src/components/EmiProgressRing.tsx', 'utf8');
  assert.ok(progressRing.includes('strokeDashoffset'), 'Must calculate SVG circular offset');
  assert.ok(progressRing.includes('LOAN AMORTIZATION'), 'Must show loan amortization');

  const quickDock = fs.readFileSync('mobile/src/components/QuickActionDock.tsx', 'utf8');
  assert.ok(quickDock.includes('Pay UPI'), 'Must have Pay UPI action');
  assert.ok(quickDock.includes('Receipts'), 'Must have Receipts action');
  assert.ok(quickDock.includes('Call Store'), 'Must have Call Store action');

  const receiptModal = fs.readFileSync('mobile/src/components/ReceiptModal.tsx', 'utf8');
  assert.ok(receiptModal.includes('DIGITAL PAYMENT SLIP'), 'Must render payment slip');
  assert.ok(receiptModal.includes('Share.share'), 'Must allow native sharing');
});

test('8. Deep Linking and Routing in RootNavigator', () => {
  const nav = fs.readFileSync('mobile/src/navigation/RootNavigator.tsx', 'utf8');
  assert.ok(nav.includes('setupNotificationResponseListener'), 'Must listen to push notifications');
  assert.ok(nav.includes('emi_reminder'), 'Must handle EMI reminder deep link');
  assert.ok(nav.includes('broadcast'), 'Must handle broadcast deep link');
  assert.ok(nav.includes('MainTabs'), 'Must render MainTabs on login');
});
