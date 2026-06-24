'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import NavBar from '@/components/NavBar';
import BottomNav from '@/components/BottomNav';
import RetailerPaymentSummary from '@/components/RetailerPaymentSummary';
import CountUp from '@/components/motion/CountUp';
import { formatCurrency, todayIST } from '@/lib/formatters';
import { SPRING, fadeUp, cardRise, staggerContainer } from '@/lib/motion';
import type { RetailerDashboard, BreakdownRow } from '@/app/api/retailer/dashboard/route';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Inclusive IST month range — from the 1st to (today, if current month) or the month's last day. */
function monthRange(year: number, month1: number): { from: string; to: string; isCurrent: boolean } {
  const today = todayIST(); // YYYY-MM-DD (IST)
  const [ty, tm] = today.split('-').map(Number);
  const isCurrent = year === ty && month1 === tm;
  const from = `${year}-${pad(month1)}-01`;
  const lastDay = new Date(year, month1, 0).getDate();
  const to = isCurrent ? today : `${year}-${pad(month1)}-${pad(lastDay)}`;
  return { from, to, isCurrent };
}

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}/${m}/${y}`;
}

export default function RetailerDashboardPage() {
  // Browser-only Supabase client — never instantiate during SSR/prerender
  // (env vars are client-public and the build would otherwise throw).
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (typeof window !== 'undefined' && !supabaseRef.current) supabaseRef.current = createClient();
  const supabase = supabaseRef.current;
  const [retailer, setRetailer] = useState<{ id: string; name: string } | null>(null);
  const [fine, setFine] = useState({ default_fine_amount: 450, weekly_fine_increment: 25 });

  const today = todayIST();
  const [ty, tm] = today.split('-').map(Number);
  const [year, setYear] = useState(ty);
  const [month, setMonth] = useState(tm); // 1-indexed

  const [data, setData] = useState<RetailerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [overviewTab, setOverviewTab] = useState<'category' | 'brand'>('category');

  const { from, to } = useMemo(() => monthRange(year, month), [year, month]);

  // Don't let the user walk past the current month.
  const atCurrent = year === ty && month === tm;

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: r } = await supabase.from('retailers').select('id, name').eq('auth_user_id', user.id).single();
      if (r) setRetailer(r);
      const { data: fs } = await supabase.from('fine_settings').select('default_fine_amount, weekly_fine_increment').eq('id', 1).single();
      if (fs) setFine({
        default_fine_amount: Number(fs.default_fine_amount) || 450,
        weekly_fine_increment: Number(fs.weekly_fine_increment) || 25,
      });
    })();
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/retailer/dashboard?from=${from}&to=${to}`, { cache: 'no-store' });
      if (!res.ok) { setData(null); return; }
      setData(await res.json());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const stepMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    // Never go beyond the current month.
    if (y > ty || (y === ty && m > tm)) return;
    setMonth(m); setYear(y);
  };

  const overviewRows: BreakdownRow[] = overviewTab === 'category' ? (data?.categories ?? []) : (data?.brands ?? []);

  return (
    <div className="min-h-screen page-bg">
      <NavBar role="retailer" userName={retailer?.name || 'Retailer'} />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24">
        {/* Header */}
        <motion.div className="mb-6" variants={fadeUp} initial="hidden" animate="show">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink flex items-center gap-2">
                Business Dashboard
              </h1>
              <p className="text-ink-muted text-sm mt-0.5">Month till Date · {retailer?.name || 'My Shop'}</p>
            </div>
            <button onClick={load} className="btn-ghost text-xs px-3 py-2 shrink-0" aria-label="Refresh">
              {loading ? '…' : '↻ Refresh'}
            </button>
          </div>
        </motion.div>

        {/* Month stepper */}
        <motion.div
          className="card flex items-center justify-between px-4 py-3 mb-5"
          variants={cardRise} initial="hidden" animate="show"
        >
          <button
            onClick={() => stepMonth(-1)}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-brand-600 hover:bg-brand-50 transition-colors text-xl"
            aria-label="Previous month"
          >‹</button>
          <div className="text-center">
            <p className="font-display text-lg font-bold text-ink">{MONTHS_SHORT[month - 1]}&apos;{String(year).slice(-2)}</p>
            <p className="text-xs text-ink-muted font-num">{prettyDate(from)} – {prettyDate(to)}</p>
          </div>
          <button
            onClick={() => stepMonth(1)}
            disabled={atCurrent}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-brand-600 hover:bg-brand-50 transition-colors text-xl disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Next month"
          >›</button>
        </motion.div>

        {/* Total Disbursed Amount headline */}
        <motion.div
          className="card overflow-hidden mb-5 border-l-4 border-brand-500"
          variants={cardRise} initial="hidden" animate="show"
        >
          <div className="bg-gradient-to-r from-brand-600 via-amber-500 to-rose-500 px-5 py-4 text-center sheen-track">
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/85">Total Disbursed Amount</p>
            <p className="num text-3xl sm:text-4xl font-extrabold text-white mt-1">
              <CountUp value={data?.totalDisbursed ?? 0} format={formatCurrency} duration={0.9} />
            </p>
          </div>
        </motion.div>

        {/* Tiles — Logins intentionally removed; Approved / Disbursed / ABND kept */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6"
          variants={staggerContainer(0.08, 0.05)} initial="hidden" animate="show"
        >
          <MetricTile tint="emerald" emoji="✓" label="Approved" value={data?.approvedCount ?? 0} sub={`${formatCurrency(data?.collectedAmount ?? 0)} collected`} />
          <MetricTile tint="indigo" emoji="📦" label="Disbursed" value={data?.disbursedCount ?? 0} sub="New loans in period" />
          <MetricTile tint="rose" emoji="⚠" label="ABND" value={data?.abndCount ?? 0} sub="Marked NPA in period" />
        </motion.div>

        {/* Graphical Overview */}
        <motion.div className="card overflow-hidden mb-6" variants={cardRise} initial="hidden" animate="show">
          <div className="px-5 pt-4">
            <p className="font-display text-lg font-bold text-ink">Graphical Overview</p>
            <p className="text-xs text-ink-muted">(Month till Date)</p>
          </div>
          <div className="px-5 mt-3 flex gap-5 border-b border-surface-4">
            {([['category', 'Best Selling Category'], ['brand', 'Top Performing Brands']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setOverviewTab(key)}
                className={`relative pb-2.5 text-sm font-semibold transition-colors ${overviewTab === key ? 'text-brand-600' : 'text-ink-muted hover:text-ink'}`}
              >
                {label}
                {overviewTab === key && (
                  <motion.span layoutId="overview-underline" className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-brand-500" transition={SPRING} />
                )}
              </button>
            ))}
          </div>

          <div className="px-5 py-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={overviewTab}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {loading ? (
                  <div className="space-y-3 py-2">
                    {[0, 1, 2].map(i => <div key={i} className="skeleton h-7 w-full rounded-lg" />)}
                  </div>
                ) : overviewRows.length === 0 ? (
                  <p className="text-sm text-ink-muted py-8 text-center">No loans disbursed in this period yet.</p>
                ) : (
                  <BreakdownBars rows={overviewRows} metric={overviewTab === 'brand' ? 'amount' : 'count'} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Collection summary (the former home-page dashboard, now in its own tab) */}
        {retailer && (
          <div className="mb-6">
            <RetailerPaymentSummary
              retailerId={retailer.id}
              retailerName={retailer.name}
              baseFine={fine.default_fine_amount}
              weeklyIncrement={fine.weekly_fine_increment}
              hideLoanAmount
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Link href="/retailer/reports" className="btn-secondary text-sm">📑 Open Reports</Link>
          <Link href="/retailer" className="btn-ghost text-sm">← Back to Collection</Link>
        </div>
      </div>

      <BottomNav role="retailer" />
    </div>
  );
}

