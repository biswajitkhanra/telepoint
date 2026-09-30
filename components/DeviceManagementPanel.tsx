'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Lock, Unlock, Smartphone, ChevronDown, ChevronUp, ShieldCheck, ShieldAlert, RefreshCw,
  Bell, Volume2, VolumeX, Send, MessageSquare, Copy, Camera, Wifi, Bluetooth, Usb, Plane,
  MapPin, Power, EyeOff, Image as ImageIcon, PhoneOff, CreditCard, Sliders,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

/**
 * Individual-customer "Device & App Lock" (Action Details), Bajaj-style.
 *
 * COLLAPSED by default to a single button; expands to reveal every option
 * (Section 22). HONEST STATE (Section 22/29): Locked/Not-locked reflects what the
 * DEVICE has confirmed (management_status), never merely "a command was created".
 * Lock/Unlock + advanced controls are admin-only; reminders + Send-reminder are
 * available to the owning retailer too. Actions Android only allows under Device
 * Owner are shown but clearly marked "Requires Device Owner" — never faked.
 */

interface DeviceRow {
  id: string; management_status: string; admin_enabled: boolean; management_mode?: string | null;
  policies?: Record<string, boolean> | null;
  consent_granted_at?: string | null; registered_at?: string; last_seen_at?: string | null;
  device_model?: string | null; device_manufacturer?: string | null; android_version?: string | null;
}
interface CommandRow {
  id: string; command_type: 'LOCK' | 'UNLOCK' | 'EMI_REMINDER'; status: string;
  emi_amount?: number | null; voice?: boolean | null; language?: string | null;
  created_at: string; executed_at?: string | null; failure_reason?: string | null;
}
interface ReminderSettings {
  reminder_enabled: boolean; overdue_reminder_enabled: boolean; voice_enabled: boolean;
  voice_language: 'bn' | 'hi'; voice_on_overdue: boolean; schedule_version: number;
}
interface CustomerInfo { id: string; name?: string; code?: string | null; mobile?: string | null; model?: string | null; photo_url?: string | null; status?: string | null }

// Authorised SMS sender numbers (mirror of the app's SMS_ALLOWED_SENDERS default).
const SMS_SENDERS = ['7003617029', '7003617074'];

function lockView(device: DeviceRow | null, fallbackLocked: boolean): { label: string; tone: 'red' | 'emerald' | 'amber' | 'slate'; locked: boolean; pending: boolean } {
  switch (device?.management_status) {
    case 'LOCKED': return { label: 'Locked (confirmed)', tone: 'red', locked: true, pending: false };
    case 'LOCK_PENDING': return { label: 'Lock requested — waiting for device…', tone: 'amber', locked: false, pending: true };
    case 'UNLOCK_PENDING': return { label: 'Unlock requested — waiting for device…', tone: 'amber', locked: false, pending: true };
    case 'ACTIVE': return { label: 'Not locked', tone: 'emerald', locked: false, pending: false };
    case 'ADMIN_PERMISSION_MISSING': return { label: 'Device-admin permission off', tone: 'amber', locked: false, pending: false };
    case 'MANAGEMENT_LOST': return { label: 'Management lost on device', tone: 'red', locked: false, pending: false };
    case 'UNSUPPORTED': return { label: 'Not supported on this device', tone: 'slate', locked: false, pending: false };
    default:
      return fallbackLocked
        ? { label: 'Marked locked (app not installed)', tone: 'amber', locked: true, pending: false }
        : { label: 'Not locked', tone: 'emerald', locked: false, pending: false };
  }
}

