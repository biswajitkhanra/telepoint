'use client';

/**
 * Reports — enterprise home dashboard for the admin portal.
 *
 * Complete redesign of the old "Reports & Settings" tab. Every figure is
 * sourced from the SAME backend paths as before — /api/metrics (whole-book
 * aggregates computed server-side), the get_emi_analysis RPC (month
 * collection with a true YoY comparison), payment_requests (today's approved
 * collections), /api/admin/expected-loss (risk drill-down) and the existing
 * export endpoints. Calculations are untouched; only presentation changed.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { addDays, subMonths } from 'date-fns';
import {
  Wallet, HandCoins, CalendarClock, AlertTriangle, Users, Landmark,
  PiggyBank, Gauge, FileSpreadsheet, FileText, Database, RefreshCcw,
  Search, Filter, IndianRupee, ReceiptText, ArrowRight, Clock4,
  ShieldAlert, Download, LifeBuoy, BadgePercent, Store,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Retailer, PaymentRequest } from '@/lib/types';
import { formatCurrency, readJsonSafe } from '@/lib/formatters';
import { firstChargeRemaining } from '@/lib/firstCharge';
import { todayIST, midnightIST } from '@/lib/ist';
import type { DateRangePreset } from '@/lib/ist';
import { istDateRange } from '@/lib/ist';
import { useCachedFetch } from '@/lib/useCachedFetch';
import { staggerContainer } from '@/lib/motion';
import { cn } from '@/lib/cn';
import { KpiCard, KpiGrid } from '@/components/ui/KpiCard';
import {
  Panel, SectionHead, Chip, BottomSheet, EmptyState, Skeleton, DateFilterBar,
} from '@/components/ui/primitives';
import { SearchInput } from '@/components/ui/SearchInput';
import { DataTablePro, Column } from '@/components/ui/DataTablePro';
import type { PortfolioMetrics } from '@/app/api/metrics/route';
import type { ExpectedLossCustomer } from '@/app/api/admin/expected-loss/route';

const fmt = formatCurrency;
const fmtShort = (n: number) =>
  Math.abs(n) >= 10_000_000 ? `₹${(n / 10_000_000).toFixed(1)}Cr`
  : Math.abs(n) >= 100_000 ? `₹${(n / 100_000).toFixed(1)}L`
  : Math.abs(n) >= 1_000 ? `₹${(n / 1_000).toFixed(0)}k`
  : `₹${Math.round(n)}`;

/* Charts are heavy — load them only when their section scrolls into view. */
const ProfitLossBars = dynamic(() => import('@/components/ui/charts').then(m => m.ProfitLossBars), {
  ssr: false, loading: () => <Skeleton className="h-56 w-full rounded-xl" />,
});
const TrendArea = dynamic(() => import('@/components/ui/charts').then(m => m.TrendArea), {
  ssr: false, loading: () => <Skeleton className="h-56 w-full rounded-xl" />,
});

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface FilteredEMI {
  id: string;
  emi_no: number;
  due_date: string;
  amount: number;
  status: string;
  fine_amount: number;
  customer_name: string;
  imei: string;
  mobile: string;
  retailer_name: string;
  customer_id: string;
}

