'use client';

import { useCallback, useEffect, useState } from 'react';
import { Lock, Unlock, ShieldCheck, ShieldAlert, RefreshCw, Smartphone } from 'lucide-react';

/**
 * Admin-only device-management panel, shown inside the customer's "lock device"
 * area. It AUTO-CHECKS the registered device's admin status on open. If the
 * customer app is not installed (no registered device) it shows an unavailable
 * state and offers no lock action — nothing is auto-triggered. Only an admin
 * can lock/unlock (the server also enforces this); retailers never see it.
 */

interface DeviceRow {
  id: string;
  management_status: string;
  admin_enabled: boolean;
  management_mode?: string | null;
  consent_granted_at?: string | null;
  registered_at: string;
  last_seen_at?: string | null;
  device_model?: string | null;
  device_manufacturer?: string | null;
  android_version?: string | null;
}
interface CommandRow {
  id: string; command_type: 'LOCK' | 'UNLOCK'; status: string;
  emi_amount?: number | null; created_at: string; executed_at?: string | null; failure_reason?: string | null;
}

function statusTone(s: string): string {
  if (s === 'LOCKED') return 'text-red-600';
  if (s === 'ACTIVE') return 'text-emerald-600';
  if (s.endsWith('PENDING')) return 'text-amber-600';
  return 'text-slate-500';
}

export default function DeviceManagementPanel({ customerId, isAdmin }: { customerId: string; isAdmin: boolean }) {
  const [loading, setLoading] = useState(true);
  const [device, setDevice] = useState<DeviceRow | null>(null);
  const [commands, setCommands] = useState<CommandRow[]>([]);
  const [emiDue, setEmiDue] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/device/retailer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Could not load device'); setDevice(null); return; }
      setDevice(data.device ?? null);
      setCommands(Array.isArray(data.commands) ? data.commands : []);
      const bd = data.breakdown as Record<string, unknown> | null;
      const v = bd?.total_payable ?? bd?.next_emi_amount;
      setEmiDue(typeof v === 'number' ? v : null);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  // Auto-trigger the device-admin check on open.
  useEffect(() => { load(); }, [load]);

  const sendCommand = async (command_type: 'LOCK' | 'UNLOCK') => {
    if (!isAdmin) return;
    setActing(true);
    setError(null);
    try {
      const res = await fetch('/api/device/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId, command_type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || 'Command failed');
      await load();
    } finally {
      setActing(false);
    }
  };

  if (!isAdmin) return null;

  if (loading) {
    return <div className="text-sm text-slate-500 py-3">Checking device…</div>;
  }

  // App not installed / no registered device -> do not auto-trigger anything.
  if (!device) {
    return (
      <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
        <div className="flex items-center gap-2 text-slate-600">
          <Smartphone size={18} />
          <span className="font-semibold">Customer app not installed</span>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          No registered device for this customer. Device management is unavailable until the
          customer installs the TelePoint app and it registers the device.
        </p>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>
    );
  }

  const locked = device.management_status === 'LOCKED';
  const pending = device.management_status.endsWith('PENDING');
  const isDeviceOwner = device.management_mode === 'DEVICE_OWNER';

  return (
    <div className="rounded-xl border border-slate-200 p-4 bg-white space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Smartphone size={18} className="text-slate-500" />
          <span className="font-semibold text-slate-800">
            {[device.device_manufacturer, device.device_model].filter(Boolean).join(' ') || 'Registered device'}
          </span>
        </div>
        <button onClick={load} className="text-slate-400 hover:text-slate-600" title="Refresh"><RefreshCw size={16} /></button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="flex items-center gap-1.5">
          {device.admin_enabled
            ? <><ShieldCheck size={16} className="text-emerald-600" /><span>Device Admin: <b className="text-emerald-700">ON</b></span></>
            : <><ShieldAlert size={16} className="text-amber-600" /><span>Device Admin: <b className="text-amber-700">OFF</b></span></>}
        </div>
        <div>Status: <b className={statusTone(device.management_status)}>{device.management_status}</b></div>
        {emiDue != null && <div>EMI Due: <b>₹{Math.round(emiDue).toLocaleString('en-IN')}</b></div>}
        {device.last_seen_at && <div className="text-slate-400">Seen: {new Date(device.last_seen_at).toLocaleString('en-IN')}</div>}
        <div className="col-span-2 flex items-center gap-1.5">
          {isDeviceOwner
            ? <><ShieldCheck size={16} className="text-emerald-600" /><span>Lock type: <b className="text-emerald-700">Hard lock (Device Owner)</b> — customer cannot unlock</span></>
            : <><ShieldAlert size={16} className="text-amber-600" /><span>Lock type: <b className="text-amber-700">Soft lock</b> — customer can unlock with their PIN</span></>}
        </div>
      </div>

      {!device.admin_enabled && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          The customer has not granted (or has manually removed) the Android device-admin
          permission. A lock will not take effect until it is granted on the device.
        </p>
      )}

      {device.admin_enabled && !isDeviceOwner && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          This device is a <b>soft lock</b> only: it will lock the screen and show the EMI
          screen, but the customer can unlock with their own PIN. For the permanent
          &ldquo;locked until EMI paid&rdquo; lock, the phone must be enrolled as
          <b> Device Owner</b> at the store on a fresh/reset device (see the setup guide).
        </p>
      )}

      {/* Both actions are always available; the server cancels any in-flight
          command so the newest admin click (lock or unlock) always applies. */}
      <div className="flex gap-2">
        <button
          onClick={() => sendCommand('LOCK')}
          disabled={acting || locked}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 text-white py-2.5 font-semibold disabled:opacity-50"
        >
          <Lock size={16} /> Lock Device
        </button>
        <button
          onClick={() => sendCommand('UNLOCK')}
          disabled={acting || device.management_status === 'ACTIVE'}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 text-white py-2.5 font-semibold disabled:opacity-50"
        >
          <Unlock size={16} /> Unlock Device
        </button>
      </div>

      {pending && <p className="text-xs text-amber-600">Requested — waiting for the device to confirm…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {commands.length > 0 && (
        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-500 mb-1">Command history</p>
          <ul className="space-y-1 max-h-40 overflow-auto">
            {commands.map((c) => (
              <li key={c.id} className="text-xs text-slate-600 flex justify-between gap-2">
                <span>{c.command_type} · <b className={statusTone(c.status === 'EXECUTED' && c.command_type === 'LOCK' ? 'LOCKED' : c.status)}>{c.status}</b></span>
                <span className="text-slate-400">{new Date(c.created_at).toLocaleDateString('en-IN')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
