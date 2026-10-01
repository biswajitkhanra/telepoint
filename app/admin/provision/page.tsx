'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';

/**
 * No-computer Device Owner provisioning (kiosk QR).
 *
 * ONE QR FOR EVERY CUSTOMER: the QR carries only the DPC component, the APK
 * download location (stable GitHub Release URL) and the signing-cert checksum —
 * customer identity is bound later, at app login (customer code). Generate it
 * once, print it for the store, and reuse it for every financed phone.
 *
 * Flow per phone: factory reset → at the first setup screen tap the same spot
 * 6 times → scan the QR → the phone downloads TelePoint and enrols it as
 * Device Owner. No ADB, no cable, no PC touches the phone.
 */

const ADMIN_COMPONENT = 'com.telepoint.customer/com.telepoint.devicemanagement.TelepointDeviceAdminReceiver';

const DEFAULT_APK_URL = process.env.NEXT_PUBLIC_PROVISIONING_APK_URL ?? '';
const DEFAULT_SIGNATURE = process.env.NEXT_PUBLIC_PROVISIONING_APK_SIGNATURE ?? '';
const GITHUB_REPO = process.env.NEXT_PUBLIC_GITHUB_REPO ?? 'biswajitkhanra/telepoint';

const LS_KEY = 'telepoint-provisioning-defaults-v1';

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

interface SavedDefaults {
  apkUrl: string;
  signature: string;
  wifiSsid: string;
  wifiPass: string;
  wifiSecurity: string;
}

function loadSaved(): SavedDefaults | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<SavedDefaults>;
    return {
      apkUrl: p.apkUrl ?? '',
      signature: p.signature ?? '',
      wifiSsid: p.wifiSsid ?? '',
      wifiPass: p.wifiPass ?? '',
      wifiSecurity: p.wifiSecurity ?? 'WPA',
    };
  } catch { return null; }
}

export default function ProvisionPage() {
  const saved = typeof window !== 'undefined' ? loadSaved() : null;
  const [apkUrl, setApkUrl] = useState(saved?.apkUrl ?? DEFAULT_APK_URL);
  const [sha256, setSha256] = useState(saved?.signature ?? DEFAULT_SIGNATURE);
  const [wifiSsid, setWifiSsid] = useState(saved?.wifiSsid ?? '');
  const [wifiPass, setWifiPass] = useState(saved?.wifiPass ?? '');
  const [wifiSecurity, setWifiSecurity] = useState(saved?.wifiSecurity ?? 'WPA');
  const [consentRecorded, setConsentRecorded] = useState(false);
  const [png, setPng] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jsonPreview, setJsonPreview] = useState<string | null>(null);
  const [fetchingRelease, setFetchingRelease] = useState(false);
  const [releaseTag, setReleaseTag] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ apkUrl, signature: sha256, wifiSsid, wifiPass, wifiSecurity }));
    } catch { /* private mode */ }
  }, [apkUrl, sha256, wifiSsid, wifiPass, wifiSecurity]);

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

  const fetchLatestRelease = async () => {
    setFetchingRelease(true);
    setError(null);
    try {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/${releaseTag.trim() ? `tags/${releaseTag.trim()}` : 'latest'}`);
      if (!res.ok) throw new Error(`GitHub release lookup failed (${res.status})`);
      const rel = await res.json() as { assets?: { name: string; browser_download_url: string }[] };
      const apk = (rel.assets ?? []).find((a) => a.name.endsWith('.apk'));
      if (!apk) throw new Error('No .apk asset found in that release');
      setApkUrl(apk.browser_download_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Release lookup failed');
    } finally {
      setFetchingRelease(false);
    }
  };

  const generate = async () => {
    setError(null);
    try {
      if (!apkUrl) throw new Error('Enter the public https:// link to the customer APK (GitHub Release URL).');
      hexToChecksum(sha256); // validates
      if (!provisioning) throw new Error('Check the APK URL and the signing SHA-256.');
      if (!consentRecorded) throw new Error('Tick the consent confirmation first — Device Owner enrolment requires the recorded financing agreement.');
      const json = JSON.stringify(provisioning);
      setJsonPreview(json);
      const data = await QRCode.toDataURL(json, { errorCorrectionLevel: 'M', margin: 2, width: 720 });
      setPng(data);
    } catch (e) {
      setPng(null);
      setError(e instanceof Error ? e.message : 'Could not generate QR');
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Device Owner provisioning QR (kiosk)</h1>
        <p className="text-sm text-slate-500 mt-1">
          <b>One QR for every customer.</b> It carries only the app + download link + signing checksum; the
          customer is bound at app login. Generate once, print for the store, reuse forever.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          <label className="block flex-1">
            <span className="text-xs font-semibold text-slate-600">Release tag (optional auto-fill)</span>
            <input value={releaseTag} onChange={(e) => setReleaseTag(e.target.value)} placeholder="telepoint-v1 (blank = latest)"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono" />
          </label>
          <button onClick={fetchLatestRelease} disabled={fetchingRelease}
            className="mt-5 rounded-md border border-blue-600 text-blue-600 px-3 py-2 text-sm font-semibold disabled:opacity-40">
            {fetchingRelease ? 'Fetching…' : 'Fetch APK URL from GitHub'}
          </button>
        </div>
        <label className="block">
          <span className="text-xs font-semibold text-slate-600">Customer APK URL (public https — GitHub Release URL)</span>
          <input value={apkUrl} onChange={(e) => setApkUrl(e.target.value)}
            placeholder="https://github.com/biswajitkhanra/telepoint/releases/download/<tag>/telepoint-customer.apk"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-600">Signing cert SHA-256 (one-time, from <code className="font-mono">eas credentials</code>)</span>
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
        <p className="text-[11px] text-slate-400">Wi-Fi lets the fresh phone download the APK during setup (recommended). Leave blank if the phone already has a network. Values are remembered on this device so the next visit is the same QR.</p>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={consentRecorded} onChange={(e) => setConsentRecorded(e.target.checked)} className="mt-1" />
          <span>The customer&apos;s financing agreement and Device Owner consent are recorded for this enrolment (AGENTS rule 4).</span>
        </label>
        <button onClick={generate} className="rounded-md bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-semibold">Generate QR</button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {png && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-center space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={png} alt="Provisioning QR" className="mx-auto w-64 h-64" />
          <a href={png} download="telepoint-provisioning-qr.png" className="inline-block text-sm font-semibold text-blue-600">Download PNG (print for the store)</a>
          <ol className="text-left text-xs text-slate-600 list-decimal ml-5 space-y-1">
            <li>Factory-reset the phone. At the first setup screen, <b>tap the same spot 6 times</b> to open the QR scanner.</li>
            <li>Scan this QR. The phone connects to Wi-Fi, downloads TelePoint, and enrols as Device Owner.</li>
            <li>Do <b>not</b> add any Google account before this — provisioning must happen on a clean device.</li>
            <li>After enrolment the app opens — log the customer in with their code and finish the permission checklist.</li>
          </ol>
          {jsonPreview && (
            <div className="text-left">
              <p className="text-xs font-semibold text-slate-600 mb-1">QR content (cross-check):</p>
              <pre className="text-[10px] bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">{jsonPreview}</pre>
              <button onClick={() => { navigator.clipboard?.writeText(jsonPreview).catch(() => {}); }}
                className="mt-1 text-xs font-semibold text-blue-600">Copy JSON</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