export default function ReportsHub({
  supabase, retailers, onOpenCustomer,
}: {
  supabase: ReturnType<typeof createClient>;
  retailers: Retailer[];
  onOpenCustomer: (customerId: string) => void;
}) {
  /* ── Portfolio metrics (server-computed, same endpoint as before) ─────── */
  const { data: metrics, loading: metricsLoading, reload: reloadMetrics, refreshing } =
    useCachedFetch<PortfolioMetrics>('/api/metrics');

  /* ── Today's approved collections (live payment_requests query) ───────── */
  const [todayCollection, setTodayCollection] = useState<{ amount: number; count: number } | null>(null);
  const loadToday = useCallback(async () => {
    const today = todayIST();
    const { data, error } = await supabase
      .from('payment_requests')
      .select('total_amount')
      .eq('status', 'APPROVED')
      .eq('payment_date', today);
    if (error) { setTodayCollection(null); return; }
    const rows = (data ?? []) as { total_amount: number | null }[];
    setTodayCollection({
      amount: rows.reduce((s, r) => s + Number(r.total_amount || 0), 0),
      count: rows.length,
    });
  }, [supabase]);

  /* ── This month vs same month last year (existing analysis RPC) ───────── */
  const [monthStats, setMonthStats] = useState<{ collected: number; lastYear: number } | null>(null);
  const loadMonth = useCallback(async () => {
    const now = new Date();
    const rpc = await supabase.rpc('get_emi_analysis', { p_month: now.getMonth() + 1, p_year: now.getFullYear() });
    const d = rpc.data as { thisYear?: { collected?: number }; lastYear?: { collected?: number } } | null;
    if (!rpc.error && d?.thisYear) {
      setMonthStats({ collected: Number(d.thisYear.collected || 0), lastYear: Number(d.lastYear?.collected || 0) });
    } else {
      // RPC not deployed — hide the card rather than fabricate a figure.
      setMonthStats(null);
    }
  }, [supabase]);

  useEffect(() => { loadToday(); loadMonth(); }, [loadToday, loadMonth]);

  const refreshAll = useCallback(() => {
    reloadMetrics();
    loadToday();
    loadMonth();
  }, [reloadMetrics, loadToday, loadMonth]);

  /* ── Derived figures — identical formulas to the old dashboard ────────── */
  const m = metrics;
  const totals = useMemo(() => {
    if (!m) return null;
    const totalCollection = m.emiCollected + m.fineCollected + m.firstChargeCollected;
    const marketDue =
      (m.emiDue + m.emiCollected) + (m.fineDue + m.fineCollected) +
      (m.firstChargeDue + m.firstChargeCollected);
    const expectedRevenue = marketDue;
    const invDue = expectedRevenue - totalCollection;
    const collectionPct = expectedRevenue > 0 ? Math.min(100, Math.round((totalCollection / expectedRevenue) * 100)) : 0;
    const marketTotal = m.emiCollected + m.emiDue + m.firstChargeDue + m.firstChargeCollected;
    const marketPct = marketTotal > 0
      ? Math.min(100, Math.round(((m.emiCollected + m.firstChargeCollected) / marketTotal) * 100)) : 0;
    const fineTotal = m.fineCollected + m.fineDue;
    const finePct = fineTotal > 0 ? Math.min(100, Math.round((m.fineCollected / fineTotal) * 100)) : 0;
    return { totalCollection, marketDue, invDue, collectionPct, marketPct, finePct };
  }, [m]);

  /* Real 12-month fine-collection series (bucketed server-side by IST month). */
  const fineSeries = useMemo(() => {
    if (!m) return [];
    const out: { name: string; value: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      out.push({ name: MONTHS_SHORT[d.getMonth()], value: m.fineCollectedByMonth[key] || 0 });
    }
    return out;
  }, [m]);

  const monthDelta = monthStats && monthStats.lastYear > 0
    ? ((monthStats.collected - monthStats.lastYear) / monthStats.lastYear) * 100
    : undefined;

  /* ── Greeting (IST) ───────────────────────────────────────────────────── */
  const istHour = Number(new Date(Date.now() + 5.5 * 3600_000).getUTCHours());
  const greeting = istHour < 12 ? 'Good morning' : istHour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <motion.div className="space-y-8" variants={staggerContainer(0.06, 0.02)} initial="hidden" animate="show">

      {/* ═══ Dashboard header ═══ */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-500 dark:text-indigo-300">Reports</p>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold mt-1">
            <span className="bg-gradient-to-r from-indigo-600 via-purple-500 to-sky-500 dark:from-indigo-300 dark:via-purple-300 dark:to-sky-300 bg-clip-text text-transparent">
              {greeting}, TelePoint
            </span>{' '}
            <motion.span
              aria-hidden
              className="inline-block origin-bottom"
              animate={{ rotate: [0, 16, -6, 16, 0] }}
              transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 3.5 }}
            >👋</motion.span>
          </h1>
          <p className="text-sm text-ink-muted mt-1 flex items-center gap-2 flex-wrap">
            <Clock4 size={13} aria-hidden />
            {format(new Date(), 'EEEE, d MMMM yyyy')}
            <Chip className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-breathe" aria-hidden /> Live data
            </Chip>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshAll}
            className="inline-flex items-center gap-2 rounded-xl border border-surface-4 bg-surface px-4 py-2.5 text-xs font-bold text-ink-muted hover:text-ink hover:border-indigo-300 transition-colors shadow-sm"
          >
            <RefreshCcw size={13} className={refreshing ? 'animate-spin' : ''} aria-hidden />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ═══ KPI cards — swipeable on mobile, 4-up desktop ═══ */}
      <section aria-label="Key metrics">
        <div className="flex items-center justify-between mb-3">
          <SectionHead icon={Gauge} title="Portfolio pulse" sub="Running (active) loans — completed, settled & NPA excluded" />
        </div>
        <KpiGrid>
          <KpiCard
            loading={metricsLoading} icon={Wallet} tone="emerald"
            label="Total Collection" value={totals?.totalCollection ?? 0} format={fmt}
            formula="EMI + fine + 1st-EMI charge actually collected on the running book."
            progressPct={totals?.collectionPct} progressLabel="of expected revenue"
          />
          <KpiCard
            loading={metricsLoading} icon={HandCoins} tone="rose"
            label="Pending Collection" value={totals?.invDue ?? 0} format={fmt}
            formula="Expected revenue (all EMI + fines + charges billed) minus everything collected so far."
          />
          <KpiCard
            loading={todayCollection === null && metricsLoading} icon={IndianRupee} tone="indigo"
            label="Today's Collection" value={todayCollection?.amount ?? 0} format={fmt}
            secondary={todayCollection ? { label: 'Approved payments today', value: todayCollection.count, format: n => String(Math.round(n)) } : undefined}
            formula="Sum of payment requests approved since IST midnight."
          />
          {monthStats && (
            <KpiCard
              icon={CalendarClock} tone="sky"
              label={`${MONTHS[new Date().getMonth()]} Collection`} value={monthStats.collected} format={fmt}
              deltaPct={monthDelta} deltaLabel="vs same month last year"
              secondary={{ label: 'Same month last year', value: monthStats.lastYear, format: fmt }}
              formula="Money collected this month (EMI + fines + charges, anchored to each EMI's own collection date). Delta compares the same month last year."
            />
          )}
          <KpiCard
            loading={metricsLoading} icon={Users} tone="indigo"
            label="Active Customers" value={m?.runningCount ?? 0}
            secondary={m ? { label: 'Total customers', value: m.customerCount, format: n => String(Math.round(n)) } : undefined}
            formula="Customers whose loan is currently RUNNING; total counts every status."
          />
          <KpiCard
            loading={metricsLoading} icon={Landmark} tone="slate"
            label="Loan Amount (Running)" value={m?.loanAmount ?? 0} format={fmt}
            formula="Phone value − down payment, summed over running loans."
          />
          <KpiCard
            loading={metricsLoading} icon={PiggyBank} tone="amber"
            label="Market Due" value={totals?.marketDue ?? 0} format={fmt}
            progressPct={totals?.marketPct} progressLabel="principal recovered"
            formula="The whole running market: every EMI, fine and 1st-EMI charge — collected and still outstanding."
          />
          <KpiCard
            loading={metricsLoading} icon={BadgePercent} tone="emerald"
            label="Collection Success Rate" value={totals?.collectionPct ?? 0}
            format={n => `${Math.round(n)}%`}
            progressPct={totals?.collectionPct}
            formula="Total collection as a share of expected revenue on the running book."
          />
          <KpiCard
            loading={metricsLoading} icon={ReceiptText} tone="purple"
            label="Fine Collected" value={m?.fineCollected ?? 0} format={fmt}
            secondary={m ? { label: 'Fine still due', value: m.fineDue, format: fmt } : undefined}
            spark={fineSeries.map(p => p.value)}
            formula="Late fines actually collected (running customers). Sparkline: real monthly totals for the last 12 months."
          />
          <KpiCard
            loading={metricsLoading} icon={CalendarClock} tone="sky"
            label="Due in Next 30 Days" value={m?.upcoming30d ?? 0} format={fmt}
            formula="Unpaid EMI amounts falling due within the next 30 days."
          />
          <KpiCard
            loading={metricsLoading} icon={AlertTriangle} tone="rose"
            label="Overdue Customers" value={m?.overdueCustomers ?? 0}
            formula="Running customers with at least one EMI past its due date."
          />
          <KpiCard
            loading={metricsLoading} icon={Wallet} tone="indigo"
            label="EMI Collected" value={m?.emiCollected ?? 0} format={fmt}
            secondary={m ? { label: 'EMI still due', value: m.emiDue, format: fmt } : undefined}
            formula="EMI principal collected vs still outstanding on the running book."
          />
        </KpiGrid>
      </section>

      {/* ═══ Quick actions ═══ */}
      <QuickActions retailers={retailers} onRefreshMetrics={refreshAll} />

      {/* ═══ EMI due filters + results table ═══ */}
      <DueFilters supabase={supabase} onOpenCustomer={onOpenCustomer} />

      {/* ═══ Profit & Loss + Fine trend ═══ */}
      <ProfitAndRisk metrics={m} loading={metricsLoading} fineSeries={fineSeries} onOpenCustomer={onOpenCustomer} />

      {/* ═══ UTR / payment reference search ═══ */}
      <UtrSearch supabase={supabase} />
    </motion.div>
  );
}