function MetricTile({ tint, emoji, label, value, sub }: {
  tint: 'emerald' | 'indigo' | 'rose'; emoji: string; label: string; value: number; sub?: string;
}) {
  const bg: Record<string, string> = { emerald: 'from-emerald-50 to-white', indigo: 'from-indigo-50 to-white', rose: 'from-rose-50 to-white' };
  const ring: Record<string, string> = { emerald: 'border-emerald-200', indigo: 'border-indigo-200', rose: 'border-rose-200' };
  const text: Record<string, string> = { emerald: 'text-emerald-700', indigo: 'text-indigo-700', rose: 'text-rose-700' };
  return (
    <motion.div
      variants={cardRise}
      whileHover={{ y: -3, transition: SPRING }}
      className={`rounded-2xl border ${ring[tint]} bg-gradient-to-br ${bg[tint]} px-4 py-4 flex items-center gap-4 shadow-card`}
    >
      <div className={`w-11 h-11 rounded-2xl bg-white flex items-center justify-center text-xl shadow-sm shrink-0`}>{emoji}</div>
      <div className="min-w-0">
        <p className={`num text-2xl font-extrabold ${text[tint]} leading-none`}>
          <CountUp value={value} duration={0.8} />
        </p>
        <p className="text-sm font-semibold text-ink mt-1">{label}</p>
        {sub && <p className="text-[11px] text-ink-muted truncate">{sub}</p>}
      </div>
    </motion.div>
  );
}

function BreakdownBars({ rows, metric }: { rows: BreakdownRow[]; metric: 'amount' | 'count' }) {
  const max = Math.max(1, ...rows.map(r => (metric === 'amount' ? r.amount : r.count)));
  return (
    <div className="space-y-3">
      {rows.map((r, i) => {
        const v = metric === 'amount' ? r.amount : r.count;
        const pct = Math.max(4, (v / max) * 100);
        return (
          <div key={r.name} className="flex items-center gap-3">
            <span className="w-5 text-center text-xs font-bold text-ink-muted shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-sm font-semibold text-ink truncate">{r.name}</p>
                <p className="num text-xs font-bold text-ink whitespace-nowrap">
                  {metric === 'amount' ? formatCurrency(r.amount) : `${r.count} device${r.count === 1 ? '' : 's'}`}
                  {metric === 'amount' && <span className="text-ink-muted font-normal"> · {r.count}</span>}
                </p>
              </div>
              <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${i === 0 ? 'bg-gradient-to-r from-brand-500 to-amber-400' : 'bg-brand-500/55'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.05 * i }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
