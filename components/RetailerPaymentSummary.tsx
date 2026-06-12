'use client';

/**
 * Consolidated payment summary for an entire retailer's portfolio.
 *
 * Shown:
 *   • Retailer page (own data) for the logged-in retailer.
 *   • Admin Retailers tab (any retailer drill-down) via the same component.
 *
 * Aggregates RUNNING loans only (terminal COMPLETE/SETTLED/NPA accounts are
 * excluded by /api/metrics) — the same scope rule used by the Live DB Metric
 * Dashboard so the numbers are reconcilable across surfaces.
 */

import { useEffect, useState, useCallback } from 'react';
import { formatCurrency } from '@/lib/formatters';
import { motion } from 'framer-motion';
import CountUp from '@/components/motion/CountUp';
import { SPRING, fadeUp, staggerContainer } from '@/lib/motion';

// Per-tile entrance for the metric grids.
const tileItem = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: SPRING },
};

interface Props {
  retailerId: string;
  retailerName?: string;
  baseFine: number;
  weeklyIncrement: number;
  /** When true, the "Loan Book" tile is hidden (retailer view — super admin only). */
  hideLoanAmount?: boolean;
}

interface Totals {
  customerCount: number;
  runningCount: number;
  loanAmount: number;
  collected: number;
  emiDue: number;
  fineDue: number;
  fineCollected: number;
  firstChargeDue: number;
  firstChargeCollected: number;
  upcoming30d: number;
  overdueCustomers: number;
}

const fmt = formatCurrency;

