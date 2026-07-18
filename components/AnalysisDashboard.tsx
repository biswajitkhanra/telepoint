'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/formatters';
import CountUp from '@/components/motion/CountUp';
import { SPRING, SPRING_BOUNCY, cardRise, staggerContainer, fadeUp } from '@/lib/motion';
import type { BreakdownRow } from '@/app/api/admin/top-products/route';
import type { RetailerSummaryRow } from '@/app/api/admin/retailer-summary/route';

// Each ranked sector gets its OWN vivid colour (gradient bar + chip).
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

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Analysis — Year-over-Year EMI business intelligence dashboard.
 *
 * Compares the selected month against the SAME month one year earlier
 * (e.g. June 2026 vs June 2025) across loan disbursal, collection, customer
 * growth and bounce risk, and ranks ALL partner retailers by leads generated
 * (new customers added) and EMI collected.
 *
 * Dates: every figure is anchored to the data's OWN time/date — purchase date
 * for new loans, and each EMI's collection date (collection_requested_at,
 * falling back to paid_at, then due_date) for money received — never to the
 * portal upload / approval timestamp. This keeps history imported from the
 * Google sheet in its real month instead of bunching it into the upload day.
 *
 * Data path: tries the optimized `get_emi_analysis(p_month, p_year)` RPC
 * first (see migrations/023_analysis_collection_by_date.sql). If that function
 * is not deployed yet it falls back to client-side aggregation over the
 * customers / emi_schedule / retailers tables, so the dashboard works out of
 * the box.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface PeriodMetrics {
  loanGiven: number;    // Loan disbursed for plans started this month (disburse_amount, else value − down payment)
  collected: number;    // EMI + fines + charges actually collected this month (by collection date, not portal-approval date)
  customers: number;    // Unique customers who opted into a plan this month
  dueEmis: number;      // EMI installments scheduled to fall due this month (bounce denominator)
  bouncedEmis: number;  // Of those due, how many were NOT collected on schedule (default / bounce)
}

interface LeaderRow {
  retailerId: string;
  name: string;
  value: number;
}

interface AnalysisData {
  thisYear: PeriodMetrics;
  lastYear: PeriodMetrics;
  leadLeaderboard: LeaderRow[];
  collectionLeaderboard: LeaderRow[];
}

const EMPTY_PERIOD: PeriodMetrics = {
  loanGiven: 0, collected: 0, customers: 0, dueEmis: 0, bouncedEmis: 0,
};

type VolumeMetric = 'customers' | 'loanGiven' | 'collected' | 'bounceRate';

// ── helpers ────────────────────────────────────────────────────────────────

/** True when an ISO/date string falls in the given 1-indexed month + year. */
function inMonth(value: string | null | undefined, year: number, month: number): boolean {
  if (!value) return false;
  const d = new Date(value.length <= 10 ? value + 'T00:00:00' : value);
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === year && d.getMonth() + 1 === month;
}

/** Loan handed to the customer: prefer disburse_amount, else value − down payment. */
function loanOf(c: { disburse_amount?: number | null; purchase_value?: number | null; down_payment?: number | null }): number {
  const disbursed = Number(c.disburse_amount || 0);
  if (disbursed > 0) return disbursed;
  return Math.max(0, Number(c.purchase_value || 0) - Number(c.down_payment || 0));
}

type EmiRow = {
  customer_id?: string; due_date?: string; status?: string;
  amount?: number; partial_paid_amount?: number; fine_paid_amount?: number;
  paid_at?: string | null; collection_requested_at?: string | null;
};

/**
 * The date money for this EMI was actually collected — NOT the portal-approval
 * (upload) date. Anchors to when collection was first initiated, falling back
 * to the paid date, then the scheduled due date. This is what keeps imported
 * historical data in its real month instead of bunching it into the upload day.
 */
function collectionDateOf(e: EmiRow): string | undefined {
  return e.collection_requested_at || e.paid_at || e.due_date || undefined;
}

/** True when an EMI is treated as collected on schedule (never a bounce). */
function paidOnSchedule(e: EmiRow, customerStatus: string | undefined): boolean {
  return e.status === 'APPROVED' || customerStatus === 'COMPLETE';
}

/** Principal rupees collected on this EMI (full when paid/closed, else the partial). */
function emiPrincipalCollected(e: EmiRow, customerStatus: string | undefined): number {
  if (paidOnSchedule(e, customerStatus)) return Number(e.amount || 0);
  return Number(e.partial_paid_amount || 0);
}

