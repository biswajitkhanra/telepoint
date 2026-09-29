'use client';

import { useEffect, useState } from 'react';
import { Lock, Unlock, Smartphone } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

/**
 * Minimal admin device control: a small device name, a Locked / Not locked
 * status under it, and Lock / Unlock buttons.
 *
 * The buttons ALWAYS update the record's lock flag in the DB (the original
 * behaviour), and — when the customer's app is installed and has the permission
 * — additionally issue the real device LOCK/UNLOCK command via
 * /api/device/command (which locks the phone through Android's
 * DevicePolicyManager and keeps `is_locked` in sync). If no device is
 * registered, the DB flag is still updated so the status is always accurate.
 */
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

  useEffect(() => { setLocked(isLocked); }, [isLocked]);

  if (!isAdmin) return null;

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
        return;
      }
      // 400 = no registered device (app not installed): still update the flag.
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
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${locked ? 'bg-red-50' : 'bg-emerald-50'}`}>
          <Smartphone size={16} className={locked ? 'text-red-600' : 'text-emerald-600'} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-800 truncate leading-tight">{deviceName || 'Device'}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${locked ? 'bg-red-500' : 'bg-emerald-500'}`} />
            <span className={`text-xs font-medium ${locked ? 'text-red-600' : 'text-emerald-600'}`}>
              {locked ? 'Locked' : 'Not locked'}
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
  );
}
