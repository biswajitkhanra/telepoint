'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

/**
 * Phone lock control.
 *
 * `variant` decides what renders:
 *  - 'full'   (default): status pill + toggle button + confirm modal — original behaviour.
 *  - 'badge'  : read-only status pill only (no toggle). Used inside the detail panel.
 *  - 'button' : toggle button + confirm modal only. Used in the top action bar so the
 *               control is reachable on mobile without scrolling into the detail card.
 *
 * Multiple instances stay in sync because the internal `locked` state tracks the
 * `isLocked` prop, and toggles notify the parent via `onToggled` to update the
 * shared customer record.
 */
export default function PhoneLockBadge({ customerId, isLocked, lockProvider, isAdmin, onToggled, variant = 'full' }: {
  customerId: string; isLocked: boolean; lockProvider?: string | null; isAdmin: boolean; onToggled?: (v: boolean) => void;
  variant?: 'full' | 'badge' | 'button';
}) {
  const [locked, setLocked] = useState(isLocked);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);

  // Keep in sync when the customer record changes (e.g. toggled from another instance).
  useEffect(() => { setLocked(isLocked); }, [isLocked]);

  async function toggle() {
    setLoading(true);
    const s = createClient();
    const nv = !locked;
    const { error } = await s.from('customers').update({ is_locked: nv }).eq('id', customerId);
    setLoading(false); setConfirm(false);
    if (error) toast.error(error.message);
    else { setLocked(nv); toast.success(nv ? '🔴 Locked' : '🟢 Unlocked'); onToggled?.(nv); }
  }

  const showBadge = variant === 'full' || variant === 'badge';
  const showButton = isAdmin && (variant === 'full' || variant === 'button');

  return (<>
    <div className="flex items-center gap-2">
      {showBadge && (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${locked ? 'bg-danger-light text-danger border-danger-border' : 'bg-success-light text-success border-success-border'}`}>
          <span className={`w-2 h-2 rounded-full ${locked ? 'bg-danger' : 'bg-success'}`} />
          {locked ? 'Locked' : 'Active'}
        </span>
      )}
      {showBadge && lockProvider && <span className="text-[10px] text-ink-muted bg-surface-2 px-2 py-0.5 rounded-full">{lockProvider}</span>}
      {showButton && <button onClick={() => setConfirm(true)} disabled={loading} className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${locked ? 'border-success-border text-success hover:bg-success-light' : 'border-danger-border text-danger hover:bg-danger-light'}`}>{locked ? '🔓 Unlock' : '🔒 Lock'}</button>}
    </div>
    {confirm && (
      <div className="modal-backdrop" onClick={() => setConfirm(false)}>
        <div className="card w-full max-w-sm p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
          <h3 className="font-display text-xl font-bold text-ink mb-4">{locked ? '🔓 Unlock?' : '🔒 Lock?'}</h3>
          <div className="flex gap-3">
            <button onClick={() => setConfirm(false)} className="btn-ghost flex-1">Cancel</button>
            <button onClick={toggle} disabled={loading} className={`flex-1 ${locked ? 'btn-success' : 'btn-danger'}`}>{loading ? '...' : 'Confirm'}</button>
          </div>
        </div>
      </div>
    )}
  </>);
}