export default function RetailerPaymentSummary({ retailerId, retailerName, baseFine, weeklyIncrement, hideLoanAmount = false }: Props) {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Computed server-side over the retailer's ENTIRE portfolio (service
      // client — no RLS, no 1000-row truncation, no URL-length limit). The old
      // in-browser scan of a 1000+ customer retailer like MAMA TELECOM read a
      // truncated slice and produced wrong totals. Now we just render the result.
      const res = await fetch(`/api/metrics?retailer_id=${encodeURIComponent(retailerId)}`, { cache: 'no-store' });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        throw new Error(e?.error || `Summary failed (${res.status})`);
      }
      const d = await res.json();
      setTotals({
        customerCount: d.customerCount,
        runningCount: d.runningCount,
        loanAmount: d.loanAmount,
        collected: d.emiCollected,
        emiDue: d.emiDue,
        fineDue: d.fineDue,
        fineCollected: d.fineCollected,
        firstChargeDue: d.firstChargeDue,
        firstChargeCollected: d.firstChargeCollected,
        upcoming30d: d.upcoming30d,
        overdueCustomers: d.overdueCustomers,
      });
    } catch {
      setTotals(null);
    } finally {
      setLoading(false);
    }
  }, [retailerId]);

  useEffect(() => { load(); }, [load]);

  const t = totals ?? {
    customerCount: 0, runningCount: 0, loanAmount: 0, collected: 0,
    emiDue: 0, fineDue: 0, fineCollected: 0, firstChargeDue: 0, firstChargeCollected: 0,
    upcoming30d: 0, overdueCustomers: 0,
  };
  // Whole billed book: every EMI instalment (paid + due — EMIs can carry
  // markup over the financed principal, so NOT loanAmount) + every fine +
  // every 1st EMI charge. Mirrors the Live DB dashboard's Expected Revenue.
  const totalRevenueExpected =
    t.collected + t.emiDue + t.fineDue + t.fineCollected + t.firstChargeDue + t.firstChargeCollected;
  const totalRevenueCollected = t.collected + t.fineCollected + t.firstChargeCollected;
  const collectionPct = totalRevenueExpected > 0
    ? Math.min(100, Math.round((totalRevenueCollected / totalRevenueExpected) * 100))
    : 0;

  return (
    <motion.div
      className="card overflow-hidden border-l-4 border-brand-500 shadow-md"
      variants={fadeUp} initial="hidden" animate="show"
    >
      <div className="bg-gradient-to-r from-brand-600 via-amber-500 to-rose-500 text-white px-5 py-3 flex items-center justify-between sheen-track">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">Retailer Collection Summary</p>
          <p className="text-sm font-bold mt-0.5">{retailerName || 'My Portfolio'}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-white/80 uppercase">Active Loans</p>
          <p className="num text-xl font-extrabold">
            <CountUp value={t.runningCount} duration={0.8} />/{t.customerCount}
          </p>
        </div>
        <motion.button
          onClick={load} whileHover={{ rotate: 90 }} whileTap={{ scale: 0.85 }}
          className="text-[10px] underline underline-offset-2 ml-3"
        >
          {loading ? '…' : '↻'}
        </motion.button>
      </div>

      <motion.div
        className={`grid grid-cols-2 ${hideLoanAmount ? 'md:grid-cols-3' : 'md:grid-cols-4'} gap-px bg-surface-4`}
        variants={staggerContainer(0.07, 0.05)} initial="hidden" animate="show"
      >
        {!hideLoanAmount && (
          <Tile tint="violet" emoji="💰" label="Loan Book" value={fmt(t.loanAmount)} sub="Total disbursed (active)" />
        )}
        <Tile tint="emerald" emoji="✓" label="Collected" value={fmt(totalRevenueCollected)} sub="EMI + Fines + 1st Charge" />
        <Tile tint={t.emiDue > 0 ? 'rose' : 'emerald'} emoji="⏳" label="EMI Due" value={fmt(t.emiDue)} sub={`${t.overdueCustomers} customer${t.overdueCustomers === 1 ? '' : 's'} overdue`} />
        <Tile tint={t.fineDue > 0 ? 'rose' : 'emerald'} emoji="⚠" label="Fine Due" value={fmt(t.fineDue)} sub={`Paid ${fmt(t.fineCollected)} so far`} />
      </motion.div>

      <motion.div
        className="grid grid-cols-1 md:grid-cols-3 gap-px bg-surface-4"
        variants={staggerContainer(0.07, 0.05)} initial="hidden" animate="show"
      >
        <Tile tint="amber" emoji="⭐" label="1st Charge Due" value={fmt(t.firstChargeDue)} sub="Pending one-time charge" />
        <Tile tint="indigo" emoji="📅" label="Next 30 Days" value={fmt(t.upcoming30d)} sub="Upcoming collections" />
        <Tile tint="sky" emoji="📊" label="Collection %" value={`${collectionPct}%`} sub="Revenue captured" />
      </motion.div>

      <div className="px-5 py-3 bg-white">
        <div className="flex justify-between items-end mb-2">
          <p className="text-[11px] uppercase tracking-widest text-ink-muted font-semibold">Portfolio Health</p>
          <p className="num text-sm font-bold text-emerald-700">
            <CountUp value={collectionPct} format={(n) => `${Math.round(n)}%`} duration={0.9} />
          </p>
        </div>
        <div className="h-2.5 bg-surface-4 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500"
            initial={{ width: 0 }}
            animate={{ width: `${collectionPct}%` }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
          />
        </div>
      </div>
    </motion.div>
  );
}

function Tile({ tint, emoji, label, value, sub }: {
  tint: 'indigo' | 'amber' | 'violet' | 'emerald' | 'sky' | 'rose';
  emoji: string; label: string; value: string; sub?: string;
}) {
  const bg: Record<string, string> = {
    indigo: 'bg-indigo-50', amber: 'bg-amber-50', violet: 'bg-violet-50',
    emerald: 'bg-emerald-50', sky: 'bg-sky-50', rose: 'bg-rose-50',
  };
  const label$: Record<string, string> = {
    indigo: 'text-indigo-700', amber: 'text-amber-700', violet: 'text-violet-700',
    emerald: 'text-emerald-700', sky: 'text-sky-700', rose: 'text-rose-700',
  };
  const value$: Record<string, string> = {
    indigo: 'text-indigo-900', amber: 'text-amber-900', violet: 'text-violet-900',
    emerald: 'text-emerald-900', sky: 'text-sky-900', rose: 'text-rose-900',
  };
  return (
    <motion.div variants={tileItem} className={`${bg[tint]} px-4 py-3`}>
      <p className={`text-[10px] ${label$[tint]} uppercase tracking-wide font-bold flex items-center gap-1`}>
        <span>{emoji}</span> {label}
      </p>
      <p className={`num font-bold text-lg ${value$[tint]} mt-1`}>{value}</p>
      {sub && <p className={`text-[10px] ${label$[tint]} opacity-80 mt-0.5`}>{sub}</p>}
    </motion.div>
  );
}