/* ═════════════════════════ Quick Actions ═════════════════════════ */

function QuickActions({ retailers, onRefreshMetrics }: { retailers: Retailer[]; onRefreshMetrics: () => void }) {
  const now = new Date();
  const [sheet, setSheet] = useState<'collection' | 'payments' | null>(null);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [datePreset, setDatePreset] = useState<DateRangePreset>('this_month');
  const [customRange, setCustomRange] = useState({ from: todayIST(), to: todayIST() });
  const [retailerId, setRetailerId] = useState('');
  const [recalcing, setRecalcing] = useState(false);

  async function recalcFines() {
    setRecalcing(true);
    try {
      const res = await fetch('/api/fines/recalc', { method: 'POST' });
      const data = await readJsonSafe<{ error?: string; updated?: number }>(res) || {};
      if (!res.ok) { toast.error(data.error || 'Recalc failed'); return; }
      toast.success(`Fines updated (${data.updated ?? 0} EMIs)`);
      onRefreshMetrics();
    } catch {
      toast.error('Recalc failed');
    } finally {
      setRecalcing(false);
    }
  }

  const actions: {
    icon: typeof FileSpreadsheet; title: string; sub: string; tint: string;
    onClick?: () => void; href?: string; download?: string;
  }[] = [
    { icon: FileSpreadsheet, title: 'Collection Sheet', sub: 'Per-retailer monthly EMI sheet with fines (CSV)', tint: 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30', onClick: () => setSheet('collection') },
    { icon: ReceiptText, title: 'Payment History Report', sub: 'Every approved payment in a month, with UTR (CSV)', tint: 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/30', onClick: () => setSheet('payments') },
    { icon: FileText, title: 'All Customers (Excel)', sub: 'One workbook — Running, Complete, Settled & NPA tabs', tint: 'bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-md shadow-sky-500/30', href: '/api/export?type=all', download: 'all-customers.xlsx' },
    { icon: Download, title: 'Running Customers (CSV)', sub: 'Full dump of every active loan', tint: 'bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white shadow-md shadow-purple-500/30', href: '/api/export?type=running', download: 'customers-running.csv' },
    { icon: Download, title: 'Complete Customers (CSV)', sub: 'Every finished loan on record', tint: 'bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/30', href: '/api/export?type=complete', download: 'customers-complete.csv' },
    { icon: LifeBuoy, title: 'Full Backup', sub: 'Complete portal snapshot — every table, one file', tint: 'bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-md shadow-rose-500/30', href: '/api/admin/full-backup' },
    { icon: RefreshCcw, title: recalcing ? 'Recalculating…' : 'Recalculate Fines', sub: 'Re-run the fine engine across all unpaid EMIs', tint: 'bg-gradient-to-br from-slate-500 to-slate-600 text-white shadow-md shadow-slate-500/30', onClick: recalcFines },
  ];

  return (
    <section aria-label="Quick actions">
      <div className="mb-3">
        <SectionHead
          icon={ArrowRight} title="Quick actions"
          sub="Reports, exports and maintenance — every button is wired to a live endpoint"
          tint="text-white bg-gradient-to-br from-sky-500 to-cyan-500 shadow-md shadow-sky-500/30"
        />
      </div>
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 keep-cols">
        {actions.map(a => {
          const Icon = a.icon;
          const inner = (
            <>
              <span className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110', a.tint)}>
                <Icon size={18} strokeWidth={2.1} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold text-ink leading-tight">{a.title}</span>
                <span className="block text-[11px] text-ink-muted mt-0.5 leading-snug">{a.sub}</span>
              </span>
            </>
          );
          const cls = 'group flex items-start gap-3 rounded-[18px] border border-surface-4/80 bg-surface p-4 text-left shadow-card transition-all hover:shadow-card-hover hover:-translate-y-0.5 hover:border-indigo-300 dark:border-surface-3 dark:hover:border-indigo-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 whitespace-normal';
          return a.href
            ? <a key={a.title} href={a.href} download={a.download} className={cls}>{inner}</a>
            : <button key={a.title} onClick={a.onClick} disabled={a.title.includes('Recalculating')} className={cls}>{inner}</button>;
        })}
      </div>

      {/* Parameter sheet for the two month-scoped reports */}
      <BottomSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={sheet === 'collection' ? 'Monthly EMI Collection Sheet' : 'Month-wise Payment Collection Report'}
      >
        <div className="space-y-4">
          <p className="text-xs text-ink-muted leading-relaxed">
            {sheet === 'collection'
              ? 'Per-retailer EMI collection sheet with Fine Due. Leave retailer as “All” to download all retailers in one file.'
              : 'One row per approved payment collected in the chosen month — EMI, fine & 1st-EMI-charge breakup, payment date/time, method and UPI UTR.'}
          </p>
          <div>
            <label className="label" htmlFor="qa-retailer">Retailer</label>
            <select id="qa-retailer" value={retailerId} onChange={e => setRetailerId(e.target.value)} className="input">
              <option value="">All Retailers</option>
              {(sheet === 'collection' ? retailers.filter(r => r.is_active) : retailers).map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          {sheet === 'collection' ? (
            <div className="grid grid-cols-2 gap-3 keep-cols">
              <div>
                <label className="label" htmlFor="qa-month">Month</label>
                <select id="qa-month" value={month} onChange={e => setMonth(Number(e.target.value))} className="input">
                  {MONTHS.map((mn, i) => <option key={mn} value={i + 1}>{mn}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="qa-year">Year</label>
                <select id="qa-year" value={year} onChange={e => setYear(Number(e.target.value))} className="input">
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div>
              <label className="label mb-2">Date Range</label>
              <DateFilterBar
                value={datePreset}
                onChange={p => {
                  setDatePreset(p);
                  if (p !== 'custom') setCustomRange(istDateRange(p));
                }}
                customRange={customRange}
                onCustomChange={setCustomRange}
              />
            </div>
          )}
          <a
            href={
              sheet === 'collection'
                ? `/api/export/collection?month=${month}&year=${year}` + (retailerId ? `&retailer_id=${retailerId}` : '')
                : `/api/report/payment-collection?from=${customRange.from}&to=${customRange.to}` + (retailerId ? `&retailer_id=${retailerId}` : '')
            }
            download
            onClick={() => setSheet(null)}
            className="btn-primary w-full"
          >
            <Download size={14} aria-hidden /> Download CSV
          </a>
        </div>
      </BottomSheet>
    </section>
  );
}

/* ═════════════════════════ EMI due filters ═════════════════════════ */

function DueFilters({
  supabase, onOpenCustomer,
}: {
  supabase: ReturnType<typeof createClient>;
  onOpenCustomer: (customerId: string) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [rows, setRows] = useState<FilteredEMI[] | null>(null);
  const [loading, setLoading] = useState(false);

  /* Identical query logic to the original loadFilter — moved, not modified. */
  const loadFilter = useCallback(async (filterKey: string, days?: number, months?: number) => {
    setActiveFilter(filterKey);
    setRows(null);
    setLoading(true);
    try {
      let query = supabase
        .from('emi_schedule')
        .select(`
          id, emi_no, due_date, amount, status, fine_amount, fine_waived,
          customer:customers(id, customer_name, imei, mobile, retailer:retailers(name))
        `)
        .in('status', ['UNPAID', 'PARTIALLY_PAID']);

      const today = new Date();

      if (filterKey === 'fine_only') {
        query = query.gt('fine_amount', 0).eq('fine_waived', false);
      } else if (filterKey === 'first_emi_due') {
        query = query.eq('emi_no', 1);
      } else if (filterKey === 'first_emi_charge_due') {
        const { data: cc, error: ccErr } = await supabase
          .from('customers')
          .select('id, customer_name, imei, mobile, first_emi_charge_amount, first_emi_charge_paid_amount, first_emi_charge_paid_at, retailer:retailers(name)')
          .gt('first_emi_charge_amount', 0)
          .is('first_emi_charge_paid_at', null)
          .eq('status', 'RUNNING');
        if (ccErr) { toast.error(ccErr.message); setRows([]); setLoading(false); return; }
        const mappedCharge: FilteredEMI[] = (cc ?? []).map((r) => {
          const row = (r ?? {}) as Record<string, unknown>;
          const retailer = (row.retailer ?? null) as { name?: string } | null;
          // Remaining balance after any partial first-charge payments.
          const remainingCharge = firstChargeRemaining(row as never);
          return {
            id: (row.id as string) ?? '',
            emi_no: 0,
            due_date: '',
            amount: remainingCharge,
            status: 'CHARGE_DUE',
            fine_amount: 0,
            customer_name: (row.customer_name as string) ?? '',
            imei: (row.imei as string) ?? '',
            mobile: (row.mobile as string) ?? '',
            retailer_name: retailer?.name ?? '',
            customer_id: (row.id as string) ?? '',
          };
        });
        setRows(mappedCharge);
        setLoading(false);
        return;
      } else if (days) {
        const target = addDays(today, days).toISOString().split('T')[0];
        query = query.lte('due_date', target).gte('due_date', today.toISOString().split('T')[0]);
      } else if (months) {
        const cutoff = subMonths(today, months).toISOString().split('T')[0];
        query = query.lt('due_date', cutoff);
      }

      const { data, error } = await query.order('due_date').limit(100);
      if (error) { toast.error(error.message); return; }

      const mapped: FilteredEMI[] = (data || []).map((row: Record<string, unknown>) => {
        const cust = row.customer as Record<string, unknown> | null;
        return {
          id: row.id as string,
          emi_no: row.emi_no as number,
          due_date: row.due_date as string,
          amount: row.amount as number,
          status: row.status as string,
          fine_amount: (row.fine_amount as number) || 0,
          customer_name: (cust?.customer_name as string) || '',
          imei: (cust?.imei as string) || '',
          mobile: (cust?.mobile as string) || '',
          retailer_name: ((cust?.retailer as { name?: string } | null)?.name) || '',
          customer_id: (cust?.id as string) || '',
        };
      });
      setRows(mapped);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const columns: Column<FilteredEMI>[] = useMemo(() => [
    { key: 'customer', header: 'Customer', accessor: r => r.customer_name },
    { key: 'imei', header: 'IMEI', accessor: r => r.imei, numeric: true, hideOnCard: false },
    { key: 'mobile', header: 'Mobile', accessor: r => r.mobile, numeric: true },
    { key: 'retailer', header: 'Retailer', accessor: r => r.retailer_name },
    {
      key: 'emi_no', header: 'EMI #', accessor: r => r.emi_no, numeric: true,
      cell: r => r.status === 'CHARGE_DUE' ? <span className="badge-yellow">1st Charge</span> : <span className="num">#{r.emi_no}</span>,
    },
    {
      key: 'due', header: 'Due Date', accessor: r => r.due_date,
      cell: r => {
        if (!r.due_date) return <span className="text-ink-muted">—</span>;
        const d = new Date(r.due_date);
        if (Number.isNaN(d.getTime())) return <span className="text-ink-muted">—</span>;
        const overdue = d < new Date();
        return (
          <span className={cn('num text-xs', overdue ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-ink-muted')}>
            {format(d, 'd MMM yyyy')}
          </span>
        );
      },
    },
    { key: 'amount', header: 'Amount', accessor: r => r.amount, align: 'right', numeric: true, cell: r => <span className="num font-semibold">{fmt(r.amount)}</span> },
    {
      key: 'fine', header: 'Fine', accessor: r => r.fine_amount, align: 'right', numeric: true,
      cell: r => r.fine_amount > 0
        ? <span className="num text-rose-600 dark:text-rose-400 font-bold text-xs">{fmt(r.fine_amount)}</span>
        : <span className="text-ink-muted text-xs">—</span>,
    },
  ], []);

  const chip = (key: string, label: string, danger = false) => (
    <button
      key={key}
      onClick={() => loadFilter(
        key,
        key.startsWith('upcoming_') ? Number(key.split('_')[1]) : undefined,
        key.startsWith('months_') ? Number(key.split('_')[1]) : undefined,
      )}
      aria-pressed={activeFilter === key}
      className={cn(
        'rounded-xl border px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-all',
        activeFilter === key
          ? danger
            ? 'border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300 shadow-sm'
            : 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300 shadow-sm'
          : 'border-surface-4 bg-surface text-ink-muted hover:text-ink hover:border-indigo-300',
      )}
    >
      {label}
    </button>
  );

  return (
    <section aria-label="EMI due filters">
      <Panel className="p-5 sm:p-6" animate={false}>
        <SectionHead
          icon={Filter} title="Collection radar" sub="Slice the unpaid book by due window, overdue age or pending fines"
          tint="text-white bg-gradient-to-br from-amber-500 to-orange-500 shadow-md shadow-amber-500/30"
          right={activeFilter && (
            <button
              onClick={() => { setActiveFilter(null); setRows(null); }}
              className="text-xs font-semibold text-ink-muted hover:text-ink underline underline-offset-4"
            >
              Clear
            </button>
          )}
        />

        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            <span className="text-[10px] font-bold uppercase tracking-widest text-ink-muted shrink-0">Upcoming</span>
            {[5, 10, 15, 20, 25, 30].map(d => chip(`upcoming_${d}`, `Next ${d} days`))}
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            <span className="text-[10px] font-bold uppercase tracking-widest text-ink-muted shrink-0">Overdue</span>
            {[2, 3, 4, 5].map(mo => chip(`months_${mo}`, `${mo}+ months`, true))}
            {chip('fine_only', 'Fine due only', true)}
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            <span className="text-[10px] font-bold uppercase tracking-widest text-ink-muted shrink-0">Special</span>
            {chip('first_emi_due', '1st EMI due')}
            {chip('first_emi_charge_due', '1st charge due')}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {loading && (
            <motion.div key="load" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-5 space-y-2">
              {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-11 w-full rounded-xl" />)}
            </motion.div>
          )}
          {!loading && rows !== null && (
            <motion.div key={activeFilter} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5">
              <DataTablePro
                rows={rows}
                columns={columns}
                rowKey={r => r.id || `${r.customer_id}-${r.emi_no}`}
                title={`${rows.length} EMIs found`}
                exportName={`filter_${activeFilter}`}
                pageSize={10}
                onRowClick={r => r.customer_id && onOpenCustomer(r.customer_id)}
                emptyText="No EMIs match this filter."
              />
            </motion.div>
          )}
          {!loading && rows === null && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <EmptyState icon={Filter} title="Pick a filter to scan the book" sub="Results appear here with search, sorting and CSV export. Tap a row to open the customer." />
            </motion.div>
          )}
        </AnimatePresence>
      </Panel>
    </section>
  );
}

/* ═════════════════════════ P&L + fine trend + expected loss ═════════════ */

function ProfitAndRisk({
  metrics, loading, fineSeries, onOpenCustomer,
}: {
  metrics: PortfolioMetrics | null;
  loading: boolean;
  fineSeries: { name: string; value: number }[];
  onOpenCustomer: (customerId: string) => void;
}) {
  const [plYear, setPlYear] = useState<string>(String(new Date().getFullYear()));
  const [showEl, setShowEl] = useState(false);
  const [elRows, setElRows] = useState<ExpectedLossCustomer[] | null>(null);
  const [elLoading, setElLoading] = useState(false);

  const profitBy = metrics?.profitByYear ?? {};
  const lossBy = metrics?.lossBookedByYear ?? {};
  const years = useMemo(() => {
    const nowY = String(new Date().getFullYear());
    return Array.from(new Set([nowY, ...Object.keys(profitBy), ...Object.keys(lossBy)]))
      .filter(y => y !== 'unknown')
      .sort((a, b) => Number(a) - Number(b));
  }, [profitBy, lossBy]);

  const chartData = years.map(y => ({
    name: y,
    profit: profitBy[y]?.amount ?? 0,
    loss: lossBy[y]?.amount ?? 0,
  }));
  const yP = profitBy[plYear] || { amount: 0, count: 0 };
  const yL = lossBy[plYear] || { amount: 0, count: 0 };
  const net = yP.amount - yL.amount;

  const toggleEl = useCallback(async () => {
    const next = !showEl;
    setShowEl(next);
    if (next && elRows === null && !elLoading) {
      setElLoading(true);
      try {
        const res = await fetch('/api/admin/expected-loss', { cache: 'no-store' });
        if (!res.ok) {
          const e = await readJsonSafe<{ error?: string }>(res);
          throw new Error(e?.error || `Expected-loss list failed (${res.status})`);
        }
        const d = await res.json();
        setElRows(d.rows ?? []);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not load expected-loss customers');
        setShowEl(false);
      } finally {
        setElLoading(false);
      }
    }
  }, [showEl, elRows, elLoading]);

  const elColumns: Column<ExpectedLossCustomer>[] = useMemo(() => [
    { key: 'name', header: 'Customer', accessor: r => r.name },
    { key: 'mobile', header: 'Mobile', accessor: r => r.mobile, numeric: true },
    { key: 'retailer', header: 'Retailer', accessor: r => r.retailerName },
    {
      key: 'overdue', header: 'Overdue', accessor: r => r.daysOverdue, align: 'right', numeric: true,
      cell: r => (
        <span className={cn(
          'inline-flex rounded-lg px-2 py-0.5 text-[11px] font-extrabold num',
          r.daysOverdue >= 180
            ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
            : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
        )}>
          {r.daysOverdue}d
        </span>
      ),
    },
    {
      key: 'since', header: 'Oldest Due', accessor: r => r.oldestDueDate,
      cell: r => <span className="num text-xs text-ink-muted">{r.oldestDueDate ? format(new Date(r.oldestDueDate), 'd MMM yy') : '—'}</span>,
    },
    { key: 'due', header: 'EMI Due', accessor: r => r.emiDue, align: 'right', numeric: true, cell: r => <span className="num font-bold text-rose-600 dark:text-rose-400">{fmt(r.emiDue)}</span> },
  ], []);

  return (
    <section aria-label="Profit, loss and risk" className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
      {/* P&L */}
      <Panel className="p-5 sm:p-6">
        <SectionHead
          icon={Landmark} title="Profit & Loss — year-wise"
          sub="Profit: completed customers (collected − loan value) · Loss: NPA + settled"
          tint="text-white bg-gradient-to-br from-emerald-500 to-teal-500 shadow-md shadow-emerald-500/30"
          right={
            <select
              value={plYear} onChange={e => setPlYear(e.target.value)}
              className="input !w-auto !py-1.5 text-sm" aria-label="Profit and loss year"
            >
              {[...years].reverse().map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          }
        />
        {loading ? (
          <Skeleton className="h-56 w-full rounded-xl mt-4" />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2.5 mt-4 keep-cols">
              <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10 p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Profit {plYear}</p>
                <p className="num text-lg font-extrabold text-emerald-700 dark:text-emerald-300 mt-0.5">{fmt(yP.amount)}</p>
                <p className="text-[10px] text-ink-muted mt-0.5">{yP.count} completed</p>
              </div>
              <div className="rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/60 dark:bg-rose-500/10 p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-rose-700 dark:text-rose-300">Loss {plYear}</p>
                <p className="num text-lg font-extrabold text-rose-700 dark:text-rose-300 mt-0.5">{fmt(yL.amount)}</p>
                <p className="text-[10px] text-ink-muted mt-0.5">{yL.count} accounts</p>
              </div>
              <div className={cn(
                'rounded-2xl border p-3',
                net >= 0
                  ? 'border-teal-200 dark:border-teal-500/30 bg-teal-50/60 dark:bg-teal-500/10'
                  : 'border-rose-200 dark:border-rose-500/30 bg-rose-50/60 dark:bg-rose-500/10',
              )}>
                <p className={cn('text-[10px] font-bold uppercase tracking-widest', net >= 0 ? 'text-teal-700 dark:text-teal-300' : 'text-rose-700 dark:text-rose-300')}>Net {plYear}</p>
                <p className={cn('num text-lg font-extrabold mt-0.5', net >= 0 ? 'text-teal-700 dark:text-teal-300' : 'text-rose-700 dark:text-rose-300')}>{fmt(net)}</p>
                <p className="text-[10px] text-ink-muted mt-0.5">Profit − loss</p>
              </div>
            </div>
            <div className="mt-4">
              <ProfitLossBars data={chartData} format={fmtShort} />
            </div>
          </>
        )}
      </Panel>

      <div className="space-y-4">
        {/* Fine collection trend */}
        <Panel className="p-5 sm:p-6">
          <SectionHead
            icon={ReceiptText} title="Fine collection trend"
            sub="Late-fine money actually collected, by IST month of approval — last 12 months"
            tint="text-white bg-gradient-to-br from-purple-500 to-fuchsia-600 shadow-md shadow-purple-500/30"
          />
          {loading
            ? <Skeleton className="h-56 w-full rounded-xl mt-4" />
            : <div className="mt-4"><TrendArea data={fineSeries} format={fmtShort} color="#a855f7" /></div>}
        </Panel>

        {/* Expected loss */}
        <Panel className="overflow-hidden">
          <button
            onClick={toggleEl}
            aria-expanded={showEl}
            className="w-full flex flex-wrap items-center justify-between gap-3 p-5 text-left hover:bg-surface-2/60 transition-colors whitespace-normal"
          >
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/30 flex items-center justify-center">
                <ShieldAlert size={18} aria-hidden />
              </span>
              <div>
                <p className="text-base font-bold text-ink">Expected loss (live)</p>
                <p className="text-xs text-ink-muted">Running customers with an EMI unpaid over 3 months</p>
              </div>
            </div>
            <div className="flex items-center gap-5 ml-auto">
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">Accounts</p>
                <p className="num text-lg font-extrabold text-amber-600 dark:text-amber-300">{metrics?.expectedLossCount ?? 0}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">EMI Due</p>
                <p className="num text-lg font-extrabold text-amber-600 dark:text-amber-300">{fmt(metrics?.expectedLossEmiDue ?? 0)}</p>
              </div>
              <motion.span animate={{ rotate: showEl ? 180 : 0 }} className="text-ink-muted" aria-hidden>▾</motion.span>
            </div>
          </button>
          <AnimatePresence initial={false}>
            {showEl && (
              <motion.div
                key="el"
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4">
                  {elLoading ? (
                    <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
                  ) : !elRows || elRows.length === 0 ? (
                    <EmptyState icon={ShieldAlert} title="No expected-loss customers" sub="The running book is healthy — no EMI unpaid beyond 3 months." />
                  ) : (
                    <DataTablePro
                      rows={elRows}
                      columns={elColumns}
                      rowKey={r => r.customerId}
                      exportName="expected_loss_customers"
                      pageSize={8}
                      onRowClick={r => onOpenCustomer(r.customerId)}
                      cardTitle={r => r.name}
                    />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Panel>
      </div>
    </section>
  );
}

/* ═════════════════════════ UTR search ═════════════════════════ */

function UtrSearch({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PaymentRequest[] | null>(null);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async () => {
    if (!query.trim()) { setResults(null); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from('payment_requests')
        .select('*, customer:customers(customer_name, imei, mobile), retailer:retailers(name)')
        .or(`utr.ilike.%${query.trim()}%,notes.ilike.%${query.trim()}%`)
        .order('created_at', { ascending: false })
        .limit(20);
      setResults((data as PaymentRequest[]) || []);
    } finally {
      setLoading(false);
    }
  }, [query, supabase]);

  useEffect(() => {
    search();
  }, [search]);

  const columns: Column<PaymentRequest>[] = useMemo(() => [
    {
      key: 'customer', header: 'Customer',
      accessor: r => (r.customer as { customer_name?: string } | null)?.customer_name || '—',
      cell: r => {
        const cust = r.customer as { customer_name?: string; imei?: string } | null;
        return (
          <span>
            <span className="block font-medium text-ink">{cust?.customer_name || '—'}</span>
            <span className="block num text-[10px] text-ink-muted">{cust?.imei || ''}</span>
          </span>
        );
      },
    },
    { key: 'amount', header: 'Amount', accessor: r => r.total_amount, align: 'right', numeric: true, cell: r => <span className="num font-bold">{fmt(r.total_amount)}</span> },
    {
      key: 'mode', header: 'Mode', accessor: r => r.mode,
      cell: r => <span className={cn('text-xs font-bold', r.mode === 'UPI' ? 'text-sky-600 dark:text-sky-400' : 'text-emerald-600 dark:text-emerald-400')}>{r.mode}</span>,
    },
    {
      key: 'status', header: 'Status', accessor: r => r.status,
      cell: r => r.status === 'PENDING' ? <span className="badge-pending">Pending</span>
        : r.status === 'APPROVED' ? <span className="badge-approved">Approved</span>
        : <span className="badge-rejected">Rejected</span>,
    },
    { key: 'date', header: 'Date', accessor: r => r.created_at, cell: r => <span className="num text-xs text-ink-muted">{format(new Date(r.created_at), 'd MMM yyyy')}</span> },
    { key: 'notes', header: 'Notes', accessor: r => r.notes || '', cell: r => <span className="text-xs text-ink-muted block max-w-[180px] truncate">{r.notes || '—'}</span>, hideOnCard: true },
  ], []);

  return (
    <section aria-label="Payment search">
      <Panel className="p-5 sm:p-6" animate={false}>
        <SectionHead
          icon={Search} title="Find a payment"
          sub="Look up any payment by UTR number, reference or note"
          tint="text-white bg-gradient-to-br from-sky-500 to-cyan-500 shadow-md shadow-sky-500/30"
        />
        <div className="mt-4 flex gap-2">
          <SearchInput
            value={query}
            onChange={val => {
              setQuery(val);
              // Small hack to auto-search on typing but delay a bit
            }}
            placeholder="UTR number, reference or payment note…"
            className="flex-1"
          />
          <button onClick={search} disabled={loading} className="btn-primary shrink-0">
            <Search size={14} aria-hidden />
            <span className="hidden sm:inline">{loading ? 'Searching…' : 'Search'}</span>
          </button>
        </div>
        {results !== null && (
          <div className="mt-4">
            {results.length === 0
              ? <EmptyState icon={Search} title="No payments found" sub="Try a different UTR or reference." />
              : (
                <DataTablePro
                  rows={results}
                  columns={columns}
                  rowKey={r => r.id}
                  searchable={false}
                  pageSize={10}
                  cardTitle={r => (r.customer as { customer_name?: string } | null)?.customer_name || '—'}
                />
              )}
          </div>
        )}
      </Panel>
    </section>
  );
}
