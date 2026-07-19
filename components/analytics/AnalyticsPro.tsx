'use client';

/**
 * Analytics — premium year-over-year business intelligence dashboard.
 *
 * Complete visual redesign of the old Analysis tab. The numbers come from the
 * SAME sources and formulas as before, unchanged:
 *   1. get_emi_analysis(p_month, p_year) RPC — with the identical client-side
 *      fallback aggregation when the function isn't deployed;
 *   2. /api/admin/top-products (top brands / products, month till date);
 *   3. /api/admin/retailer-summary (lifetime recovery per retailer).
 * Dates stay anchored to each record's own collection/purchase date, so
 * imported history reports in its real month.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3, Trophy, Store, Package, Filter as FilterIcon, RefreshCcw,
  ChevronLeft, ChevronRight, TrendingUp, Users, Landmark, Percent, X,
  Wallet, Crown,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/formatters';
import { staggerContainer } from '@/lib/motion';
import { cn } from '@/lib/cn';
import { KpiCard, KpiGrid } from '@/components/ui/KpiCard';
import {
  Panel, SectionHead, Segmented, BottomSheet, EmptyState, Skeleton, RankRow, Chip, ProgressBar,
} from '@/components/ui/primitives';
import { DataTablePro, Column } from '@/components/ui/DataTablePro';
import type { BreakdownRow } from '@/app/api/admin/top-products/route';
import type { RetailerSummaryRow } from '@/app/api/admin/retailer-summary/route';

const fmt = formatCurrency;
const fmtShort = (n: number) =>
  Math.abs(n) >= 10_000_000 ? `₹${(n / 10_000_000).toFixed(1)}Cr`
  : Math.abs(n) >= 100_000 ? `₹${(n / 100_000).toFixed(1)}L`
  : Math.abs(n) >= 1_000 ? `₹${(n / 1_000).toFixed(0)}k`
  : `₹${Math.round(n)}`;

const CompareBars = dynamic(() => import('@/components/ui/charts').then(m => m.CompareBars), {
  ssr: false, loading: () => <Skeleton className="h-64 w-full rounded-xl" />,
});

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const pad2 = (n: number) => String(n).padStart(2, '0');

/* Fixed categorical order for multi-hue ranked lists (validated palette).
   Identity always doubled by the rank number + direct value label. */
const CAT = [
  { dot: 'bg-indigo-500', bar: 'bg-gradient-to-r from-indigo-500 to-indigo-400' },
  { dot: 'bg-sky-500', bar: 'bg-gradient-to-r from-sky-500 to-sky-400' },
  { dot: 'bg-emerald-500', bar: 'bg-gradient-to-r from-emerald-500 to-emerald-400' },
  { dot: 'bg-amber-500', bar: 'bg-gradient-to-r from-amber-500 to-amber-400' },
  { dot: 'bg-rose-500', bar: 'bg-gradient-to-r from-rose-500 to-rose-400' },
  { dot: 'bg-purple-500', bar: 'bg-gradient-to-r from-purple-500 to-purple-400' },
];

/* ── Data shapes + helpers (identical to the previous implementation) ────── */

interface PeriodMetrics {
  loanGiven: number;
  collected: number;
  customers: number;
  dueEmis: number;
  bouncedEmis: number;
}

interface LeaderRow { retailerId: string; name: string; value: number }

interface AnalysisData {
  thisYear: PeriodMetrics;
  lastYear: PeriodMetrics;
  leadLeaderboard: LeaderRow[];
  collectionLeaderboard: LeaderRow[];
}

const EMPTY_PERIOD: PeriodMetrics = { loanGiven: 0, collected: 0, customers: 0, dueEmis: 0, bouncedEmis: 0 };

function inMonth(value: string | null | undefined, year: number, month: number): boolean {
  if (!value) return false;
  const d = new Date(value.length <= 10 ? value + 'T00:00:00' : value);
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === year && d.getMonth() + 1 === month;
}

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

