'use client';
export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';

/**
 * No-PC Device Owner enrolment via wireless debugging.
 *
 * The store does everything from ONE other phone/tablet browser:
 *   1. upload the customer APK once (no download link anywhere),
 *   2. on the fresh phone: Developer options → Wireless debugging → pairing code,
 *   3. run the command bundle below (Tango Web App in-browser, or LADB on the
 *      fresh phone itself) — pair, connect, install, set Device Owner, grant
 *      every permission. The app then self-grants all Device-Owner runtime
 *      permissions at first launch; only the consent-based Accessibility toggle
 *      is left for the store's real system toggle (AGENTS rule 4).
 */

const ADMIN_COMPONENT = 'com.telepoint.customer/com.telepoint.devicemanagement.TelepointDeviceAdminReceiver';

const PERMISSIONS = [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.READ_PHONE_STATE',
  'android.permission.READ_PHONE_NUMBERS',
  'android.permission.RECEIVE_SMS',
  'android.permission.SEND_SMS',
  'android.permission.POST_NOTIFICATIONS',
];

function commandsFor(apkName: string, pairAddr: string, pairCode: string, connectAddr: string): { label: string; cmd: string }[] {
  const cmds: { label: string; cmd: string }[] = [];
  if (pairAddr && pairCode) {
    cmds.push({ label: 'Pair (once)', cmd: `adb pair ${pairAddr} ${pairCode}` });
  }
  if (connectAddr) {
    cmds.push({ label: 'Connect', cmd: `adb connect ${connectAddr}` });
  }
  if (apkName) {
    cmds.push({ label: 'Install the app', cmd: `adb install -r /sdcard/Download/${apkName}` });
  }
  cmds.push({ label: 'Enrol as DEVICE OWNER (hard lock)', cmd: `adb shell dpm set-device-owner ${ADMIN_COMPONENT}` });
  cmds.push({ label: 'Grant every runtime permission', cmd: PERMISSIONS.map((p) => `adb shell pm grant com.telepoint.customer ${p}`).join('\n') });
  cmds.push({ label: 'Open the app (finalises + self-grants)', cmd: `adb shell monkey -p com.telepoint.customer 1` });
  return cmds;
}

export default function WirelessEnrollPage() {
  const [apkName, setApkName] = useState('telepoint-customer.apk');
  const [pairAddr, setPairAddr] = useState('');
  const [pairCode, setPairCode] = useState('');
  const [connectAddr, setConnectAddr] = useState('');

  const commands = useMemo(() => commandsFor(apkName, pairAddr, pairCode, connectAddr), [apkName, pairAddr, pairCode, connectAddr]);
  const bundle = commands.map((c) => c.cmd).join('\n');

  const copy = (text: string) => { navigator.clipboard?.writeText(text).catch(() => {}); };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Wireless debugging enrolment (no PC, no download link)</h1>
        <p className="text-sm text-slate-500 mt-1">
          Everything runs from any other phone/tablet browser. The APK is uploaded here once and pushed over Wi-Fi —
          the customer phone never visits a link, and the app grants all its own permissions after Device Owner is set.
        </p>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 space-y-2">
        <p className="font-semibold">How the pairing code is used today (honest note)</p>
        <p>
          Android&apos;s wireless-debugging handshake must come from an adb client. Use the free in-browser
          <b> Tango Web App</b> (<span className="font-mono">tangoapp.dev</span>, by the adb library authors) on this same
          device — pair with the code, then paste each command below — or use <b>LADB</b> on the fresh phone itself.
          A fully in-portal auto-pair (no third tool) is Phase 2: it needs Chrome&apos;s
          <span className="font-mono">unsafely-treat-insecure-origin-as-secure</span> flag for this portal origin plus one
          live device test on your fresh phone.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <label className="block">
          <span className="text-xs font-semibold text-slate-600">APK file name as saved on the fresh phone</span>
          <input value={apkName} onChange={(e) => setApkName(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Pairing IP:port (pairing screen)</span>
            <input value={pairAddr} onChange={(e) => setPairAddr(e.target.value)} placeholder="192.168.1.5:37429"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">6-digit pairing code</span>
            <input value={pairCode} onChange={(e) => setPairCode(e.target.value)} placeholder="123456"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono" />
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-semibold text-slate-600">Connect IP:port (main wireless-debugging screen)</span>
          <input value={connectAddr} onChange={(e) => setConnectAddr(e.target.value)} placeholder="192.168.1.5:43215"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono" />
        </label>
        <p className="text-[11px] text-slate-400">Fresh phone → Developer options → Wireless debugging → &quot;Pair device with pairing code&quot;. The phone must be factory-reset with NO Google account, per Android&apos;s Device Owner rules.</p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">Command bundle (tap each to copy)</h2>
          <button onClick={() => copy(bundle)} className="rounded-md bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-xs font-semibold">Copy all</button>
        </div>
        {commands.map((c) => (
          <div key={c.label} className="rounded-md border border-slate-200 bg-slate-50 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-600">{c.label}</span>
              <button onClick={() => copy(c.cmd)} className="text-xs font-semibold text-blue-600">Copy</button>
            </div>
            <pre className="mt-1 text-[11px] font-mono text-slate-800 whitespace-pre-wrap break-all">{c.cmd}</pre>
          </div>
        ))}
        <ol className="text-left text-xs text-slate-600 list-decimal ml-5 space-y-1">
          <li>After <b>Enrol as DEVICE OWNER</b>, the app opens and self-grants every Device-Owner runtime permission (SMS, location, phone, notifications).</li>
          <li>Log the customer in with their code, then confirm the <b>Accessibility</b> toggle in Settings (consent rule — the app never enables it silently) and finish the checklist → <b>Device Activated (hard lock only)</b>.</li>
        </ol>
      </div>
    </div>
  );
}