function bounceRate(p: PeriodMetrics): number {
  return p.dueEmis > 0 ? (p.bouncedEmis / p.dueEmis) * 100 : 0;
}

// ── component ────────────────────────────────────────────────────────────────

export default function AnalysisDashboard({
  supabase,
}: {
  supabase: ReturnType<typeof createClient>;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-indexed
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [volumeMetric, setVolumeMetric] = useState<VolumeMetric>('customers');

  // Top Selling Brands / Products — month-till-date for the selected month,
  // across the WHOLE portfolio (every retailer), computed server-side.
  const [top, setTop] = useState<{ brands: BreakdownRow[]; products: BreakdownRow[] } | null>(null);
  const [topLoading, setTopLoading] = useState(true);
  const [topTab, setTopTab] = useState<'products' | 'brands'>('products');

  // Retailer-wise recovery summary — lifetime running book, not month-scoped.
  const [retSummary, setRetSummary] = useState<RetailerSummaryRow[] | null>(null);
  const [retSummaryLoading, setRetSummaryLoading] = useState(true);
  const [selectedRetailerId, setSelectedRetailerId] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRetSummaryLoading(true);
      try {
        const res = await fetch('/api/admin/retailer-summary', { cache: 'no-store' });
        if (!res.ok) { if (!cancelled) setRetSummary(null); return; }
        const d = await res.json();
        if (!cancelled) setRetSummary(d.rows ?? []);
      } catch {
        if (!cancelled) setRetSummary(null);
      } finally {
        if (!cancelled) setRetSummaryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 1) Preferred: optimized server-side RPC.
      const rpc = await supabase.rpc('get_emi_analysis', { p_month: month, p_year: year });
      if (!rpc.error && rpc.data && (rpc.data as AnalysisData).thisYear) {
        setData(rpc.data as AnalysisData);
        return;
      }

      // 2) Fallback: aggregate the raw tables in the browser.
      // Collection + bounce are derived from emi_schedule (anchored to each
      // EMI's OWN dates), never from payment_requests.approved_at — old data
      // imported from the Google sheet has no payment_requests, so an approval
      // (upload) date would bunch every historical rupee into the upload month.
      const [{ data: customers }, { data: emis }, { data: retailers }] =
        await Promise.all([
          supabase.from('customers').select('id, retailer_id, status, purchase_value, down_payment, disburse_amount, purchase_date, created_at, first_emi_charge_amount, first_emi_charge_paid_at'),
          supabase.from('emi_schedule').select('customer_id, due_date, status, amount, partial_paid_amount, fine_paid_amount, paid_at, collection_requested_at'),
          supabase.from('retailers').select('id, name'),
        ]);

      const retailerName = new Map<string, string>(
        (retailers || []).map((r: { id: string; name: string }) => [r.id, r.name]),
      );

      type CustomerRow = {
        id?: string; retailer_id?: string; status?: string;
        purchase_date?: string; created_at?: string;
        purchase_value?: number; down_payment?: number; disburse_amount?: number;
        first_emi_charge_amount?: number; first_emi_charge_paid_at?: string | null;
      };

      const customerRows = (customers || []) as CustomerRow[];
      const emiRows = (emis || []) as EmiRow[];

      // Count both active (RUNNING) and finished (COMPLETE) loans; exclude
      // SETTLED early-closures and NPA write-offs from the business figures.
      const COUNTED = new Set(['RUNNING', 'COMPLETE']);
      const statusOf = new Map<string, string>();
      const retailerOf = new Map<string, string>();
      const countedCustomerIds = new Set<string>();
      for (const c of customerRows) {
        if (!c.id) continue;
        statusOf.set(c.id, c.status || '');
        if (c.retailer_id) retailerOf.set(c.id, c.retailer_id);
        if (COUNTED.has(c.status || '')) countedCustomerIds.add(c.id);
      }

      const period = (y: number): PeriodMetrics => {
        const p: PeriodMetrics = { ...EMPTY_PERIOD };
        for (const c of customerRows) {
          if (COUNTED.has(c.status || '') && inMonth(c.purchase_date || c.created_at, y, month)) {
            p.loanGiven += loanOf(c);
            p.customers += 1;
          }
          // 1st-EMI charge counts as collection in the month it was paid.
          if (COUNTED.has(c.status || '') && c.first_emi_charge_paid_at && inMonth(c.first_emi_charge_paid_at, y, month)) {
            p.collected += Number(c.first_emi_charge_amount || 0);
          }
        }
        for (const e of emiRows) {
          if (!e.customer_id || !countedCustomerIds.has(e.customer_id)) continue;
          const st = statusOf.get(e.customer_id);
          // Collection — attributed to the month the money actually came in.
          const principal = emiPrincipalCollected(e, st);
          const fine = Number(e.fine_paid_amount || 0);
          if ((principal > 0 || fine > 0) && inMonth(collectionDateOf(e), y, month)) {
            p.collected += principal + fine;
          }
          // Bounce — installments due this month not collected on schedule.
          if (inMonth(e.due_date, y, month)) {
            p.dueEmis += 1;
            if (!paidOnSchedule(e, st)) p.bouncedEmis += 1;
          }
        }
        return p;
      };

      // Leaderboards reflect the selected month of the CURRENT year and list
      // EVERY participating retailer (not just the top few).
      // Lead board = new customers added this month.
      const leadMap = new Map<string, number>();
      for (const c of customerRows) {
        if (c.retailer_id && COUNTED.has(c.status || '') && inMonth(c.purchase_date || c.created_at, year, month)) {
          leadMap.set(c.retailer_id, (leadMap.get(c.retailer_id) || 0) + 1);
        }
      }
      // Collection board = rupees collected this month, by collection date.
      const collMap = new Map<string, number>();
      for (const e of emiRows) {
        if (!e.customer_id || !countedCustomerIds.has(e.customer_id)) continue;
        const rid = retailerOf.get(e.customer_id);
        if (!rid) continue;
        const st = statusOf.get(e.customer_id);
        const value = emiPrincipalCollected(e, st) + Number(e.fine_paid_amount || 0);
        if (value > 0 && inMonth(collectionDateOf(e), year, month)) {
          collMap.set(rid, (collMap.get(rid) || 0) + value);
        }
      }
      for (const c of customerRows) {
        if (c.retailer_id && COUNTED.has(c.status || '') && c.first_emi_charge_paid_at && inMonth(c.first_emi_charge_paid_at, year, month)) {
          collMap.set(c.retailer_id, (collMap.get(c.retailer_id) || 0) + Number(c.first_emi_charge_amount || 0));
        }
      }
      const toBoard = (m: Map<string, number>): LeaderRow[] =>
        [...m.entries()]
          .map(([retailerId, value]) => ({ retailerId, name: retailerName.get(retailerId) || 'Unknown shop', value }))
          .filter((r) => r.value > 0)
          .sort((a, b) => b.value - a.value);

      setData({
        thisYear: period(year),
        lastYear: period(year - 1),
        leadLeaderboard: toBoard(leadMap),
        collectionLeaderboard: toBoard(collMap),
      });
    } finally {
      setLoading(false);
    }
  }, [supabase, month, year]);

  useEffect(() => { load(); }, [load]);

  // Top Selling Brands / Products — month-till-date for the selected month.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setTopLoading(true);
      try {
        const from = `${year}-${pad2(month)}-01`;
        const nowY = now.getFullYear();
        const nowM = now.getMonth() + 1;
        const isCurrent = year === nowY && month === nowM;
        const lastDay = new Date(year, month, 0).getDate();
        const to = isCurrent
          ? `${nowY}-${pad2(nowM)}-${pad2(now.getDate())}`
          : `${year}-${pad2(month)}-${pad2(lastDay)}`;
        const res = await fetch(`/api/admin/top-products?from=${from}&to=${to}`, { cache: 'no-store' });
        if (!res.ok) { if (!cancelled) setTop(null); return; }
        const d = await res.json();
        if (!cancelled) setTop({ brands: d.brands ?? [], products: d.products ?? [] });
      } catch {
        if (!cancelled) setTop(null);
      } finally {
        if (!cancelled) setTopLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  const thisY = data?.thisYear ?? EMPTY_PERIOD;
  const lastY = data?.lastYear ?? EMPTY_PERIOD;

  const volumeChart = useMemo(() => {
    switch (volumeMetric) {
      case 'loanGiven':
        return { label: 'Loan Given', last: lastY.loanGiven, current: thisY.loanGiven, fmt: formatCurrency };
      case 'collected':
        return { label: 'Got (Collected)', last: lastY.collected, current: thisY.collected, fmt: formatCurrency };
      case 'bounceRate':
        return { label: 'Bounce / Default Rate', last: bounceRate(lastY), current: bounceRate(thisY), fmt: (v: number) => `${v.toFixed(1)}%` };
      case 'customers':
      default:
        return { label: 'New EMI Customers', last: lastY.customers, current: thisY.customers, fmt: (v: number) => String(Math.round(v)) };
    }
  }, [volumeMetric, thisY, lastY]);

  const lastLabel = `${MONTHS[month - 1].slice(0, 3)} ${year - 1}`;
  const thisLabel = `${MONTHS[month - 1].slice(0, 3)} ${year}`;

  return (
    <motion.div className="space-y-6" variants={fadeUp} initial="hidden" animate="show">
      {/* Header + period controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold flex items-center gap-2">
            <span className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-amber-500 bg-clip-text text-transparent">Analysis</span>
            <motion.span
              animate={{ rotate: [0, 14, -8, 14, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 3 }}
              className="inline-block origin-bottom"
            >📊</motion.span>
          </h1>
          <p className="text-ink-muted text-sm mt-1">
            Year-over-Year view — {MONTHS[month - 1]} {year} vs {MONTHS[month - 1]} {year - 1}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="form-input !py-2 !w-auto"
            aria-label="Month"
          >
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <div className="flex items-center rounded-xl border border-surface-4 bg-surface-2 overflow-hidden">
            <button onClick={() => setYear((y) => y - 1)} className="px-3 py-2 text-ink-muted hover:bg-surface-3" aria-label="Previous year">‹</button>
            <span className="px-3 py-2 text-sm font-semibold text-ink num">{year}</span>
            <button onClick={() => setYear((y) => Math.min(now.getFullYear(), y + 1))} className="px-3 py-2 text-ink-muted hover:bg-surface-3" aria-label="Next year">›</button>
          </div>
          <button onClick={load} className="btn-ghost text-xs px-3 py-2">
            {loading ? 'Loading…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      <SectionDivider grad="from-emerald-500 to-teal-500" text="Year-over-Year Snapshot" />

      {/* Aspect comparison cards */}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
        variants={staggerContainer(0.08, 0.05)}
        initial="hidden"
        animate="show"
      >
        <StatCard label="Loan Given" prev={lastY.loanGiven} cur={thisY.loanGiven} format={formatCurrency} theme="emerald" />
        <StatCard label="Got (Collected)" prev={lastY.collected} cur={thisY.collected} format={formatCurrency} theme="teal" />
        <StatCard label="New Customers" prev={lastY.customers} cur={thisY.customers} format={(v) => String(Math.round(v))} theme="blue" />
        <StatCard label="Bounce Rate" prev={bounceRate(lastY)} cur={bounceRate(thisY)} format={(v) => `${v.toFixed(1)}%`} theme="rose" invert />
      </motion.div>

      <SectionDivider grad="from-sky-500 to-violet-500" text="Trend Charts" />

      {/* YoY charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Financial: Loan Given vs Got — EMERALD sector */}
        <motion.div className="card p-6 border-t-4 border-emerald-400" variants={cardRise} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }}>
          <p className="section-header text-emerald-700">💰 Loan Given vs Got (Collected)</p>
          <GroupedBars
            groups={[
              { label: 'Loan Given', last: lastY.loanGiven, current: thisY.loanGiven },
              { label: 'Got', last: lastY.collected, current: thisY.collected },
            ]}
            fmt={formatCurrency}
            lastLabel={lastLabel}
            thisLabel={thisLabel}
          />
        </motion.div>

        {/* Volume / toggleable metric — SKY sector */}
        <motion.div className="card p-6 border-t-4 border-sky-400" variants={cardRise} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="section-header mb-0 text-sky-700">📈 {volumeChart.label}</p>
            <div className="flex flex-wrap gap-1">
              {([
                ['customers', 'Customers'],
                ['loanGiven', 'Loan Given'],
                ['collected', 'Collected'],
                ['bounceRate', 'Bounce %'],
              ] as [VolumeMetric, string][]).map(([key, label]) => (
                <motion.button
                  key={key}
                  onClick={() => setVolumeMetric(key)}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.9 }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    volumeMetric === key ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/30' : 'bg-surface-3 text-ink-muted hover:text-ink'
                  }`}
                >
                  {label}
                </motion.button>
              ))}
            </div>
          </div>
          <div className="mt-3">
            <GroupedBars
              groups={[{ label: volumeChart.label, last: volumeChart.last, current: volumeChart.current }]}
              fmt={volumeChart.fmt}
              lastLabel={lastLabel}
              thisLabel={thisLabel}
              single
            />
          </div>
        </motion.div>
      </div>

      <SectionDivider grad="from-amber-500 to-rose-500" text="Retailer Leaderboards" />

      {/* Retailer leaderboards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Leaderboard
          title="🏆 Lead Generation Leaderboard"
          subtitle={`Most customers onboarded — ${MONTHS[month - 1]} ${year}`}
          rows={data?.leadLeaderboard ?? []}
          format={(v) => `${Math.round(v)} customers`}
        />
        <Leaderboard
          title="💸 Collection Leaderboard"
          subtitle={`Highest EMI volume collected — ${MONTHS[month - 1]} ${year}`}
          rows={data?.collectionLeaderboard ?? []}
          format={formatCurrency}
        />
      </div>

      <SectionDivider grad="from-teal-500 to-emerald-500" text="Retailer-wise Summary" />

      {/* ── Retailer-wise recovery summary — running book, all time ────────── */}
      <RetailerRecoverySummary
        rows={retSummary ?? []}
        loading={retSummaryLoading}
        selectedId={selectedRetailerId}
        onSelect={setSelectedRetailerId}
      />

      <SectionDivider grad="from-violet-500 to-fuchsia-500" text="Top Selling — Month till Date" />

      {/* ── Top Selling Brands & Products — month-till-date, rainbow ───────── */}
      <motion.div
        className="rounded-3xl overflow-hidden border border-violet-200 bg-white shadow-card"
        variants={cardRise} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }}
      >
        <div className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-rose-500 px-5 py-4 sheen-track flex items-center justify-between">
          <div>
            <p className="font-display text-lg font-bold text-white flex items-center gap-2">🏅 Top Selling — Month till Date</p>
            <p className="text-xs text-white/85">{MONTHS[month - 1]} {year} · whole network</p>
          </div>
        </div>

        <div className="px-5 pt-3 flex gap-5 border-b border-violet-100">
          {([['products', '📱 Top Products'], ['brands', '🏷 Top Brands']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTopTab(key)}
              className={`relative pb-2.5 text-sm font-semibold transition-colors ${topTab === key ? 'text-violet-700' : 'text-ink-muted hover:text-ink'}`}
            >
              {label}
              {topTab === key && (
                <motion.span layoutId="top-underline" className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" transition={SPRING} />
              )}
            </button>
          ))}
        </div>

        <div className="px-5 py-4">
          {topLoading ? (
            <div className="space-y-3 py-2">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-7 w-full rounded-lg" />)}</div>
          ) : (
            <RainbowRanking
              rows={topTab === 'products' ? (top?.products ?? []) : (top?.brands ?? [])}
              metric={topTab === 'brands' ? 'amount' : 'count'}
            />
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Retailer-wise recovery summary ───────────────────────────────────────────
// Per retailer, over their RUNNING loans: loan given (invested) vs what has
// come back (EMI + fine + 1st-EMI charge collected) and the deficit still to
// recover. Pick an individual retailer for a detailed card, or "All Retailers"
// for the side-by-side table.
function RetailerRecoverySummary({
  rows, loading, selectedId, onSelect,
}: {
  rows: RetailerSummaryRow[];
  loading: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const selected = rows.find(r => r.retailerId === selectedId) || null;
  const totals = rows.reduce(
    (t, r) => ({
      runningCount: t.runningCount + r.runningCount,
      npaCount: t.npaCount + r.npaCount,
      settledCount: t.settledCount + r.settledCount,
      loanGiven: t.loanGiven + r.loanGiven,
      emiCollected: t.emiCollected + r.emiCollected,
      fineCollected: t.fineCollected + r.fineCollected,
      firstChargeCollected: t.firstChargeCollected + r.firstChargeCollected,
      totalCollected: t.totalCollected + r.totalCollected,
      deficit: t.deficit + r.deficit,
    }),
    { runningCount: 0, npaCount: 0, settledCount: 0, loanGiven: 0, emiCollected: 0, fineCollected: 0, firstChargeCollected: 0, totalCollected: 0, deficit: 0 },
  );
  const recoveryPct = (loan: number, collected: number) =>
    loan > 0 ? Math.min(100, Math.round((collected / loan) * 100)) : 0;
  const accountsOf = (r: { runningCount: number; npaCount: number; settledCount: number }) =>
    r.runningCount + r.npaCount + r.settledCount;
  // Positive = still to recover (deficit); negative = already recovered extra.
  const DeficitCell = ({ value }: { value: number }) =>
    value > 0
      ? <span className="text-red-600">{formatCurrency(value)}</span>
      : <span className="text-emerald-600">+{formatCurrency(Math.abs(value))} surplus</span>;

  return (
    <motion.div
      className="card p-6 border-t-4 border-teal-400"
      variants={cardRise} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <p className="section-header mb-0 text-teal-700">🏪 Retailer-wise Recovery Summary</p>
          <p className="text-[11px] text-ink-muted mt-0.5">
            Running + NPA + Settled loans — loan given vs collected (EMI + Fine + 1st EMI charge), and the deficit still to recover or the surplus already recovered
          </p>
        </div>
        <select
          value={selectedId}
          onChange={e => onSelect(e.target.value)}
          className="form-input !py-2 !w-auto"
          aria-label="Retailer"
        >
          <option value="">All Retailers</option>
          {rows.map(r => <option key={r.retailerId} value={r.retailerId}>{r.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-3 py-2">{[0, 1, 2].map(i => <div key={i} className="skeleton h-8 w-full rounded-lg" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-muted py-6 text-center">No retailers with running, NPA or settled loans yet.</p>
      ) : selected ? (
        (() => {
          const pct = recoveryPct(selected.loanGiven, selected.totalCollected);
          const cleared = selected.deficit <= 0;
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <SummaryTile label="Loan Given (Invested)" value={selected.loanGiven} tone="border-emerald-500/40 bg-emerald-500/10 text-emerald-700" />
                <SummaryTile label="EMI Collected" value={selected.emiCollected} tone="border-teal-500/40 bg-teal-500/10 text-teal-700" />
                <SummaryTile label="Fine Collected" value={selected.fineCollected} tone="border-rose-500/40 bg-rose-500/10 text-rose-700" />
                <SummaryTile label="1st EMI Charge Collected" value={selected.firstChargeCollected} tone="border-amber-500/40 bg-amber-500/10 text-amber-700" />
                <SummaryTile label="Total Collected" value={selected.totalCollected} tone="border-violet-500/40 bg-violet-500/10 text-violet-700" sub="EMI + Fine + 1st EMI charge" />
                <SummaryTile
                  label={cleared ? 'Recovered — Surplus' : 'Deficit (Still to Recover)'}
                  value={Math.abs(selected.deficit)}
                  tone={cleared ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700' : 'border-red-500/40 bg-red-500/10 text-red-700'}
                  sub="Loan Given − Total Collected"
                />
              </div>
              <div>
                <div className="flex items-center justify-between text-[11px] text-ink-muted mb-1">
                  <span>
                    {accountsOf(selected)} account{accountsOf(selected) === 1 ? '' : 's'} — {selected.runningCount} running
                    {selected.npaCount > 0 && <> · {selected.npaCount} NPA</>}
                    {selected.settledCount > 0 && <> · {selected.settledCount} settled</>}
                  </span>
                  <span className="num font-semibold text-ink">{pct}% of invested amount recovered</span>
                </div>
                <div className="h-2.5 rounded-full bg-surface-3 overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full bg-gradient-to-r ${cleared ? 'from-emerald-500 to-teal-400' : 'from-teal-500 to-cyan-400'}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
              </div>
            </div>
          );
        })()
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table text-xs sm:text-sm">
            <thead>
              <tr>
                <th>Retailer</th>
                <th className="text-right">Accounts</th>
                <th className="text-right">Loan Given</th>
                <th className="text-right">EMI</th>
                <th className="text-right">Fine</th>
                <th className="text-right">1st Charge</th>
                <th className="text-right">Total Collected</th>
                <th className="text-right">Deficit / Surplus</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.retailerId} onClick={() => onSelect(r.retailerId)} className="cursor-pointer hover:bg-surface-2">
                  <td className="font-semibold text-ink">{r.name}{!r.isActive && <span className="ml-1.5 text-[10px] text-ink-muted">(inactive)</span>}</td>
                  <td className="num text-right" title={`${r.runningCount} running · ${r.npaCount} NPA · ${r.settledCount} settled`}>
                    {accountsOf(r)}
                  </td>
                  <td className="num text-right">{formatCurrency(r.loanGiven)}</td>
                  <td className="num text-right">{formatCurrency(r.emiCollected)}</td>
                  <td className="num text-right">{formatCurrency(r.fineCollected)}</td>
                  <td className="num text-right">{formatCurrency(r.firstChargeCollected)}</td>
                  <td className="num text-right font-semibold">{formatCurrency(r.totalCollected)}</td>
                  <td className="num text-right font-bold whitespace-nowrap"><DeficitCell value={r.deficit} /></td>
                </tr>
              ))}
              <tr className="border-t-2 border-surface-4 bg-surface-2">
                <td className="font-bold text-ink">All Retailers</td>
                <td className="num text-right font-bold">{totals.runningCount + totals.npaCount + totals.settledCount}</td>
                <td className="num text-right font-bold">{formatCurrency(totals.loanGiven)}</td>
                <td className="num text-right font-bold">{formatCurrency(totals.emiCollected)}</td>
                <td className="num text-right font-bold">{formatCurrency(totals.fineCollected)}</td>
                <td className="num text-right font-bold">{formatCurrency(totals.firstChargeCollected)}</td>
                <td className="num text-right font-bold">{formatCurrency(totals.totalCollected)}</td>
                <td className="num text-right font-bold whitespace-nowrap"><DeficitCell value={totals.deficit} /></td>
              </tr>
            </tbody>
          </table>
          <p className="text-[10px] text-ink-muted mt-2">Tap a row to open that retailer&apos;s detailed summary.</p>
        </div>
      )}
    </motion.div>
  );
}

function SummaryTile({ label, value, tone, sub }: { label: string; value: number; tone: string; sub?: string }) {
  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest">{label}</p>
      <CountUp value={value} format={formatCurrency} className="num mt-1 block text-xl font-extrabold" />
      {sub && <p className="mt-0.5 text-[10px] text-ink-muted">{sub}</p>}
    </div>
  );
}

// ── Rainbow ranked list — every entry its own colour, bouncy slide-in ────────
function RainbowRanking({ rows, metric }: { rows: BreakdownRow[]; metric: 'amount' | 'count' }) {
  if (rows.length === 0) {
    return <p className="text-sm text-ink-muted py-8 text-center">No devices sold in this period yet.</p>;
  }
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
                  {metric === 'amount' ? formatCurrency(r.amount) : `${r.count} sold`}
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

// ── presentational pieces ────────────────────────────────────────────────────

function SectionDivider({ grad, text }: { grad: string; text: string }) {
  return (
    <motion.div
      className="flex items-center gap-2.5 pt-1"
      initial={{ opacity: 0, x: -12 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={SPRING}
    >
      <span className={`w-2 h-6 rounded-full bg-gradient-to-b ${grad}`} />
      <p className="text-sm font-bold uppercase tracking-widest text-ink">{text}</p>
      <span className="flex-1 h-px bg-gradient-to-r from-surface-4 to-transparent" />
    </motion.div>
  );
}

function DeltaBadge({ prev, cur, invert = false }: { prev: number; cur: number; invert?: boolean }) {
  if (prev === 0 && cur === 0) return <span className="text-[10px] text-ink-muted">—</span>;
  const pct = prev === 0 ? 100 : ((cur - prev) / Math.abs(prev)) * 100;
  const up = cur >= prev;
  // For "good when up" metrics green=up; for inverted (e.g. bounce rate) green=down.
  const good = invert ? !up : up;
  return (
    <span className={`text-[10px] font-bold ${good ? 'text-emerald-600' : 'text-rose-600'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

const STAT_THEMES: Record<string, string> = {
  emerald: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700',
  teal: 'bg-teal-500/10 border-teal-500/40 text-teal-700',
  blue: 'bg-blue-600/10 border-blue-600/40 text-blue-700',
  rose: 'bg-rose-600/10 border-rose-600/40 text-rose-700',
};

function StatCard({
  label, prev, cur, format, theme, invert = false,
}: {
  label: string; prev: number; cur: number; format: (n: number) => string; theme: string; invert?: boolean;
}) {
  return (
    <motion.div
      variants={cardRise}
      whileHover={{ y: -4, transition: SPRING }}
      className={`rounded-xl border-2 p-4 ${STAT_THEMES[theme]}`}
    >
      <div className="flex items-start justify-between gap-1">
        <p className="text-[10px] font-bold uppercase tracking-widest">{label}</p>
        <DeltaBadge prev={prev} cur={cur} invert={invert} />
      </div>
      <CountUp value={cur} format={format} className="num font-extrabold text-2xl mt-2 block" />
      <p className="text-[10px] opacity-70 mt-1">vs same month last year</p>
    </motion.div>
  );
}

function GroupedBars({
  groups, fmt, lastLabel, thisLabel, single = false,
}: {
  groups: { label: string; last: number; current: number }[];
  fmt: (v: number) => string;
  lastLabel: string;
  thisLabel: string;
  single?: boolean;
}) {
  const max = Math.max(1, ...groups.flatMap((g) => [g.last, g.current]));
  return (
    <div className="mt-2">
      <div className={`flex items-stretch ${single ? 'justify-center gap-12' : 'justify-around gap-6'} h-48`}>
        {groups.map((g) => (
          <div key={g.label} className="flex-1 flex flex-col items-center justify-end gap-2 max-w-[180px]">
            <div className="flex items-end justify-center gap-3 w-full h-full">
              <Bar value={g.last} max={max} fmt={fmt} className="bg-gradient-to-t from-slate-400 to-slate-300" />
              <Bar value={g.current} max={max} fmt={fmt} className="bg-gradient-to-t from-violet-600 via-fuchsia-500 to-amber-400" />
            </div>
            <p className="text-xs font-semibold text-ink-muted text-center">{g.label}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-4 mt-4 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gradient-to-t from-slate-400 to-slate-300" /> {lastLabel}</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gradient-to-t from-violet-600 to-amber-400" /> {thisLabel}</span>
      </div>
    </div>
  );
}

function Bar({ value, max, fmt, className }: { value: number; max: number; fmt: (v: number) => string; className: string }) {
  // Floor at 2% so a non-zero value is always visible; true zero stays flat.
  const pct = value <= 0 ? 0 : Math.max(2, (value / max) * 100);
  return (
    <div className="flex flex-col items-center justify-end h-full w-9 sm:w-11">
      <span className="text-[10px] font-bold text-ink mb-1 num whitespace-nowrap">
        <CountUp value={value} format={fmt} duration={0.9} />
      </span>
      <motion.div
        className={`w-full rounded-t-lg ${className}`}
        initial={{ height: 0 }}
        animate={{ height: `${pct}%` }}
        transition={{ ...SPRING, damping: 26 }}
      />
    </div>
  );
}

function Leaderboard({
  title, subtitle, rows, format,
}: {
  title: string; subtitle: string; rows: LeaderRow[]; format: (v: number) => string;
}) {
  const medals = ['🥇', '🥈', '🥉'];
  const top = rows[0]?.value ?? 0;
  return (
    <motion.div
      className="card p-6"
      variants={cardRise}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-40px' }}
    >
      <p className="section-header mb-0">{title}</p>
      <p className="text-[11px] text-ink-muted mb-4">{subtitle}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted py-6 text-center">No activity for this month yet.</p>
      ) : (
        <motion.div className="space-y-2.5" variants={staggerContainer(0.08, 0.05)} initial="hidden" animate="show">
          {rows.map((r, i) => (
            <motion.div key={r.retailerId} variants={fadeUp} className="flex items-center gap-3">
              <motion.span
                className="w-6 text-center text-sm font-bold text-ink-muted"
                initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ ...SPRING, delay: 0.1 + i * 0.06 }}
              >
                {medals[i] ?? i + 1}
              </motion.span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink truncate">{r.name}</p>
                  <p className="text-sm font-bold num text-ink whitespace-nowrap">
                    <CountUp value={r.value} format={format} duration={0.9} />
                  </p>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full bg-gradient-to-r ${SECTOR_COLORS[i % SECTOR_COLORS.length].bar}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${top > 0 ? Math.max(4, (r.value / top) * 100) : 0}%` }}
                    transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.15 + i * 0.06 }}
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}
