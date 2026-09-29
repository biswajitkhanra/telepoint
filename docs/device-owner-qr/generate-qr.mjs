// TelePoint — Device Owner provisioning QR generator (no ADB).
//
// Produces the QR your store staff scan on a fresh/factory-reset phone (tap the
// first setup screen 6 times to open the scanner) to enrol the phone as Device
// Owner and install the TelePoint customer app — giving the full kiosk lock the
// customer cannot exit even with their PIN.
//
// Run from the repo ROOT (the `qrcode` package is installed there):
//
//   DOWNLOAD_URL="https://your-host/telepoint-customer.apk" \
//   SHA256_HEX="AA:BB:CC:...":  (the signing cert SHA-256 from `eas credentials`) \
//   node docs/device-owner-qr/generate-qr.mjs
//
// Instead of SHA256_HEX you may pass CHECKSUM=<base64url> directly.
// Optional Wi-Fi so the fresh phone can download the APK during setup:
//   WIFI_SSID="StoreWifi" WIFI_PASS="secret" WIFI_SECURITY="WPA"
//
// Output: docs/device-owner-qr/telepoint-provisioning-qr.png  (+ printed JSON).

import QRCode from 'qrcode';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ADMIN_COMPONENT = 'com.telepoint.customer/com.telepoint.devicemanagement.TelepointDeviceAdminReceiver';

const DOWNLOAD_URL = process.env.DOWNLOAD_URL;
const SHA256_HEX = process.env.SHA256_HEX;
const CHECKSUM_ENV = process.env.CHECKSUM;

if (!DOWNLOAD_URL) {
  console.error('ERROR: set DOWNLOAD_URL to the public https:// link of the customer .apk');
  process.exit(1);
}

/** URL-safe base64 (no padding) of the signing-cert SHA-256, as Android expects. */
function hexToChecksum(hex) {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  if (clean.length !== 64) {
    throw new Error(`SHA256_HEX must be 64 hex chars (32 bytes); got ${clean.length}`);
  }
  const bytes = Buffer.from(clean, 'hex');
  return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let checksum = CHECKSUM_ENV;
if (!checksum) {
  if (!SHA256_HEX) {
    console.error('ERROR: provide SHA256_HEX (from `eas credentials` → Android → SHA256 Fingerprint) or CHECKSUM (base64url).');
    process.exit(1);
  }
  checksum = hexToChecksum(SHA256_HEX);
}

const provisioning = {
  'android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME': ADMIN_COMPONENT,
  'android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM': checksum,
  'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION': DOWNLOAD_URL,
  'android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED': true,
  'android.app.extra.PROVISIONING_SKIP_ENCRYPTION': false,
};

if (process.env.WIFI_SSID) {
  provisioning['android.app.extra.PROVISIONING_WIFI_SSID'] = process.env.WIFI_SSID;
  provisioning['android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE'] = process.env.WIFI_SECURITY || 'WPA';
  if (process.env.WIFI_PASS) provisioning['android.app.extra.PROVISIONING_WIFI_PASSWORD'] = process.env.WIFI_PASS;
}

const payload = JSON.stringify(provisioning);
const outPng = path.join(__dirname, 'telepoint-provisioning-qr.png');

console.log('\nProvisioning JSON encoded in the QR:\n');
console.log(JSON.stringify(provisioning, null, 2));

await QRCode.toFile(outPng, payload, { errorCorrectionLevel: 'M', margin: 2, width: 720 });
console.log(`\n✅ QR written to: ${outPng}`);
console.log('\nScan it on a FRESH / factory-reset phone: at the first setup screen, tap the');
console.log('same spot 6 times to open the QR scanner, then scan this image.\n');

// Also print an ASCII preview to the terminal.
console.log(await QRCode.toString(payload, { type: 'terminal', small: true }));
