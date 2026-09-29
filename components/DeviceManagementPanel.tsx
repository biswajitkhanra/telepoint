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
    <div className="rounded-xl border border-slate-200 p-3 bg-white flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <Smartphone size={18} className="text-slate-500 shrink-0" />
        <div className="min-w-0">
          <div className="font-semibold text-slate-800 truncate">{deviceName || 'Device'}</div>
          <div className={`text-xs font-bold ${locked ? 'text-red-600' : 'text-emerald-600'}`}>
            {locked ? 'Locked' : 'Not locked'}
          </div>
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => toggle(true)}
          disabled={busy || locked}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
        >
          <Lock size={15} /> Lock
        </button>
        <button
          onClick={() => toggle(false)}
          disabled={busy || !locked}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
        >
          <Unlock size={15} /> Unlock
        </button>
      </div>
    </div>
  );
}
