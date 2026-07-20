'use client';

/**
 * Settings — organised, card-based configuration centre.
 *
 * Every control here is backed by a real mechanism that already exists:
 *   • Fine engine  → fine_settings table (same update as the old inline form);
 *   • Appearance   → light/dark/system theme, persisted per device;
 *   • Retailers    → live counts + hand-off to the retailer manager tab
 *                    (credentials & collection PINs are edited per retailer);
 *   • Data safety  → on-demand full backup + customer exports (live routes);
 *   • Maintenance  → fine recalculation endpoint.
 * Nothing is displayed that the backend can't actually do.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Settings2, AlertTriangle, Palette, Store, DatabaseBackup, Wrench,
  Info, Save, Download, RefreshCcw, ArrowRight, KeyRound, LifeBuoy,
  FileSpreadsheet, ShieldCheck,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Retailer } from '@/lib/types';
import { readJsonSafe } from '@/lib/formatters';
import { staggerContainer } from '@/lib/motion';
import { Panel, SectionHead, Chip } from '@/components/ui/primitives';
import ThemeToggle from '@/components/ThemeToggle';

export default function SettingsHub({
  supabase, retailers, onGoRetailers, onFineSettingsChanged,
}: {
  supabase: ReturnType<typeof createClient>;
  retailers: Retailer[];
  onGoRetailers: () => void;
  onFineSettingsChanged: () => void;
}) {
  const [fine, setFine] = useState({ default_fine_amount: 450, weekly_fine_increment: 25 });
  const [fineLoaded, setFineLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recalcing, setRecalcing] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('fine_settings').select('*').eq('id', 1).single();
      if (data) setFine({
        default_fine_amount: Number(data.default_fine_amount) || 0,
        weekly_fine_increment: Number(data.weekly_fine_increment) || 0,
      });
      setFineLoaded(true);
    })();
  }, [supabase]);

  async function saveFine() {
    const base = Number(fine.default_fine_amount);
    const wk = Number(fine.weekly_fine_increment);
    if (!Number.isFinite(base) || base < 0) { toast.error('Enter a valid base fine'); return; }
    if (!Number.isFinite(wk) || wk < 0) { toast.error('Enter a valid weekly increment'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('fine_settings').update({
        default_fine_amount: base, weekly_fine_increment: wk,
      }).eq('id', 1);
      if (error) toast.error(error.message);
      else { toast.success('Fine settings updated'); onFineSettingsChanged(); }
    } finally {
      setSaving(false);
    }
  }

  async function recalcFines() {
    setRecalcing(true);
    try {
      const res = await fetch('/api/fines/recalc', { method: 'POST' });
      const data = await readJsonSafe<{ error?: string; updated?: number }>(res) || {};
      if (!res.ok) { toast.error(data.error || 'Recalc failed'); return; }
      toast.success(`Fines updated (${data.updated ?? 0} EMIs)`);
    } catch {
      toast.error('Recalc failed');
    } finally {
      setRecalcing(false);
    }
  }

  const activeRetailers = retailers.filter(r => r.is_active).length;

  return (
    <motion.div className="space-y-6" variants={staggerContainer(0.06, 0.02)} initial="hidden" animate="show">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-500 dark:text-indigo-300">Settings</p>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold mt-1">
          <span className="bg-gradient-to-r from-indigo-600 via-sky-500 to-emerald-500 dark:from-indigo-300 dark:via-sky-300 dark:to-emerald-300 bg-clip-text text-transparent">
            Portal configuration
          </span>
        </h1>
        <p className="text-sm text-ink-muted mt-1">Business rules, appearance, access and data safety — organised in one place.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        {/* ── EMI & fine engine ── */}
        <Panel className="p-5 sm:p-6">
          <SectionHead
            icon={AlertTriangle} title="EMI fine engine"
            sub="Applied automatically to every overdue EMI across the whole portal"
            tint="text-white bg-gradient-to-br from-rose-500 to-pink-600 shadow-md shadow-rose-500/30"
          />
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="set-base-fine">Base late fine (₹)</label>
              <input
                id="set-base-fine" type="number" min={0} inputMode="numeric"
                value={fineLoaded ? fine.default_fine_amount : ''}
                onChange={e => setFine(f => ({ ...f, default_fine_amount: parseFloat(e.target.value) || 0 }))}
                className="input"
              />
              <p className="text-[11px] text-ink-muted mt-1.5">Charged once, the day after the EMI due date.</p>
            </div>
            <div>
              <label className="label" htmlFor="set-weekly-fine">Weekly increment after 30-day grace (₹)</label>
              <input
                id="set-weekly-fine" type="number" min={0} inputMode="numeric"
                value={fineLoaded ? fine.weekly_fine_increment : ''}
                onChange={e => setFine(f => ({ ...f, weekly_fine_increment: parseFloat(e.target.value) || 0 }))}
                className="input"
              />
              <p className="text-[11px] text-ink-muted mt-1.5">Added every 7 days once the 30-day grace ends.</p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-surface-4 bg-surface-2 p-4 text-[11px] leading-relaxed text-ink-muted">
            <p className="font-bold text-ink mb-1.5 flex items-center gap-1.5"><Info size={12} aria-hidden /> How fines apply</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>₹{fine.default_fine_amount} flat fine the day after the EMI due date.</li>
              <li>First 30 days: stays at ₹{fine.default_fine_amount}.</li>
              <li>After 30 days: +₹{fine.weekly_fine_increment} every 7 days until paid.</li>
              <li><b>Last EMI</b>, unpaid: ₹{fine.default_fine_amount} repeats every 30 days, no weekly step.</li>
              <li><b>Last EMI</b> paid but fine unpaid: switches back to the weekly ₹{fine.weekly_fine_increment} rule.</li>
            </ul>
          </div>
          <button onClick={saveFine} disabled={saving || !fineLoaded} className="btn-primary mt-4">
            <Save size={14} aria-hidden /> {saving ? 'Saving…' : 'Save fine settings'}
          </button>
        </Panel>

        <div className="space-y-4">
          {/* ── Appearance ── */}
          <Panel className="p-5 sm:p-6">
            <SectionHead
              icon={Palette} title="Appearance"
              sub="Theme preference is saved on this device and applied instantly"
              tint="text-white bg-gradient-to-br from-purple-500 to-fuchsia-600 shadow-md shadow-purple-500/30"
            />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <ThemeToggle />
              <p className="text-[11px] text-ink-muted">System follows your device's light/dark preference.</p>
            </div>
          </Panel>

          {/* ── Retailers & access ── */}
          <Panel className="p-5 sm:p-6">
            <SectionHead
              icon={Store} title="Retailers & access"
              sub="Shops, login credentials and collection PINs"
              tint="text-white bg-gradient-to-br from-sky-500 to-cyan-500 shadow-md shadow-sky-500/30"
            />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Chip className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                {activeRetailers} active
              </Chip>
              <Chip>{retailers.length - activeRetailers} inactive</Chip>
              <Chip>{retailers.length} total shops</Chip>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-muted flex items-start gap-1.5">
              <KeyRound size={12} className="mt-0.5 shrink-0" aria-hidden />
              Each retailer has a login password and a separate retail PIN required for every payment submission.
              Both are managed per retailer from the manager.
            </p>
            <button onClick={onGoRetailers} className="btn-secondary mt-4">
              Open retailer manager <ArrowRight size={13} aria-hidden />
            </button>
          </Panel>
        </div>

        {/* ── Backup & data ── */}
        <Panel className="p-5 sm:p-6">
          <SectionHead
            icon={DatabaseBackup} title="Backup & data"
            sub="Your data is backed up automatically every 12 hours"
            tint="text-white bg-gradient-to-br from-emerald-500 to-teal-500 shadow-md shadow-emerald-500/30"
          />
          <div className="mt-4 space-y-2.5">
            <a href="/api/admin/full-backup" className="flex items-center gap-3 rounded-2xl border border-surface-4 bg-surface-2 p-3.5 hover:border-emerald-300 dark:hover:border-emerald-500/50 transition-colors group">
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <LifeBuoy size={16} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-ink">Download full backup</span>
                <span className="block text-[11px] text-ink-muted">Every customer, retailer, EMI, payment, fine and audit record in one file.</span>
              </span>
              <Download size={14} className="text-ink-muted shrink-0" aria-hidden />
            </a>
            <a href="/api/export?type=all" download="all-customers.xlsx" className="flex items-center gap-3 rounded-2xl border border-surface-4 bg-surface-2 p-3.5 hover:border-emerald-300 dark:hover:border-emerald-500/50 transition-colors group">
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-md shadow-sky-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <FileSpreadsheet size={16} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-ink">All customers (Excel)</span>
                <span className="block text-[11px] text-ink-muted">One workbook with Running, Complete, Settled and NPA tabs.</span>
              </span>
              <Download size={14} className="text-ink-muted shrink-0" aria-hidden />
            </a>
          </div>
          <p className="mt-3 text-[11px] text-ink-muted flex items-center gap-1.5">
            <ShieldCheck size={12} aria-hidden /> Keep on-demand snapshots somewhere safe — they are complete portal copies.
          </p>
        </Panel>

        <div className="space-y-4">
          {/* ── Maintenance ── */}
          <Panel className="p-5 sm:p-6">
            <SectionHead
              icon={Wrench} title="Maintenance"
              sub="Housekeeping tools that act on live data"
              tint="text-white bg-gradient-to-br from-amber-500 to-orange-500 shadow-md shadow-amber-500/30"
            />
            <button
              onClick={recalcFines} disabled={recalcing}
              className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-surface-4 bg-surface-2 p-3.5 text-left hover:border-amber-300 dark:hover:border-amber-500/50 transition-colors group disabled:opacity-60 whitespace-normal"
            >
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <RefreshCcw size={16} className={recalcing ? 'animate-spin' : ''} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold text-ink">{recalcing ? 'Recalculating…' : 'Recalculate fines'}</span>
                <span className="block text-[11px] text-ink-muted">Re-runs the fine engine across every unpaid EMI using the rules above.</span>
              </span>
            </button>
          </Panel>

          {/* ── About ── */}
          <Panel className="p-5 sm:p-6">
            <SectionHead
              icon={Settings2} title="About"
              sub="TelePoint EMI Solution"
              tint="text-white bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md shadow-indigo-500/30"
            />
            <dl className="mt-4 space-y-2 text-[12px]">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Portal</dt>
                <dd className="font-semibold text-ink">TelePoint EMI Solution</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Roles</dt>
                <dd className="font-semibold text-ink">Super Admin · Retailer · Customer</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Automatic backups</dt>
                <dd className="font-semibold text-ink">Every 12 hours</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Timezone</dt>
                <dd className="font-semibold text-ink">IST (Asia/Kolkata)</dd>
              </div>
            </dl>
          </Panel>
        </div>
      </div>
    </motion.div>
  );
}