export default function DeviceManagementPanel({
  customerId, isAdmin, isLocked, deviceName, onToggled,
}: {
  customerId: string; isAdmin: boolean; isLocked: boolean; deviceName?: string | null; onToggled?: (v: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState<DeviceRow | null>(null);
  const [commands, setCommands] = useState<CommandRow[]>([]);
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [openHistory, setOpenHistory] = useState(false);
  const [openAdvanced, setOpenAdvanced] = useState(false);
  const [savingCfg, setSavingCfg] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendVoice, setSendVoice] = useState(false);
  const [sendLang, setSendLang] = useState<'bn' | 'hi'>('bn');
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/device/retailer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDevice(data.device ?? null);
        setCommands(Array.isArray(data.commands) ? data.commands : []);
        setCustomer(data.customer ?? null);
        if (data.reminder_settings) { setSettings(data.reminder_settings); setSendLang(data.reminder_settings.voice_language === 'hi' ? 'hi' : 'bn'); }
      }
    } catch { /* ignore */ } finally { setLoaded(true); }
  }, [customerId]);

  // Load lazily on first expand (keeps the collapsed list light).
  useEffect(() => {
    if (expanded && !loaded) load();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [expanded, loaded, load]);

  const lv = lockView(device, isLocked);
  const installed = !!device;
  const smsCode = customer?.code || null;

  const pollForAck = useCallback(() => {
    let tries = 0;
    const tick = () => { tries += 1; load(); if (tries < 6) pollRef.current = setTimeout(tick, 3000); };
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = setTimeout(tick, 2500);
  }, [load]);

  const toggle = async (lock: boolean) => {
    setBusy(true);
    try {
      const res = await fetch('/api/device/command', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId, command_type: lock ? 'LOCK' : 'UNLOCK' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { onToggled?.(lock); toast.success(lock ? '🔒 Lock sent — waiting for the phone to confirm' : '🔓 Unlock sent — waiting for the phone to confirm'); await load(); pollForAck(); return; }
      if (res.status === 400) {
        const s = createClient();
        const { error } = await s.from('customers').update({ is_locked: lock }).eq('id', customerId);
        if (error) { toast.error(error.message); return; }
        onToggled?.(lock); toast('Marked on the record (app not installed on the phone)', { icon: 'ℹ️' }); await load(); return;
      }
      toast.error(data.error || 'Action failed');
    } finally { setBusy(false); }
  };

  const saveConfig = async (patch: Partial<ReminderSettings>) => {
    if (!settings) return;
    const prev = settings; setSettings({ ...settings, ...patch }); setSavingCfg(true);
    try {
      const res = await fetch('/api/device/reminder-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId, ...patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.reminder_settings) setSettings(data.reminder_settings);
      else { setSettings(prev); toast.error(data.error || 'Could not save'); }
    } catch { setSettings(prev); toast.error('Network error'); } finally { setSavingCfg(false); }
  };

  const sendReminder = async () => {
    setSending(true);
    try {
      const res = await fetch('/api/device/command', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId, command_type: 'EMI_REMINDER', voice: sendVoice, language: sendLang }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { toast.success(sendVoice ? '🔔 Voice reminder sent' : '🔔 Reminder sent'); load(); }
      else toast.error(data.error || 'Could not send reminder');
    } finally { setSending(false); }
  };

  const copy = (text: string, label: string) => {
    try { navigator.clipboard.writeText(text); toast.success(`${label} copied`); } catch { toast.error('Copy failed'); }
  };

  const tone: Record<string, { dot: string; text: string; bg: string }> = {
    red: { dot: 'bg-red-500', text: 'text-red-600', bg: 'bg-red-50' },
    emerald: { dot: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50' },
    amber: { dot: 'bg-amber-500', text: 'text-amber-600', bg: 'bg-amber-50' },
    slate: { dot: 'bg-slate-400', text: 'text-slate-500', bg: 'bg-slate-100' },
  };
  const tc = tone[lv.tone];

  const isOwner = device?.management_mode === 'DEVICE_OWNER';

  // Real Device-Owner toggles. `enabled=true` LOCKS/restricts the feature. State
  // comes from the device's reported policy snapshot (device.policies).
  const POLICY_TOGGLES: { key: string; action: string; icon: typeof Camera; label: string; adminOk?: boolean }[] = [
    { key: 'camera', action: 'CAMERA', icon: Camera, label: 'Camera Lock', adminOk: true },
    { key: 'bluetooth', action: 'BLUETOOTH', icon: Bluetooth, label: 'Bluetooth Lock' },
    { key: 'wifi', action: 'WIFI', icon: Wifi, label: 'Wi-Fi Config Lock' },
    { key: 'usb', action: 'USB', icon: Usb, label: 'USB File-Transfer Lock' },
    { key: 'airplane', action: 'AIRPLANE', icon: Plane, label: 'Airplane Mode Lock' },
    { key: 'outgoingCalls', action: 'OUTGOING_CALLS', icon: PhoneOff, label: 'Outgoing Call Lock' },
    { key: 'wallpaper', action: 'WALLPAPER', icon: ImageIcon, label: 'Wallpaper Change Lock' },
  ];

  const sendAction = async (action: string, enabled: boolean, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setActionBusy(action);
    try {
      const res = await fetch('/api/device/command', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId, command_type: 'DEVICE_ACTION', payload: { action, enabled } }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { toast.success('Sent to phone — applies on next sync'); pollForAck(); }
      else toast.error(data.error || 'Action failed');
    } finally { setActionBusy(null); }
  };

  // COLLAPSED: a single button (everything hidden until opened).
  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tc.bg}`}>
            <Lock size={16} className={tc.text} />
          </span>
          <span className="min-w-0 text-left">
            <span className="block text-sm font-semibold text-slate-800 leading-tight">Device &amp; App Lock</span>
            <span className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${tc.dot}`} />
              <span className={`text-xs font-medium ${tc.text}`}>{lv.label}</span>
            </span>
          </span>
        </span>
        {expanded ? <ChevronUp size={18} className="text-slate-400 shrink-0" /> : <ChevronDown size={18} className="text-slate-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-200">
          {/* Header: customer + device + app status */}
          <div className="px-3 py-2.5 bg-slate-50/70 flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-800 truncate">{customer?.name || 'Customer'}{smsCode ? ` · ${smsCode}` : ''}</div>
              <div className="text-xs text-slate-500 truncate">{[device?.device_manufacturer, device?.device_model].filter(Boolean).join(' ') || deviceName || 'Device'} · {loaded ? (installed ? 'App installed' : 'App not installed') : 'Checking…'}</div>
            </div>
            <button onClick={load} className="text-slate-400 hover:text-slate-600" title="Refresh"><RefreshCw size={14} /></button>
          </div>

          {/* Lock / Unlock (admin) */}
          {isAdmin && (
            <div className="px-3 py-2.5 border-t border-slate-100 flex items-center gap-2">
              <button onClick={() => toggle(true)} disabled={busy || lv.locked || lv.pending}
                className="flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-red-600 hover:bg-red-700 text-white px-2.5 py-2 text-xs font-semibold disabled:opacity-40">
                <Lock size={13} /> Lock
              </button>
              <button onClick={() => toggle(false)} disabled={busy || (lv.label === 'Not locked') || lv.pending}
                className="flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-2 text-xs font-semibold disabled:opacity-40">
                <Unlock size={13} /> Unlock
              </button>
            </div>
          )}

          {/* Reminders */}
          <div className="px-3 py-2.5 border-t border-slate-100">
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
                      <button key={l} onClick={() => saveConfig({ voice_language: l })}
                        className={`px-2 py-1 rounded-md text-xs font-semibold border ${settings.voice_language === l ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                        {l === 'bn' ? 'Bengali' : 'Hindi'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : <p className="text-xs text-slate-400">{loaded ? 'No reminder settings yet.' : 'Loading…'}</p>}

            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-2 flex-wrap">
              <button onClick={() => setSendVoice((v) => !v)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border ${sendVoice ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-500 border-slate-200'}`}>
                {sendVoice ? <Volume2 size={13} /> : <VolumeX size={13} />} {sendVoice ? 'With voice' : 'No voice'}
              </button>
              <select value={sendLang} onChange={(e) => setSendLang(e.target.value === 'hi' ? 'hi' : 'bn')} className="px-2 py-1 rounded-md text-xs font-semibold border border-slate-200 bg-white text-slate-600">
                <option value="bn">Bengali</option><option value="hi">Hindi</option>
              </select>
              <button onClick={sendReminder} disabled={sending} className="inline-flex items-center gap-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40 ml-auto">
                <Send size={13} /> {sending ? 'Sending…' : 'Send EMI Reminder'}
              </button>
            </div>
          </div>

          {/* Offline SMS commands */}
          <div className="px-3 py-2.5 border-t border-slate-100">
            <span className="text-xs font-semibold text-slate-500 inline-flex items-center gap-1.5 mb-2"><MessageSquare size={13} /> Offline lock by SMS</span>
            {smsCode ? (
              <div className="space-y-1.5">
                <p className="text-[11px] text-slate-500">From an authorised number ({SMS_SENDERS.join(' / ')}), text the phone:</p>
                {(['LOCK', 'UNLOCK'] as const).map((c) => (
                  <div key={c} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5">
                    <code className="text-xs font-mono text-slate-800">{c} {smsCode}</code>
                    <button onClick={() => copy(`${c} ${smsCode}`, `${c} SMS`)} className="text-slate-400 hover:text-slate-600"><Copy size={13} /></button>
                  </div>
                ))}
                <p className="text-[11px] text-amber-600">Works with no internet on the phone. The number allowlist is the gate — keep those numbers private.</p>
              </div>
            ) : <p className="text-xs text-slate-400">Customer code unavailable — SMS command can’t be shown.</p>}
          </div>

          {/* Advanced device actions (Bajaj-style) — real Device-Owner toggles */}
          {isAdmin && (
          <>
          <button onClick={() => setOpenAdvanced((o) => !o)} className="w-full px-3 py-1.5 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-slate-500 hover:bg-slate-50">
            <span className="inline-flex items-center gap-1.5"><Sliders size={13} /> Advanced device actions</span>
            {openAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {openAdvanced && (
            <div className="px-3 py-2 border-t border-slate-100 space-y-1.5">
              {!isOwner && <p className="text-[11px] text-amber-600 mb-1">These require the phone enrolled as <b>Device Owner</b>. Toggles stay disabled until then — never faked.</p>}
              {POLICY_TOGGLES.map((t) => {
                const on = !!device?.policies?.[t.key];
                const canToggle = !!(isOwner || (t.adminOk && device?.admin_enabled));
                return (
                  <div key={t.key} className="flex items-center justify-between py-0.5">
                    <span className="text-xs text-slate-600 inline-flex items-center gap-2"><t.icon size={14} className="text-slate-400" /> {t.label}</span>
                    {canToggle ? (
                      <button type="button" role="switch" aria-checked={on} disabled={actionBusy === t.action}
                        onClick={() => sendAction(t.action, !on)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-red-500' : 'bg-slate-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">Requires Device Owner</span>
                    )}
                  </div>
                );
              })}
              <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
                <span className="text-xs text-slate-600 inline-flex items-center gap-2"><Power size={14} className="text-slate-400" /> Reboot device</span>
                <button disabled={!isOwner || actionBusy === 'REBOOT'} onClick={() => sendAction('REBOOT', true, "Reboot this customer's phone now?")}
                  className="inline-flex items-center gap-1 rounded-md bg-slate-700 hover:bg-slate-800 text-white px-2 py-1 text-[11px] font-semibold disabled:opacity-40">
                  <Power size={12} /> Reboot
                </button>
              </div>
              <p className="text-[11px] text-slate-400 pt-1">A red toggle = feature locked. Factory-reset block, Safe-Mode block and FRP are applied automatically while the EMI is unpaid (Device Owner).</p>
            </div>
          )}
          </>
          )}

          {/* App info & history */}
          <button onClick={() => setOpenHistory((o) => !o)} className="w-full px-3 py-1.5 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-slate-500 hover:bg-slate-50">
            <span>App info &amp; history</span>
            {openHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {openHistory && (
            <div className="px-3 py-2.5 border-t border-slate-100 space-y-2">
              {installed ? (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
                  <div>Android: <b className="text-slate-800">{device?.android_version || '—'}</b></div>
                  <div className="flex items-center gap-1">{device?.admin_enabled ? <><ShieldCheck size={13} className="text-emerald-600" />Perm: <b className="text-emerald-700">ON</b></> : <><ShieldAlert size={13} className="text-amber-600" />Perm: <b className="text-amber-700">OFF</b></>}</div>
                  <div>Mode: <b className="text-slate-800">{device?.management_mode || '—'}</b></div>
                  <div>State: <b className="text-slate-800">{device?.management_status || '—'}</b></div>
                  {device?.last_seen_at && <div className="col-span-2">Seen: <b className="text-slate-800">{new Date(device.last_seen_at).toLocaleString('en-IN')}</b></div>}
                </div>
              ) : <p className="text-xs text-slate-500">The TelePoint app has not registered on this phone yet.</p>}
              {commands.length > 0 && (
                <ul className="space-y-0.5 max-h-40 overflow-auto pt-1.5 border-t border-slate-100">
                  {commands.map((c) => (
                    <li key={c.id} className="text-xs text-slate-600 flex justify-between gap-2">
                      <span>{c.command_type}{c.command_type === 'EMI_REMINDER' && c.voice ? ' 🔊' : ''} · <b>{c.status}</b>{c.failure_reason ? ` (${c.failure_reason})` : ''}</span>
                      <span className="text-slate-400">{new Date(c.created_at).toLocaleDateString('en-IN')}</span>
                    </li>
                  ))}
                </ul>
              )}
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
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-300'} ${disabled ? 'cursor-not-allowed' : ''}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}
