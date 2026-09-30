'use client';
export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import QRCode from 'qrcode';

/**
 * No-computer Device Owner provisioning. An admin opens this page (on any
 * phone/tablet browser), fills the APK URL + signing checksum (+ optional store
 * Wi-Fi), and it renders the Android provisioning QR. On a FRESH / factory-reset
 * phone, tap the first setup-wizard screen 6 times to open the QR scanner and
 * scan this — the phone downloads TelePoint and enrols it as Device Owner. No
 * ADB, no cable, no PC touches the phone.
 */

const ADMIN_COMPONENT = 'com.telepoint.customer/com.telepoint.devicemanagement.TelepointDeviceAdminReceiver';

/** URL-safe base64 (no padding) of a SHA-256 hex fingerprint, as Android expects. */
function hexToChecksum(hex: string): string {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  if (clean.length !== 64) throw new Error(`SHA-256 must be 64 hex chars (32 bytes); got ${clean.length}`);
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export default function ProvisionPage() {
  const [apkUrl, setApkUrl] = useState('');
  const [sha256, setSha256] = useState('');
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [wifiSecurity, setWifiSecurity] = useState('WPA');
  const [png, setPng] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const provisioning = useMemo(() => {
    if (!apkUrl || !sha256) return null;
    let checksum = '';
    try { checksum = hexToChecksum(sha256); } catch { return null; }
    const p: Record<string, unknown> = {
      'android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME': ADMIN_COMPONENT,
      'android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM': checksum,
      'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION': apkUrl,
      'android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED': true,
      'android.app.extra.PROVISIONING_SKIP_ENCRYPTION': false,
    };
    if (wifiSsid) {
      p['android.app.extra.PROVISIONING_WIFI_SSID'] = wifiSsid;
      p['android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE'] = wifiSecurity;
      if (wifiPass) p['android.app.extra.PROVISIONING_WIFI_PASSWORD'] = wifiPass;
    }
    return p;
  }, [apkUrl, sha256, wifiSsid, wifiPass, wifiSecurity]);

  const generate = async () => {
    setError(null);
    try {
      if (!apkUrl) throw new Error('Enter the public https:// link to the customer APK.');
      hexToChecksum(sha256); // validates
      if (!provisioning) throw new Error('Check the APK URL and SHA-256.');
      const data = await QRCode.toDataURL(JSON.stringify(provisioning), { errorCorrectionLevel: 'M', margin: 2, width: 720 });
      setPng(data);
    } catch (e) {
      setPng(null);
      setError(e instanceof Error ? e.message : 'Could not generate QR');
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Device Owner provisioning QR</h1>
        <p className="text-sm text-slate-500 mt-1">No computer needed on the phone. Generate the QR here, then scan it on a fresh / factory-reset phone.</p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <label className="block">
          <span className="text-xs font-semibold text-slate-600">Customer APK URL (public https)</span>
          <input value={apkUrl} onChange={(e) => setApkUrl(e.target.value)} placeholder="https://your-host/telepoint-customer.apk"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-600">Signing cert SHA-256 (from <code className="font-mono">eas credentials</code>)</span>
          <input value={sha256} onChange={(e) => setSha256(e.target.value)} placeholder="AA:BB:CC:… (64 hex chars)"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono" />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="block col-span-1">
            <span className="text-xs font-semibold text-slate-600">Store Wi-Fi SSID</span>
            <input value={wifiSsid} onChange={(e) => setWifiSsid(e.target.value)} placeholder="optional"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="block col-span-1">
            <span className="text-xs font-semibold text-slate-600">Wi-Fi password</span>
            <input value={wifiPass} onChange={(e) => setWifiPass(e.target.value)} placeholder="optional"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="block col-span-1">
            <span className="text-xs font-semibold text-slate-600">Wi-Fi security</span>
            <select value={wifiSecurity} onChange={(e) => setWifiSecurity(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option>WPA</option><option>WEP</option><option value="NONE">Open</option>
            </select>
          </label>
        </div>
        <p className="text-[11px] text-slate-400">Wi-Fi lets the fresh phone download the APK during setup (recommended). Leave blank if the phone already has a network.</p>
        <button onClick={generate} className="rounded-md bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-semibold">Generate QR</button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {png && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-center space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={png} alt="Provisioning QR" className="mx-auto w-64 h-64" />
          <a href={png} download="telepoint-provisioning-qr.png" className="inline-block text-sm font-semibold text-blue-600">Download PNG</a>
          <ol className="text-left text-xs text-slate-600 list-decimal ml-5 space-y-1">
            <li>Factory-reset the phone. At the first setup screen, <b>tap the same spot 6 times</b> to open the QR scanner.</li>
            <li>Scan this QR. The phone connects to Wi-Fi, downloads TelePoint, and enrols as Device Owner.</li>
            <li>Do <b>not</b> add any Google account before this — provisioning must happen on a clean device.</li>
          </ol>
        </div>
      )}
    </div>
  );
}
