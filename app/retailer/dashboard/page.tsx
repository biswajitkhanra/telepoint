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
import { SPRING, SPRING_BOUNCY, fadeUp, cardRise, staggerContainer } from '@/lib/motion';
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

// ── Each ranked sector gets its OWN vivid colour (gradient bar + dot). ────────
const SECTOR_COLORS = [
  { bar: 'from-violet-500 to-fuchsia-500', dot: 'bg-violet-500', text: 'text-violet-700' },
  { bar: 'from-sky-500 to-cyan-400', dot: 'bg-sky-500', text: 'text-sky-700' },
  { bar: 'from-emerald-500 to-teal-400', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  { bar: 'from-amber-500 to-orange-400', dot: 'bg-amber-500', text: 'text-amber-700' },
  { bar: 'from-rose-500 to-pink-500', dot: 'bg-rose-500', text: 'text-rose-700' },
  { bar: 'from-indigo-500 to-blue-500', dot: 'bg-indigo-500', text: 'text-indigo-700' },
  { bar: 'from-teal-500 to-emerald-400', dot: 'bg-teal-500', text: 'text-teal-700' },
  { bar: 'from-fuchsia-500 to-purple-500', dot: 'bg-fuchsia-500', text: 'text-fuchsia-700' },
];

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
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold flex items-center gap-2">
                <span className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-amber-500 bg-clip-text text-transparent">
                  Business Dashboard
                </span>
                <motion.span
                  animate={{ rotate: [0, 14, -8, 14, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 3 }}
                  className="inline-block origin-bottom"
                >📈</motion.span>
              </h1>
              <p className="text-ink-muted text-sm mt-0.5">Month till Date · {retailer?.name || 'My Shop'}</p>
            </div>
            <motion.button
              onClick={load} whileTap={{ scale: 0.9, rotate: -20 }}
              className="btn-ghost text-xs px-3 py-2 shrink-0" aria-label="Refresh"
            >
              {loading ? '…' : '↻ Refresh'}
            </motion.button>
          </div>
        </motion.div>

        {/* ── Month stepper — INDIGO sector ─────────────────────────────────── */}
        <motion.div
          className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-indigo-50 shadow-card flex items-center justify-between px-3 py-2.5 mb-5"
          variants={cardRise} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }}
        >
          <motion.button
            onClick={() => stepMonth(-1)} whileTap={{ scale: 0.85 }}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-indigo-600 bg-white shadow-sm hover:bg-indigo-100 transition-colors text-xl"
            aria-label="Previous month"
          >‹</motion.button>
          <div className="text-center">
            <p className="font-display text-lg font-bold text-indigo-900">{MONTHS_SHORT[month - 1]}&apos;{String(year).slice(-2)}</p>
            <p className="text-xs text-indigo-500 font-num">{prettyDate(from)} – {prettyDate(to)}</p>
          </div>
          <motion.button
            onClick={() => stepMonth(1)} whileTap={{ scale: 0.85 }}
            disabled={atCurrent}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-indigo-600 bg-white shadow-sm hover:bg-indigo-100 transition-colors text-xl disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Next month"
          >›</motion.button>
        </motion.div>

        {/* ── Total Disbursed Amount — GOLD hero sector ─────────────────────── */}
        <motion.div
          className="relative rounded-3xl overflow-hidden mb-6 shadow-card-hover"
          variants={cardRise} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }}
          whileHover={{ scale: 1.01 }}
        >
          {/* animated panning gradient backdrop */}
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(110deg,#f59e0b,#f43f5e,#d946ef,#f59e0b)] bg-[length:200%_100%]"
            animate={{ backgroundPosition: ['0% 50%', '200% 50%'] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
          />
          <div className="relative px-5 py-6 text-center sheen-track">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/85">💰 Total Disbursed Amount</p>
            <p className="num text-4xl sm:text-5xl font-extrabold text-white mt-1 drop-shadow-sm">
              <CountUp value={data?.totalDisbursed ?? 0} format={formatCurrency} duration={1} />
            </p>
            <p className="text-[11px] text-white/80 mt-1 font-num">{prettyDate(from)} – {prettyDate(to)}</p>
          </div>
        </motion.div>

        {/* ── KPI tiles — each its OWN colour (Logins removed) ──────────────── */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-7"
          variants={staggerContainer(0.1, 0.05)} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }}
        >
          <KpiTile
            grad="from-emerald-500 to-teal-500" glow="shadow-emerald-500/30"
            emoji="✓" label="Approved" value={data?.approvedCount ?? 0}
            sub={`${formatCurrency(data?.collectedAmount ?? 0)} collected`}
          />
          <KpiTile
            grad="from-sky-500 to-indigo-500" glow="shadow-indigo-500/30"
            emoji="📦" label="Disbursed" value={data?.disbursedCount ?? 0}
            sub="New loans in period"
          />
          <KpiTile
            grad="from-rose-500 to-orange-500" glow="shadow-rose-500/30"
            emoji="⚠" label="ABND" value={data?.abndCount ?? 0}
            sub="Marked NPA in period"
          />
        </motion.div>

        {/* ── Graphical Overview — VIOLET sector ───────────────────────────── */}
        <motion.div
          className="rounded-3xl overflow-hidden mb-7 border border-violet-200 bg-white shadow-card"
          variants={cardRise} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }}
        >
          <div className="bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-3.5 sheen-track">
            <p className="font-display text-lg font-bold text-white flex items-center gap-2">📊 Graphical Overview</p>
            <p className="text-xs text-white/80">Month till Date</p>
          </div>
          <div className="px-5 pt-3 flex gap-5 border-b border-violet-100">
            {([['category', 'Best Selling Phone'], ['brand', 'Top Performing Brands']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setOverviewTab(key)}
                className={`relative pb-2.5 text-sm font-semibold transition-colors ${overviewTab === key ? 'text-violet-700' : 'text-ink-muted hover:text-ink'}`}
              >
                {label}
                {overviewTab === key && (
                  <motion.span layoutId="overview-underline" className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" transition={SPRING} />
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

        {/* ── Collection summary — TEAL sector ─────────────────────────────── */}
        {retailer && (
          <motion.div
            className="mb-7"
            variants={cardRise} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }}
          >
            <div className="flex items-center gap-2 mb-2.5">
              <span className="w-1.5 h-5 rounded-full bg-gradient-to-b from-teal-400 to-emerald-500" />
              <p className="text-xs font-bold uppercase tracking-widest text-teal-700">Collection Summary</p>
            </div>
            <RetailerPaymentSummary
              retailerId={retailer.id}
              retailerName={retailer.name}
              baseFine={fine.default_fine_amount}
              weeklyIncrement={fine.weekly_fine_increment}
              hideLoanAmount
            />
          </motion.div>
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

// ── Vivid gradient KPI tile — filled colour, white text, hover glow ──────────
function KpiTile({ grad, glow, emoji, label, value, sub }: {
  grad: string; glow: string; emoji: string; label: string; value: number; sub?: string;
}) {
  return (
    <motion.div
      variants={cardRise}
      whileHover={{ y: -5, scale: 1.02 }}
      transition={SPRING}
      className={`relative rounded-2xl overflow-hidden bg-gradient-to-br ${grad} px-4 py-4 flex items-center gap-4 shadow-lg ${glow} sheen-track`}
    >
      <motion.div
        className="w-12 h-12 rounded-2xl bg-white/25 backdrop-blur-sm flex items-center justify-center text-2xl shrink-0 ring-1 ring-white/40"
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        {emoji}
      </motion.div>
      <div className="min-w-0">
        <p className="num text-3xl font-extrabold text-white leading-none drop-shadow-sm">
          <CountUp value={value} duration={0.9} />
        </p>
        <p className="text-sm font-bold text-white mt-1">{label}</p>
        {sub && <p className="text-[11px] text-white/85 truncate">{sub}</p>}
      </div>
    </motion.div>
  );
}

// ── Rainbow ranked bars — every sector a different colour ────────────────────
function BreakdownBars({ rows, metric }: { rows: BreakdownRow[]; metric: 'amount' | 'count' }) {
  const max = Math.max(1, ...rows.map(r => (metric === 'amount' ? r.amount : r.count)));
  return (
    <motion.div className="space-y-3.5" variants={staggerContainer(0.07, 0.04)} initial="hidden" animate="show">
      {rows.map((r, i) => {
        const v = metric === 'amount' ? r.amount : r.count;
        const pct = Math.max(5, (v / max) * 100);
        const c = SECTOR_COLORS[i % SECTOR_COLORS.length];
        return (
          <motion.div
            key={r.name}
            variants={{ hidden: { opacity: 0, x: -12 }, show: { opacity: 1, x: 0, transition: SPRING_BOUNCY } }}
            className="flex items-center gap-3"
          >
            <span className={`w-6 h-6 rounded-lg ${c.dot} text-white text-xs font-bold flex items-center justify-center shrink-0 shadow-sm`}>{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-sm font-semibold text-ink truncate">{r.name}</p>
                <p className={`num text-xs font-bold ${c.text} whitespace-nowrap`}>
                  {metric === 'amount' ? formatCurrency(r.amount) : `${r.count} device${r.count === 1 ? '' : 's'}`}
                  {metric === 'amount' && <span className="text-ink-muted font-normal"> · {r.count}</span>}
                </p>
              </div>
              <div className="h-2.5 rounded-full bg-surface-3 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full bg-gradient-to-r ${c.bar}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.08 * i }}
                />
              </div>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
