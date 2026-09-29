'use client';

import { useCallback, useEffect, useState } from 'react';
import { Lock, Unlock, Smartphone, ChevronDown, ChevronUp, ShieldCheck, ShieldAlert, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

/**
 * Admin-only device control. Compact by default: a small device name, whether
 * the app is installed, the Locked / Not locked status, and Lock / Unlock
 * buttons. The buttons ALWAYS update the record's lock flag in the DB, and — when
 * the app is installed and permitted — additionally issue the real device
 * command. An "App info" toggle reveals the full device details + command
 * history. Hidden for retailers and on the customer portal.
 */

interface DeviceRow {
  id: string;
  management_status: string;
  admin_enabled: boolean;
  management_mode?: string | null;
  consent_granted_at?: string | null;
  registered_at?: string;
  last_seen_at?: string | null;
  device_model?: string | null;
  device_manufacturer?: string | null;
  android_version?: string | null;
}
interface CommandRow {
  id: string; command_type: 'LOCK' | 'UNLOCK'; status: string;
  emi_amount?: number | null; created_at: string; executed_at?: string | null; failure_reason?: string | null;
}

export default function DeviceManagementPanel({
  customerId,
  isAdmin,
  isLocked,
  deviceName,
  onToggled,
}: {
  customerId: string;
  isAdmin: boolean;
  isLocked: boolean;
  deviceName?: string | null;
  onToggled?: (v: boolean) => void;
}) {
  const [locked, setLocked] = useState(isLocked);
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState<DeviceRow | null>(null);
  const [commands, setCommands] = useState<CommandRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => { setLocked(isLocked); }, [isLocked]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/device/retailer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDevice(data.device ?? null);
        setCommands(Array.isArray(data.commands) ? data.commands : []);
      }
    } catch { /* ignore */ } finally {
      setLoaded(true);
    }
  }, [customerId]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  if (!isAdmin) return null;

  const installed = !!device;

  const toggle = async (lock: boolean) => {
    setBusy(true);
    try {
      const res = await fetch('/api/device/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId, command_type: lock ? 'LOCK' : 'UNLOCK' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setLocked(lock); onToggled?.(lock);
        toast.success(lock ? '🔒 Lock sent to phone' : '🔓 Unlock sent to phone');
        load();
        return;
      }
      if (res.status === 400) {
        const s = createClient();
        const { error } = await s.from('customers').update({ is_locked: lock }).eq('id', customerId);
        if (error) { toast.error(error.message); return; }
        setLocked(lock); onToggled?.(lock);
        toast.success(lock ? '🔒 Locked' : '🔓 Unlocked');
        return;
      }
      toast.error(data.error || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 overflow-hidden">
      {/* Compact header row */}
      <div className="px-3 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${locked ? 'bg-red-50' : 'bg-emerald-50'}`}>
            <Smartphone size={16} className={locked ? 'text-red-600' : 'text-emerald-600'} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800 truncate leading-tight">{deviceName || 'Device'}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="inline-flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${locked ? 'bg-red-500' : 'bg-emerald-500'}`} />
                <span className={`text-xs font-medium ${locked ? 'text-red-600' : 'text-emerald-600'}`}>{locked ? 'Locked' : 'Not locked'}</span>
              </span>
              <span className="text-slate-300">·</span>
              <span className={`text-xs font-medium ${installed ? 'text-slate-500' : 'text-amber-600'}`}>
                {loaded ? (installed ? 'App installed' : 'App not installed') : 'Checking…'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => toggle(true)}
            disabled={busy || locked}
            className="inline-flex items-center gap-1 rounded-md bg-red-600 hover:bg-red-700 text-white px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40 transition-colors"
          >
            <Lock size={13} /> Lock
          </button>
          <button
            onClick={() => toggle(false)}
            disabled={busy || !locked}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40 transition-colors"
          >
            <Unlock size={13} /> Unlock
          </button>
        </div>
      </div>

      {/* App info toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-1.5 border-t border-slate-200 flex items-center justify-between text-xs font-medium text-slate-500 hover:bg-slate-100/70 transition-colors"
      >
        <span>App info &amp; history</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="px-3 py-2.5 border-t border-slate-200 bg-white space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Details</span>
            <button onClick={load} className="text-slate-400 hover:text-slate-600" title="Refresh"><RefreshCw size={13} /></button>
          </div>
          {installed ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
              <div>Model: <b className="text-slate-800">{[device?.device_manufacturer, device?.device_model].filter(Boolean).join(' ') || deviceName || '—'}</b></div>
              <div>Android: <b className="text-slate-800">{device?.android_version || '—'}</b></div>
              <div className="flex items-center gap-1">
                {device?.admin_enabled
                  ? <><ShieldCheck size={13} className="text-emerald-600" />Permission: <b className="text-emerald-700">ON</b></>
                  : <><ShieldAlert size={13} className="text-amber-600" />Permission: <b className="text-amber-700">OFF</b></>}
              </div>
              <div>State: <b className="text-slate-800">{device?.management_status || '—'}</b></div>
              {device?.consent_granted_at && <div>Consent: <b className="text-slate-800">{new Date(device.consent_granted_at).toLocaleDateString('en-IN')}</b></div>}
              {device?.last_seen_at && <div>Seen: <b className="text-slate-800">{new Date(device.last_seen_at).toLocaleString('en-IN')}</b></div>}
            </div>
          ) : (
            <p className="text-xs text-slate-500">The TelePoint app has not registered on this customer&rsquo;s phone yet. Lock still updates the record; it will enforce on the phone once the app is installed and permission is granted.</p>
          )}

          {commands.length > 0 && (
            <div className="pt-1.5 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 mb-1">Command history</p>
              <ul className="space-y-0.5 max-h-40 overflow-auto">
                {commands.map((c) => (
                  <li key={c.id} className="text-xs text-slate-600 flex justify-between gap-2">
                    <span>{c.command_type} · <b>{c.status}</b>{c.failure_reason ? ` (${c.failure_reason})` : ''}</span>
                    <span className="text-slate-400">{new Date(c.created_at).toLocaleDateString('en-IN')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