function collectionDateOf(e: EmiRow): string | undefined {
  return e.collection_requested_at || e.paid_at || e.due_date || undefined;
}
function paidOnSchedule(e: EmiRow, customerStatus: string | undefined): boolean {
  return e.status === 'APPROVED' || customerStatus === 'COMPLETE';
}
function emiPrincipalCollected(e: EmiRow, customerStatus: string | undefined): number {
  if (paidOnSchedule(e, customerStatus)) return Number(e.amount || 0);
  return Number(e.partial_paid_amount || 0);
}
function bounceRate(p: PeriodMetrics): number {
  return p.dueEmis > 0 ? (p.bouncedEmis / p.dueEmis) * 100 : 0;
}
function deltaPct(prev: number, cur: number): number | undefined {
  if (prev === 0 && cur === 0) return undefined;
  if (prev === 0) return 100;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

type VolumeMetric = 'customers' | 'loanGiven' | 'collected' | 'bounceRate';

/* ═════════════════════════ Component ═════════════════════════ */

export default function AnalyticsPro({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [volumeMetric, setVolumeMetric] = useState<VolumeMetric>('collected');
  const [filterSheet, setFilterSheet] = useState(false);

  const [top, setTop] = useState<{ brands: BreakdownRow[]; products: BreakdownRow[] } | null>(null);
  const [topLoading, setTopLoading] = useState(true);
  const [topTab, setTopTab] = useState<'products' | 'brands'>('products');

  const [retSummary, setRetSummary] = useState<RetailerSummaryRow[] | null>(null);
  const [retSummaryLoading, setRetSummaryLoading] = useState(true);
  const [selectedRetailerId, setSelectedRetailerId] = useState<string>('');

  /* ── Retailer-wise recovery summary (lifetime, not month-scoped) ───────── */
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

  /* ── YoY analysis: RPC first, identical client fallback second ─────────── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rpc = await supabase.rpc('get_emi_analysis', { p_month: month, p_year: year });
      if (!rpc.error && rpc.data && (rpc.data as AnalysisData).thisYear) {
        setData(rpc.data as AnalysisData);
        return;
      }

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
          if (COUNTED.has(c.status || '') && c.first_emi_charge_paid_at && inMonth(c.first_emi_charge_paid_at, y, month)) {
            p.collected += Number(c.first_emi_charge_amount || 0);
          }
        }
        for (const e of emiRows) {
          if (!e.customer_id || !countedCustomerIds.has(e.customer_id)) continue;
          const st = statusOf.get(e.customer_id);
          const principal = emiPrincipalCollected(e, st);
          const fine = Number(e.fine_paid_amount || 0);
          if ((principal > 0 || fine > 0) && inMonth(collectionDateOf(e), y, month)) {
            p.collected += principal + fine;
          }
          if (inMonth(e.due_date, y, month)) {
            p.dueEmis += 1;
            if (!paidOnSchedule(e, st)) p.bouncedEmis += 1;
          }
        }
        return p;
      };

      const leadMap = new Map<string, number>();
      for (const c of customerRows) {
        if (c.retailer_id && COUNTED.has(c.status || '') && inMonth(c.purchase_date || c.created_at, year, month)) {
          leadMap.set(c.retailer_id, (leadMap.get(c.retailer_id) || 0) + 1);
        }
      }
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
      const toBoard = (mp: Map<string, number>): LeaderRow[] =>
        [...mp.entries()]
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

  /* ── Top brands / products for the selected month ──────────────────────── */
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
  const lastLabel = `${MONTHS[month - 1].slice(0, 3)} ${year - 1}`;
  const thisLabel = `${MONTHS[month - 1].slice(0, 3)} ${year}`;

  const volume = useMemo(() => {
    switch (volumeMetric) {
      case 'loanGiven': return { label: 'Loan Given', last: lastY.loanGiven, current: thisY.loanGiven, fmt: fmtShort };
      case 'bounceRate': return { label: 'Bounce Rate', last: bounceRate(lastY), current: bounceRate(thisY), fmt: (v: number) => `${v.toFixed(1)}%` };
      case 'customers': return { label: 'New Customers', last: lastY.customers, current: thisY.customers, fmt: (v: number) => String(Math.round(v)) };
      case 'collected':
      default: return { label: 'Collected', last: lastY.collected, current: thisY.collected, fmt: fmtShort };
    }
  }, [volumeMetric, thisY, lastY]);

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  const stepMonth = (delta: number) => {
    let m2 = month + delta, y2 = year;
    if (m2 < 1) { m2 = 12; y2 -= 1; }
    if (m2 > 12) { m2 = 1; y2 += 1; }
    if (y2 > now.getFullYear() || (y2 === now.getFullYear() && m2 > now.getMonth() + 1)) return;
    setMonth(m2); setYear(y2);
  };

  const resetFilters = () => {
    setMonth(now.getMonth() + 1);
    setYear(now.getFullYear());
    setSelectedRetailerId('');
  };

  const filterControls = (
    <>
      <div className="flex items-center gap-2">
        <select
          value={month} onChange={e => setMonth(Number(e.target.value))}
          className="input !w-auto !py-2 text-sm" aria-label="Month"
        >
          {MONTHS.map((mn, i) => <option key={mn} value={i + 1}>{mn}</option>)}
        </select>
        <div className="flex items-center rounded-xl border border-surface-4 bg-surface-2 overflow-hidden">
          <button onClick={() => setYear(y => y - 1)} className="px-3 py-2.5 text-ink-muted hover:bg-surface-3 transition-colors" aria-label="Previous year"><ChevronLeft size={14} /></button>
          <span className="px-2 text-sm font-bold text-ink num">{year}</span>
          <button
            onClick={() => setYear(y => Math.min(now.getFullYear(), y + 1))}
            disabled={year >= now.getFullYear()}
            className="px-3 py-2.5 text-ink-muted hover:bg-surface-3 disabled:opacity-30 transition-colors" aria-label="Next year"
          ><ChevronRight size={14} /></button>
        </div>
      </div>
      <select
        value={selectedRetailerId} onChange={e => setSelectedRetailerId(e.target.value)}
        className="input !w-auto !py-2 text-sm max-w-[180px]" aria-label="Retailer focus"
      >
        <option value="">All retailers</option>
        {(retSummary ?? []).map(r => <option key={r.retailerId} value={r.retailerId}>{r.name}</option>)}
      </select>
      <button
        onClick={resetFilters}
        className="inline-flex items-center gap-1.5 rounded-xl border border-surface-4 px-3 py-2.5 text-xs font-bold text-ink-muted hover:text-ink hover:border-indigo-300 transition-colors"
      >
        <X size={12} aria-hidden /> Reset
      </button>
      <button
        onClick={load}
        className="inline-flex items-center gap-1.5 rounded-xl border border-surface-4 px-3 py-2.5 text-xs font-bold text-ink-muted hover:text-ink hover:border-indigo-300 transition-colors"
      >
        <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} aria-hidden /> {loading ? 'Loading…' : 'Refresh'}
      </button>
    </>
  );

  return (
    <motion.div className="space-y-8" variants={staggerContainer(0.06, 0.02)} initial="hidden" animate="show">

      {/* ═══ Header ═══ */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-purple-500 dark:text-purple-300">Analytics</p>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-ink mt-1">Business intelligence</h1>
          <p className="text-sm text-ink-muted mt-1">
            {MONTHS[month - 1]} {year} vs {MONTHS[month - 1]} {year - 1}
            {isCurrentMonth && <Chip className="ml-2 border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">Month till date</Chip>}
          </p>
        </div>
      </div>

      {/* ═══ Sticky filter bar (desktop) / floating button + sheet (mobile) ═══ */}
      <div className="sticky top-14 z-30 -mx-4 sm:mx-0 px-4 sm:px-0">
        <div className="hidden sm:flex flex-wrap items-center gap-2 rounded-[18px] border border-surface-4/80 bg-surface/90 backdrop-blur-md p-2.5 shadow-card dark:border-surface-3">
          <span className="inline-flex items-center gap-1.5 px-2 text-[11px] font-bold uppercase tracking-widest text-ink-muted">
            <FilterIcon size={12} aria-hidden /> Filters
          </span>
          {filterControls}
        </div>
        <div className="sm:hidden flex justify-end">
          <button
            onClick={() => setFilterSheet(true)}
            className="inline-flex items-center gap-2 rounded-full border border-surface-4 bg-surface/95 backdrop-blur px-4 py-2.5 text-xs font-bold text-ink shadow-float"
          >
            <FilterIcon size={13} aria-hidden /> {MONTHS[month - 1].slice(0, 3)} {year}
          </button>
        </div>
      </div>
      <BottomSheet open={filterSheet} onClose={() => setFilterSheet(false)} title="Analytics filters">
        <div className="flex flex-col gap-3">{filterControls}</div>
      </BottomSheet>

      {/* ═══ YoY snapshot cards — real deltas vs same month last year ═══ */}
      <section aria-label="Year-over-year comparison">
        <div className="mb-3">
          <SectionHead icon={TrendingUp} title="Year-over-year snapshot" sub={`${thisLabel} vs ${lastLabel} — running + completed loans`} tint="text-emerald-600 bg-emerald-50 dark:bg-emerald-500/15" />
        </div>
        <KpiGrid>
          <KpiCard
            loading={loading} icon={Landmark} tone="indigo"
            label="Loan Given" value={thisY.loanGiven} format={fmt}
            deltaPct={deltaPct(lastY.loanGiven, thisY.loanGiven)} deltaLabel={`vs ${lastLabel}`}
            secondary={{ label: lastLabel, value: lastY.loanGiven, format: fmt }}
            formula="Loan disbursed for plans started this month (disburse amount, else phone value − down payment)."
          />
          <KpiCard
            loading={loading} icon={Wallet} tone="emerald"
            label="Collected" value={thisY.collected} format={fmt}
            deltaPct={deltaPct(lastY.collected, thisY.collected)} deltaLabel={`vs ${lastLabel}`}
            secondary={{ label: lastLabel, value: lastY.collected, format: fmt }}
            formula="EMI + fines + 1st-EMI charges collected this month, anchored to each EMI's own collection date."
          />
          <KpiCard
            loading={loading} icon={Users} tone="sky"
            label="New Customers" value={thisY.customers}
            deltaPct={deltaPct(lastY.customers, thisY.customers)} deltaLabel={`vs ${lastLabel}`}
            secondary={{ label: lastLabel, value: lastY.customers, format: n => String(Math.round(n)) }}
            formula="Unique customers who started an EMI plan this month."
          />
          <KpiCard
            loading={loading} icon={Percent} tone="rose"
            label="Bounce Rate" value={bounceRate(thisY)} format={n => `${n.toFixed(1)}%`}
            deltaPct={deltaPct(bounceRate(lastY), bounceRate(thisY))} deltaInvert deltaLabel={`vs ${lastLabel}`}
            secondary={{ label: lastLabel, value: bounceRate(lastY), format: n => `${n.toFixed(1)}%` }}
            formula="Share of EMIs due this month that were not collected on schedule."
          />
        </KpiGrid>
      </section>

      {/* ═══ Comparison charts ═══ */}
      <section aria-label="Comparison charts" className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel className="p-5 sm:p-6">
          <SectionHead
            icon={BarChart3} title="Loan given vs collected"
            sub={`${thisLabel} against ${lastLabel}`}
            tint="text-indigo-600 bg-indigo-50 dark:bg-indigo-500/15"
          />
          <div className="mt-4">
            {loading ? <Skeleton className="h-64 w-full rounded-xl" /> : (
              <CompareBars
                data={[
                  { name: 'Loan Given', current: thisY.loanGiven, compare: lastY.loanGiven },
                  { name: 'Collected', current: thisY.collected, compare: lastY.collected },
                ]}
                currentLabel={thisLabel} compareLabel={lastLabel} format={fmtShort}
              />
            )}
          </div>
        </Panel>

        <Panel className="p-5 sm:p-6">
          <SectionHead
            icon={TrendingUp} title={volume.label}
            sub="Toggle the metric to compare"
            tint="text-sky-600 bg-sky-50 dark:bg-sky-500/15"
            right={
              <Segmented<VolumeMetric>
                id="volume-metric" size="sm"
                value={volumeMetric}
                onChange={setVolumeMetric}
                options={[
                  { value: 'collected', label: 'Collected' },
                  { value: 'loanGiven', label: 'Loan' },
                  { value: 'customers', label: 'Customers' },
                  { value: 'bounceRate', label: 'Bounce %' },
                ]}
              />
            }
          />
          <div className="mt-4">
            {loading ? <Skeleton className="h-64 w-full rounded-xl" /> : (
              <CompareBars
                data={[{ name: volume.label, current: volume.current, compare: volume.last }]}
                currentLabel={thisLabel} compareLabel={lastLabel} format={volume.fmt}
              />
            )}
          </div>
        </Panel>
      </section>

      {/* ═══ Leaderboards ═══ */}
      <section aria-label="Retailer leaderboards" className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <LeaderboardPanel
          icon={Trophy} title="Lead generation leaderboard"
          sub={`Most customers onboarded — ${MONTHS[month - 1]} ${year}`}
          tint="text-amber-600 bg-amber-50 dark:bg-amber-500/15"
          rows={data?.leadLeaderboard ?? []}
          loading={loading}
          format={v => `${Math.round(v)} customers`}
          highlightId={selectedRetailerId}
        />
        <LeaderboardPanel
          icon={Crown} title="Collection leaderboard"
          sub={`Highest EMI volume collected — ${MONTHS[month - 1]} ${year}`}
          tint="text-emerald-600 bg-emerald-50 dark:bg-emerald-500/15"
          rows={data?.collectionLeaderboard ?? []}
          loading={loading}
          format={fmt}
          highlightId={selectedRetailerId}
        />
      </section>

      {/* ═══ Retailer recovery summary ═══ */}
      <RetailerRecovery
        rows={retSummary ?? []}
        loading={retSummaryLoading}
        selectedId={selectedRetailerId}
        onSelect={setSelectedRetailerId}
      />

      {/* ═══ Top products / brands ═══ */}
      <section aria-label="Top selling">
        <Panel className="p-5 sm:p-6" animate={false}>
          <SectionHead
            icon={Package} title="Top selling — month till date"
            sub={`${MONTHS[month - 1]} ${year} · whole network, ranked by devices financed`}
            tint="text-purple-600 bg-purple-50 dark:bg-purple-500/15"
            right={
              <Segmented<'products' | 'brands'>
                id="top-tab" size="sm"
                value={topTab} onChange={setTopTab}
                options={[
                  { value: 'products', label: 'Products' },
                  { value: 'brands', label: 'Brands' },
                ]}
              />
            }
          />
          <div className="mt-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={topTab}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                {topLoading ? (
                  <div className="space-y-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}</div>
                ) : (
                  <TopRanking
                    rows={topTab === 'products' ? (top?.products ?? []) : (top?.brands ?? [])}
                    metric={topTab === 'brands' ? 'amount' : 'count'}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </Panel>
      </section>
    </motion.div>
  );
}

/* ═════════════════════════ Leaderboard panel ═════════════════════════ */

function LeaderboardPanel({
  icon, title, sub, tint, rows, loading, format, highlightId,
}: {
  icon: typeof Trophy; title: string; sub: string; tint: string;
  rows: LeaderRow[]; loading: boolean; format: (v: number) => string;
  highlightId?: string;
}) {
  const top = rows[0]?.value ?? 0;
  return (
    <Panel className="p-5 sm:p-6">
      <SectionHead icon={icon} title={title} sub={sub} tint={tint} />
      <div className="mt-5">
        {loading ? (
          <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-9 w-full rounded-lg" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Trophy} title="No activity this month yet" />
        ) : (
          <div className="space-y-3">
            {rows.map((r, i) => (
              <div key={r.retailerId} className={cn(highlightId && r.retailerId !== highlightId && 'opacity-45 transition-opacity')}>
                <RankRow
                  rank={i + 1}
                  name={r.name}
                  valueLabel={format(r.value)}
                  pct={top > 0 ? Math.max(4, (r.value / top) * 100) : 0}
                  delay={i * 0.05}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ═════════════════════════ Top ranking (multi-hue) ═════════════════════════ */

function TopRanking({ rows, metric }: { rows: BreakdownRow[]; metric: 'amount' | 'count' }) {
  if (rows.length === 0) {
    return <EmptyState icon={Package} title="No devices sold in this period yet" />;
  }
  const max = Math.max(1, ...rows.map(r => (metric === 'amount' ? r.amount : r.count)));
  return (
    <div className="space-y-3">
      {rows.map((r, i) => {
        const v = metric === 'amount' ? r.amount : r.count;
        const c = CAT[i % CAT.length];
        return (
          <motion.div
            key={r.name}
            initial={{ opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.04 }}
            className="flex items-center gap-3"
          >
            <span className={cn('w-7 h-7 rounded-lg text-white text-[11px] font-extrabold flex items-center justify-center shrink-0 shadow-sm num', c.dot)}>
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-[13px] font-semibold text-ink truncate">{r.name}</p>
                <p className="num text-xs font-bold text-ink whitespace-nowrap">
                  {metric === 'amount' ? fmt(r.amount) : `${r.count} sold`}
                  {metric === 'amount' && <span className="text-ink-muted font-medium"> · {r.count}</span>}
                </p>
              </div>
              <ProgressBar pct={Math.max(5, (v / max) * 100)} height="h-2" barClassName={c.bar} delay={i * 0.05} />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ═════════════════════════ Retailer recovery ═════════════════════════ */

function RetailerRecovery({
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
      accounts: t.accounts + r.runningCount + r.npaCount + r.settledCount,
      loanGiven: t.loanGiven + r.loanGiven,
      emiCollected: t.emiCollected + r.emiCollected,
      fineCollected: t.fineCollected + r.fineCollected,
      firstChargeCollected: t.firstChargeCollected + r.firstChargeCollected,
      totalCollected: t.totalCollected + r.totalCollected,
      deficit: t.deficit + r.deficit,
    }),
    { accounts: 0, loanGiven: 0, emiCollected: 0, fineCollected: 0, firstChargeCollected: 0, totalCollected: 0, deficit: 0 },
  );
  const recoveryPct = (loan: number, collected: number) =>
    loan > 0 ? Math.min(100, Math.round((collected / loan) * 100)) : 0;

  const DeficitPill = ({ value }: { value: number }) =>
    value > 0 ? (
      <span className="num inline-flex items-center rounded-full border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 px-2.5 py-1 text-[11px] font-extrabold text-rose-700 dark:text-rose-300">
        ▼ {fmt(value)}
      </span>
    ) : (
      <span className="num inline-flex items-center rounded-full border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300">
        ▲ +{fmt(Math.abs(value))}
      </span>
    );

  const columns: Column<RetailerSummaryRow>[] = [
    {
      key: 'name', header: 'Retailer', accessor: r => r.name,
      cell: r => (
        <span>
          <span className="block font-semibold text-ink">
            {r.name}{!r.isActive && <span className="ml-1.5 text-[10px] text-ink-muted">(inactive)</span>}
          </span>
          <span className="block mt-1 max-w-[130px]">
            <ProgressBar pct={Math.max(recoveryPct(r.loanGiven, r.totalCollected), 3)} height="h-1" />
          </span>
        </span>
      ),
    },
    {
      key: 'accounts', header: 'Accounts', align: 'right', numeric: true,
      accessor: r => r.runningCount + r.npaCount + r.settledCount,
      cell: r => (
        <span
          className="num inline-flex items-center justify-center min-w-[26px] px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-bold text-xs"
          title={`${r.runningCount} running · ${r.npaCount} NPA · ${r.settledCount} settled`}
        >
          {r.runningCount + r.npaCount + r.settledCount}
        </span>
      ),
    },
    { key: 'loan', header: 'Loan Given', accessor: r => r.loanGiven, align: 'right', numeric: true, cell: r => <span className="num font-semibold">{fmt(r.loanGiven)}</span> },
    { key: 'emi', header: 'EMI', accessor: r => r.emiCollected, align: 'right', numeric: true, cell: r => <span className="num">{fmt(r.emiCollected)}</span>, hideOnCard: true },
    { key: 'fine', header: 'Fine', accessor: r => r.fineCollected, align: 'right', numeric: true, cell: r => <span className="num">{fmt(r.fineCollected)}</span>, hideOnCard: true },
    { key: 'charge', header: '1st Charge', accessor: r => r.firstChargeCollected, align: 'right', numeric: true, cell: r => <span className="num">{fmt(r.firstChargeCollected)}</span>, hideOnCard: true },
    { key: 'collected', header: 'Collected', accessor: r => r.totalCollected, align: 'right', numeric: true, cell: r => <span className="num font-bold text-emerald-700 dark:text-emerald-300">{fmt(r.totalCollected)}</span> },
    { key: 'deficit', header: 'Deficit / Surplus', accessor: r => r.deficit, align: 'right', numeric: true, cell: r => <DeficitPill value={r.deficit} /> },
  ];

  return (
    <section aria-label="Retailer recovery summary">
      <Panel className="p-5 sm:p-6" animate={false}>
        <SectionHead
          icon={Store} title="Retailer-wise recovery"
          sub="Running + NPA + settled loans — loan given vs everything collected (lifetime)"
          tint="text-emerald-600 bg-emerald-50 dark:bg-emerald-500/15"
          right={selected && (
            <button
              onClick={() => onSelect('')}
              className="text-xs font-semibold text-ink-muted hover:text-ink underline underline-offset-4"
            >
              ← All retailers
            </button>
          )}
        />

        <div className="mt-5">
          {loading ? (
            <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-11 w-full rounded-xl" />)}</div>
          ) : rows.length === 0 ? (
            <EmptyState icon={Store} title="No retailers with exposure yet" />
          ) : selected ? (
            (() => {
              const pct = recoveryPct(selected.loanGiven, selected.totalCollected);
              const cleared = selected.deficit <= 0;
              return (
                <motion.div key={selected.retailerId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-lg font-extrabold text-ink">{selected.name}</span>
                    {!selected.isActive && <span className="badge-gray">Inactive</span>}
                    <span className="badge-green">● {selected.runningCount} Running</span>
                    {selected.npaCount > 0 && <span className="badge-red">{selected.npaCount} NPA</span>}
                    {selected.settledCount > 0 && <span className="badge-blue">{selected.settledCount} Settled</span>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <StatTile label="Loan Given (Invested)" value={selected.loanGiven} tone="text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/60 dark:bg-indigo-500/10" />
                    <StatTile label="Total Collected" value={selected.totalCollected} sub="EMI + fine + 1st EMI charge" tone="text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10" />
                    <StatTile
                      label={cleared ? 'Surplus Recovered' : 'Still to Recover'}
                      value={Math.abs(selected.deficit)} sub="Loan given − total collected"
                      tone={cleared
                        ? 'text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10'
                        : 'text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30 bg-rose-50/60 dark:bg-rose-500/10'}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 keep-cols">
                    <StatTile label="EMI Collected" value={selected.emiCollected} tone="text-sky-700 dark:text-sky-300 border-surface-4 bg-surface-2" small />
                    <StatTile label="Fine Collected" value={selected.fineCollected} tone="text-rose-700 dark:text-rose-300 border-surface-4 bg-surface-2" small />
                    <StatTile label="1st Charge Collected" value={selected.firstChargeCollected} tone="text-amber-700 dark:text-amber-300 border-surface-4 bg-surface-2" small />
                  </div>

                  <div className="rounded-2xl border border-surface-4 bg-surface-2 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-ink-muted">Investment recovery</p>
                      <p className="num text-sm font-extrabold text-ink">{pct}%</p>
                    </div>
                    <ProgressBar
                      pct={Math.max(pct, 4)} height="h-3"
                      barClassName={cleared ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-gradient-to-r from-indigo-500 to-sky-500'}
                    />
                    <p className="text-[11px] text-ink-muted mt-2">
                      {cleared
                        ? `Invested amount fully recovered — ${fmt(Math.abs(selected.deficit))} in surplus at this shop.`
                        : `${fmt(selected.deficit)} more to collect before the invested amount is fully back.`}
                    </p>
                  </div>
                </motion.div>
              );
            })()
          ) : (
            <DataTablePro
              rows={rows}
              columns={columns}
              rowKey={r => r.retailerId}
              exportName="retailer_recovery_summary"
              pageSize={12}
              onRowClick={r => onSelect(r.retailerId)}
              cardTitle={r => r.name}
              footer={
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t-2 border-surface-4 bg-surface-2/80 px-4 sm:px-5 py-3 text-xs">
                  <span className="font-extrabold text-ink">Σ All retailers · {totals.accounts} accounts</span>
                  <span className="flex flex-wrap gap-x-5 gap-y-1">
                    <span className="num text-ink-muted">Loan <b className="text-ink">{fmt(totals.loanGiven)}</b></span>
                    <span className="num text-ink-muted">Collected <b className="text-emerald-700 dark:text-emerald-300">{fmt(totals.totalCollected)}</b></span>
                    <span className="num text-ink-muted">Balance <b className={totals.deficit > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}>{fmt(Math.abs(totals.deficit))}{totals.deficit <= 0 ? ' surplus' : ''}</b></span>
                  </span>
                </div>
              }
            />
          )}
        </div>
      </Panel>
    </section>
  );
}

function StatTile({ label, value, sub, tone, small }: { label: string; value: number; sub?: string; tone: string; small?: boolean }) {
  return (
    <div className={cn('rounded-2xl border p-3.5', tone)}>
      <p className="text-[10px] font-extrabold uppercase tracking-widest">{label}</p>
      <p className={cn('num font-extrabold mt-1', small ? 'text-lg' : 'text-xl sm:text-2xl')}>{fmt(value)}</p>
      {sub && <p className="text-[10px] text-ink-muted mt-0.5">{sub}</p>}
    </div>
  );
}
