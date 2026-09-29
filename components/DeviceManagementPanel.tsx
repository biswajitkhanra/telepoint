'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Lock, Unlock, Smartphone, ChevronDown, ChevronUp, ShieldCheck, ShieldAlert, RefreshCw, Bell, Volume2, VolumeX, Send } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

/**
 * Device control + reminder controls for one customer.
 *
 * HONESTY (Section 22/29): the Locked / Not-locked state shown here is the state
 * the DEVICE has CONFIRMED (devices.management_status), never merely "a command
 * was created". Sending a lock shows a "Lock requested…" pending state until the
 * phone acknowledges it (LOCK_PENDING → LOCKED). Lock/Unlock is admin-only; the
 * reminder controls + "Send EMI Reminder" are available to the owning retailer
 * too. When no app is registered we say so and never imply enforcement.
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
  id: string; command_type: 'LOCK' | 'UNLOCK' | 'EMI_REMINDER'; status: string;
  emi_amount?: number | null; voice?: boolean | null; language?: string | null;
  created_at: string; executed_at?: string | null; failure_reason?: string | null;
}
interface ReminderSettings {
  reminder_enabled: boolean;
  overdue_reminder_enabled: boolean;
  voice_enabled: boolean;
  voice_language: 'bn' | 'hi';
  voice_on_overdue: boolean;
  schedule_version: number;
}

type LockView = 'LOCKED' | 'NOT_LOCKED' | 'LOCK_PENDING' | 'UNLOCK_PENDING' | 'PERMISSION_OFF' | 'MANAGEMENT_LOST' | 'UNSUPPORTED' | 'OFFLINE';

function lockView(device: DeviceRow | null, fallbackLocked: boolean): { view: LockView; label: string; tone: 'red' | 'emerald' | 'amber' | 'slate' } {
  const s = device?.management_status;
  switch (s) {
    case 'LOCKED': return { view: 'LOCKED', label: 'Locked (confirmed)', tone: 'red' };
    case 'LOCK_PENDING': return { view: 'LOCK_PENDING', label: 'Lock requested — waiting for device…', tone: 'amber' };
    case 'UNLOCK_PENDING': return { view: 'UNLOCK_PENDING', label: 'Unlock requested — waiting for device…', tone: 'amber' };
    case 'ACTIVE': return { view: 'NOT_LOCKED', label: 'Not locked', tone: 'emerald' };
    case 'ADMIN_PERMISSION_MISSING': return { view: 'PERMISSION_OFF', label: 'Device-admin permission off', tone: 'amber' };
    case 'MANAGEMENT_LOST': return { view: 'MANAGEMENT_LOST', label: 'Management lost on device', tone: 'red' };
    case 'UNSUPPORTED': return { view: 'UNSUPPORTED', label: 'Not supported on this device', tone: 'slate' };
    case 'OFFLINE': return { view: 'OFFLINE', label: 'Device offline', tone: 'slate' };
    default:
      // No registered device: fall back to the cosmetic record flag, clearly labelled.
      return fallbackLocked
        ? { view: 'LOCKED', label: 'Marked locked (app not installed)', tone: 'amber' }
        : { view: 'NOT_LOCKED', label: 'Not locked', tone: 'emerald' };
  }
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
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState<DeviceRow | null>(null);
  const [commands, setCommands] = useState<CommandRow[]>([]);
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [savingCfg, setSavingCfg] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendVoice, setSendVoice] = useState(false);
  const [sendLang, setSendLang] = useState<'bn' | 'hi'>('bn');
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        if (data.reminder_settings) {
          setSettings(data.reminder_settings);
          setSendLang(data.reminder_settings.voice_language === 'hi' ? 'hi' : 'bn');
        }
      }
    } catch { /* ignore */ } finally {
      setLoaded(true);
    }
  }, [customerId]);

  useEffect(() => {
    load();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [load]);

  const installed = !!device;
  const lv = lockView(device, isLocked);
  const locked = lv.view === 'LOCKED';
  const pending = lv.view === 'LOCK_PENDING' || lv.view === 'UNLOCK_PENDING';

  // Poll a few times after a command so the confirmed (acknowledged) state
  // appears without a manual refresh.
  const pollForAck = useCallback(() => {
    let tries = 0;
    const tick = () => {
      tries += 1;
      load();
      if (tries < 6) pollRef.current = setTimeout(tick, 3000);
    };
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = setTimeout(tick, 2500);
  }, [load]);

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
        onToggled?.(lock);
        toast.success(lock ? '🔒 Lock sent — waiting for the phone to confirm' : '🔓 Unlock sent — waiting for the phone to confirm');
        await load();
        pollForAck();
        return;
      }
      if (res.status === 400) {
        // No registered device: only the cosmetic record flag can change. Say so.
        const s = createClient();
        const { error } = await s.from('customers').update({ is_locked: lock }).eq('id', customerId);
        if (error) { toast.error(error.message); return; }
        onToggled?.(lock);
        toast(lock ? 'Marked locked on the record (app not installed on the phone)' : 'Marked unlocked on the record', { icon: 'ℹ️' });
        await load();
        return;
      }
      toast.error(data.error || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const saveConfig = async (patch: Partial<ReminderSettings>) => {
    if (!settings) return;
    const prev = settings;
    setSettings({ ...settings, ...patch });
    setSavingCfg(true);
    try {
      const res = await fetch('/api/device/reminder-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId, ...patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.reminder_settings) {
        setSettings(data.reminder_settings);
      } else {
        setSettings(prev);
        toast.error(data.error || 'Could not save reminder settings');
      }
    } catch {
      setSettings(prev);
      toast.error('Network error');
    } finally {
      setSavingCfg(false);
    }
  };

  const sendReminder = async () => {
    setSending(true);
    try {
      const res = await fetch('/api/device/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId, command_type: 'EMI_REMINDER', voice: sendVoice, language: sendLang }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(sendVoice ? '🔔 Voice reminder sent to the phone' : '🔔 Reminder sent to the phone');
        load();
      } else {
        toast.error(data.error || 'Could not send reminder');
      }
    } finally {
      setSending(false);
    }
  };

  const toneClass: Record<string, { dot: string; text: string; bg: string }> = {
    red: { dot: 'bg-red-500', text: 'text-red-600', bg: 'bg-red-50' },
    emerald: { dot: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50' },
    amber: { dot: 'bg-amber-500', text: 'text-amber-600', bg: 'bg-amber-50' },
    slate: { dot: 'bg-slate-400', text: 'text-slate-500', bg: 'bg-slate-100' },
  };
  const tc = toneClass[lv.tone];

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 overflow-hidden">
      {/* Compact header row */}
      <div className="px-3 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tc.bg}`}>
            <Smartphone size={16} className={tc.text} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800 truncate leading-tight">{deviceName || 'Device'}</div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${tc.dot}`} />
                <span className={`text-xs font-medium ${tc.text}`}>{lv.label}</span>
              </span>
              <span className="text-slate-300">·</span>
              <span className={`text-xs font-medium ${installed ? 'text-slate-500' : 'text-amber-600'}`}>
                {loaded ? (installed ? 'App installed' : 'App not installed') : 'Checking…'}
              </span>
            </div>
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => toggle(true)}
              disabled={busy || locked || pending}
              className="inline-flex items-center gap-1 rounded-md bg-red-600 hover:bg-red-700 text-white px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40 transition-colors"
            >
              <Lock size={13} /> Lock
            </button>
            <button
              onClick={() => toggle(false)}
              disabled={busy || lv.view === 'NOT_LOCKED' || pending}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40 transition-colors"
            >
              <Unlock size={13} /> Unlock
            </button>
          </div>
        )}
      </div>

      {/* Reminder controls (admin + owning retailer) */}
      <div className="px-3 py-2.5 border-t border-slate-200 bg-white">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 inline-flex items-center gap-1.5"><Bell size={13} /> EMI Reminders</span>
          {savingCfg && <span className="text-[11px] text-slate-400">Saving…</span>}
        </div>

        {settings ? (
          <div className="space-y-2">
            <ToggleRow label="Automatic reminders" checked={settings.reminder_enabled} onChange={(v) => saveConfig({ reminder_enabled: v })} />
            <ToggleRow label="Overdue reminders (every 5 min)" checked={settings.overdue_reminder_enabled} onChange={(v) => saveConfig({ overdue_reminder_enabled: v })} disabled={!settings.reminder_enabled} />
            <ToggleRow label="Due-day voice" checked={settings.voice_enabled} onChange={(v) => saveConfig({ voice_enabled: v })} disabled={!settings.reminder_enabled} />
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Voice language</span>
              <div className="flex items-center gap-1">
                {(['bn', 'hi'] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => saveConfig({ voice_language: l })}
                    className={`px-2 py-1 rounded-md text-xs font-semibold border transition-colors ${settings.voice_language === l ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                  >
                    {l === 'bn' ? 'Bengali' : 'Hindi'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400">{loaded ? 'No reminder settings yet.' : 'Loading…'}</p>
        )}

        {/* Send EMI reminder now */}
        <div className="mt-3 pt-2.5 border-t border-slate-100">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSendVoice((v) => !v)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border transition-colors ${sendVoice ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-500 border-slate-200'}`}
            >
              {sendVoice ? <Volume2 size={13} /> : <VolumeX size={13} />} {sendVoice ? 'With voice' : 'No voice'}
            </button>
            <select
              value={sendLang}
              onChange={(e) => setSendLang(e.target.value === 'hi' ? 'hi' : 'bn')}
              className="px-2 py-1 rounded-md text-xs font-semibold border border-slate-200 bg-white text-slate-600"
            >
              <option value="bn">Bengali</option>
              <option value="hi">Hindi</option>
            </select>
            <button
              onClick={sendReminder}
              disabled={sending}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40 transition-colors ml-auto"
            >
              <Send size={13} /> {sending ? 'Sending…' : 'Send EMI Reminder'}
            </button>
          </div>
          {!installed && loaded && (
            <p className="text-[11px] text-amber-600 mt-1.5">The app is not installed yet — a reminder will only be shown once the phone has the TelePoint app.</p>
          )}
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
              <div>Mode: <b className="text-slate-800">{device?.management_mode || '—'}</b></div>
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
                    <span>{c.command_type}{c.command_type === 'EMI_REMINDER' && c.voice ? ' 🔊' : ''} · <b>{c.status}</b>{c.failure_reason ? ` (${c.failure_reason})` : ''}</span>
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

function ToggleRow({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${disabled ? 'opacity-50' : ''}`}>
      <span className="text-xs text-slate-600">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-300'} ${disabled ? 'cursor-not-allowed' : ''}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}
