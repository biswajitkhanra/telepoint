'use client';

/**
 * RetailerDeficitPanel
 *
 * Professional dashboard panel for the Retailer-wise Investment Recovery /
 * Deficit Checklist. Sourced from GET /api/admin/retailer-summary.
 *
 * Features:
 *   - Grand-total summary stat cards
 *   - Toggle between Card view (mobile-first) and Table view (desktop)
 *   - Color-coded deficit (red = loss, green = surplus)
 *   - Customer-count chips per retailer
 *   - Progress bar: collected vs loan given
 *   - Search / filter by retailer name
 *   - Sort by deficit, loan given, collected, or customer count
 *   - CSV export
 *   - Loading skeleton, empty state, error state, retry
 *   - Refresh button
 */

import { useCallback, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Store, TrendingDown, TrendingUp, RefreshCcw,
  Download, LayoutGrid, Table2, ChevronUp, ChevronDown,
  CheckCircle2, AlertTriangle, XCircle, Clock,
} from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/cn';
import { Panel, SectionHead, Chip, EmptyState, Skeleton } from '@/components/ui/primitives';
import { SearchInput } from '@/components/ui/SearchInput';
import type { RetailerSummaryRow } from '@/app/api/admin/retailer-summary/route';

const fmt = formatCurrency;

type SortKey = 'deficit' | 'loanGiven' | 'totalCollected' | 'runningCount' | 'name';
type SortDir = 'asc' | 'desc';
type ViewMode = 'card' | 'table';

const SORT_LABELS: Record<SortKey, string> = {
  deficit: 'Deficit',
  loanGiven: 'Loan',
  totalCollected: 'Collected',
  runningCount: 'Running',
  name: 'Name',
};

function fmtShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 10_000_000) return `${sign}${(abs / 10_000_000).toFixed(1)}Cr`;
  if (abs >= 100_000) return `${sign}${(abs / 100_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}k`;
  return fmt(n);
}

function DeficitBadge({ value }: { value: number }) {
  if (value > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-extrabold bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30">
        <TrendingDown size={11} aria-hidden /> {fmtShort(value)}
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-extrabold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
        <TrendingUp size={11} aria-hidden /> {fmtShort(Math.abs(value))} surplus
      </span>
    );
  }
  return <span className="text-xs text-ink-muted">—</span>;
}

function SortBtn({ label, sortKey, current, dir, onSort }: {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={cn(
        'flex items-center gap-0.5 font-bold text-[11px] uppercase tracking-widest transition-colors whitespace-nowrap',
        active ? 'text-indigo-600 dark:text-indigo-300' : 'text-ink-muted hover:text-ink',
      )}
    >
      {label}
      {active
        ? (dir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />)
        : <ChevronDown size={12} className="opacity-30" />}
    </button>
  );
}

function exportCSV(rows: RetailerSummaryRow[]) {
  const headers = [
    'Retailer', 'Status', 'Running', 'NPA', 'Settled', 'Completed',
    'Loan Given', 'EMI Collected', 'Fine Collected', '1st Charge', 'Total Collected', 'Deficit',
  ];
  const lines = rows.map(r => [
    `"${r.name}"`,
    r.isActive ? 'Active' : 'Inactive',
    r.runningCount, r.npaCount, r.settledCount, r.completedCount,
    r.loanGiven.toFixed(0), r.emiCollected.toFixed(0),
    r.fineCollected.toFixed(0), r.firstChargeCollected.toFixed(0),
    r.totalCollected.toFixed(0), r.deficit.toFixed(0),
  ].join(','));
  const csv = [headers.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `retailer_deficit_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RetailerDeficitPanel() {
  const [rows, setRows] = useState<RetailerSummaryRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('deficit');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [view, setView] = useState<ViewMode>('card');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/retailer-summary', { cache: 'no-store' });
      if (!res.ok) {
        const e = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(e?.error || `Failed to load retailer data (${res.status})`);
      }
      const data = await res.json() as { rows: RetailerSummaryRow[] };
      setRows(data.rows ?? []);
      setLoaded(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.toLowerCase();
    const f = q ? rows.filter(r => r.name.toLowerCase().includes(q)) : rows;
    return [...f].sort((a, b) => {
      if (sortKey === 'name') {
        return sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      const va = (a as unknown as Record<string, number>)[sortKey] ?? 0;
      const vb = (b as unknown as Record<string, number>)[sortKey] ?? 0;
      return sortDir === 'desc' ? vb - va : va - vb;
    });
  }, [rows, search, sortKey, sortDir]);

  const totals = useMemo(() => {
    if (!rows) return null;
    return {
      loanGiven: rows.reduce((s, r) => s + r.loanGiven, 0),
      totalCollected: rows.reduce((s, r) => s + r.totalCollected, 0),
      deficit: rows.reduce((s, r) => s + r.deficit, 0),
      retailers: rows.length,
      running: rows.reduce((s, r) => s + r.runningCount, 0),
    };
  }, [rows]);

  return (
    <section aria-label="Retailer deficit checklist">
      <Panel className="overflow-hidden">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6 border-b border-surface-4">
          <SectionHead
            icon={Store}
            title="Retailer-wise deficit checklist"
            sub="Investment recovery status across every retailer — loan given vs money collected"
            tint="text-white bg-gradient-to-br from-violet-500 to-purple-600 shadow-md shadow-violet-500/30"
          />
          <div className="flex items-center gap-2 flex-wrap">
            {loaded && rows && rows.length > 0 && (
              <>
                {/* View toggle */}
                <div className="flex rounded-xl border border-surface-4 overflow-hidden">
                  <button
                    onClick={() => setView('card')}
                    title="Card view"
                    className={cn('px-2.5 py-1.5 text-xs transition-colors', view === 'card' ? 'bg-indigo-600 text-white' : 'text-ink-muted hover:text-ink')}
                  >
                    <LayoutGrid size={14} aria-hidden />
                  </button>
                  <button
                    onClick={() => setView('table')}
                    title="Table view"
                    className={cn('px-2.5 py-1.5 text-xs transition-colors', view === 'table' ? 'bg-indigo-600 text-white' : 'text-ink-muted hover:text-ink')}
                  >
                    <Table2 size={14} aria-hidden />
                  </button>
                </div>
                <button onClick={() => exportCSV(filtered)} className="btn-secondary !py-1.5 !px-3 !text-xs">
                  <Download size={13} aria-hidden /> Export
                </button>
              </>
            )}
            <button
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-surface-4 bg-surface px-4 py-2 text-xs font-bold text-ink-muted hover:text-ink hover:border-indigo-300 transition-colors shadow-sm"
            >
              <RefreshCcw size={13} className={loading ? 'animate-spin' : ''} aria-hidden />
              {loading ? 'Loading…' : loaded ? 'Refresh' : 'Load Report'}
            </button>
          </div>
        </div>

        {/* ── Grand total summary cards ── */}
        <AnimatePresence>
          {totals && (
            <motion.div
              key="totals"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5 sm:p-6 border-b border-surface-4 bg-surface-2/40"
            >
              <div className="text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Retailers</p>
                <p className="num text-2xl font-extrabold text-ink mt-0.5">{totals.retailers}</p>
                <p className="text-[10px] text-ink-muted">{totals.running} running</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Loan Given</p>
                <p className="num text-2xl font-extrabold text-indigo-600 dark:text-indigo-300 mt-0.5">{fmtShort(totals.loanGiven)}</p>
                <p className="text-[10px] text-ink-muted">{fmt(totals.loanGiven)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Collected</p>
                <p className="num text-2xl font-extrabold text-emerald-600 dark:text-emerald-300 mt-0.5">{fmtShort(totals.totalCollected)}</p>
                <p className="text-[10px] text-ink-muted">{fmt(totals.totalCollected)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Net Deficit</p>
                <p className={cn('num text-2xl font-extrabold mt-0.5', totals.deficit > 0 ? 'text-rose-600 dark:text-rose-300' : 'text-emerald-600 dark:text-emerald-300')}>
                  {totals.deficit > 0 ? '-' : '+'}{fmtShort(Math.abs(totals.deficit))}
                </p>
                <p className="text-[10px] text-ink-muted">{totals.deficit > 0 ? 'Outstanding' : 'Surplus'}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Body ── */}
        <div className="p-5 sm:p-6">
          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-3">
              {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center">
                <XCircle className="text-rose-500" size={22} aria-hidden />
              </div>
              <p className="text-sm font-semibold text-ink">{error}</p>
              <button onClick={loadData} className="btn-primary !py-2 !px-4 !text-xs">
                <RefreshCcw size={13} aria-hidden /> Retry
              </button>
            </div>
          )}

          {/* Idle — not yet loaded */}
          {!loading && !error && !loaded && (
            <EmptyState icon={Store} title="Retailer deficit report not loaded" sub="Click 'Load Report' to fetch investment recovery data for all retailers." />
          )}

          {/* Loaded, no rows */}
          {!loading && !error && loaded && filtered.length === 0 && (
            <EmptyState icon={Store} title="No retailers found" sub="No retailers match the current filter." />
          )}

          {/* Main content */}
          {!loading && !error && loaded && rows && rows.length > 0 && (
            <>
              {/* Search + sort controls */}
              <div className="flex flex-wrap items-center gap-3 mb-5">
                <SearchInput value={search} onChange={setSearch} placeholder="Search retailer…" className="flex-1 min-w-[180px]" />
                <div className="flex items-center gap-2 flex-wrap text-[11px]">
                  <span className="text-ink-muted uppercase tracking-widest font-bold shrink-0">Sort:</span>
                  {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
                    <SortBtn key={k} label={SORT_LABELS[k]} sortKey={k} current={sortKey} dir={sortDir} onSort={handleSort} />
                  ))}
                </div>
              </div>

              <AnimatePresence mode="wait">
                {view === 'card' ? (
                  <motion.div
                    key="card"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"
                  >
                    {filtered.map(r => <RetailerCard key={r.retailerId} row={r} />)}
                  </motion.div>
                ) : (
                  <motion.div
                    key="table"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="overflow-x-auto rounded-2xl border border-surface-4"
                  >
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-surface-4 bg-surface-2">
                          {['Retailer', 'Running', 'NPA', 'Settled', 'Done', 'Loan', 'Collected', 'Deficit'].map(h => (
                            <th key={h} className={cn('px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-ink-muted', h === 'Retailer' ? 'text-left' : 'text-right')}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((r, i) => (
                          <tr
                            key={r.retailerId}
                            className={cn('border-b border-surface-4 transition-colors hover:bg-surface-2/60', i % 2 !== 0 ? 'bg-surface-2/30' : '')}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center text-[10px] font-extrabold shrink-0">
                                  {r.name[0]?.toUpperCase() ?? '?'}
                                </div>
                                <div>
                                  <p className="font-semibold text-ink text-sm leading-tight">{r.name}</p>
                                  <p className={cn('text-[10px] font-medium', r.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink-muted')}>
                                    {r.isActive ? 'Active' : 'Inactive'}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right num font-semibold text-emerald-700 dark:text-emerald-300">{r.runningCount}</td>
                            <td className="px-3 py-3 text-right num font-semibold text-rose-600 dark:text-rose-400">{r.npaCount || '—'}</td>
                            <td className="px-3 py-3 text-right num font-semibold text-amber-600 dark:text-amber-400">{r.settledCount || '—'}</td>
                            <td className="px-3 py-3 text-right num font-semibold text-sky-600 dark:text-sky-400">{r.completedCount || '—'}</td>
                            <td className="px-3 py-3 text-right num text-ink-muted text-xs">{fmtShort(r.loanGiven)}</td>
                            <td className="px-3 py-3 text-right num text-ink text-xs font-semibold">{fmtShort(r.totalCollected)}</td>
                            <td className="px-3 py-3 text-right"><DeficitBadge value={r.deficit} /></td>
                          </tr>
                        ))}
                        {/* Grand totals row */}
                        {totals && (
                          <tr className="border-t-2 border-surface-4 bg-surface-2 font-bold">
                            <td className="px-4 py-3 text-sm font-extrabold text-ink">Grand Total</td>
                            <td className="px-3 py-3 text-right num text-sm">{totals.running}</td>
                            <td colSpan={3} className="px-3 py-3" />
                            <td className="px-3 py-3 text-right num text-sm text-ink-muted">{fmtShort(totals.loanGiven)}</td>
                            <td className="px-3 py-3 text-right num text-sm text-emerald-600 dark:text-emerald-300">{fmtShort(totals.totalCollected)}</td>
                            <td className="px-3 py-3 text-right"><DeficitBadge value={totals.deficit} /></td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </Panel>
    </section>
  );
}

/* ── Retailer Card ─────────────────────────────────────────────────────────── */

function RetailerCard({ row }: { row: RetailerSummaryRow }) {
  const pct = row.loanGiven > 0 ? Math.min(100, Math.round((row.totalCollected / row.loanGiven) * 100)) : 0;
  const barColor = pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-teal-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-500';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-surface-4 bg-surface p-4 space-y-3 hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center text-sm font-extrabold shrink-0">
            {row.name[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-ink text-sm leading-tight truncate">{row.name}</p>
            <span className={cn('text-[10px] font-semibold', row.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink-muted')}>
              {row.isActive ? '● Active' : '○ Inactive'}
            </span>
          </div>
        </div>
        <DeficitBadge value={row.deficit} />
      </div>

      {/* Customer count chips */}
      <div className="flex flex-wrap gap-1.5">
        {row.runningCount > 0 && (
          <Chip className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            <Clock size={10} aria-hidden /> {row.runningCount} Running
          </Chip>
        )}
        {row.npaCount > 0 && (
          <Chip className="border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            <XCircle size={10} aria-hidden /> {row.npaCount} NPA
          </Chip>
        )}
        {row.settledCount > 0 && (
          <Chip className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertTriangle size={10} aria-hidden /> {row.settledCount} Settled
          </Chip>
        )}
        {row.completedCount > 0 && (
          <Chip className="border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
            <CheckCircle2 size={10} aria-hidden /> {row.completedCount} Done
          </Chip>
        )}
      </div>

      {/* Financial figures */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-ink-muted">Loan</p>
          <p className="num text-xs font-bold text-indigo-600 dark:text-indigo-300 mt-0.5">{fmtShort(row.loanGiven)}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-ink-muted">Collected</p>
          <p className="num text-xs font-bold text-emerald-600 dark:text-emerald-300 mt-0.5">{fmtShort(row.totalCollected)}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-ink-muted">Fine</p>
          <p className="num text-xs font-bold text-purple-600 dark:text-purple-300 mt-0.5">{fmtShort(row.fineCollected)}</p>
        </div>
      </div>

      {/* Recovery progress bar */}
      <div className="mt-1">
        <div className="flex justify-between text-[10px] text-ink-muted mb-0.5">
          <span>{pct}% recovered</span>
          <span>{fmtShort(row.totalCollected)} / {fmtShort(row.loanGiven)}</span>
        </div>
        <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
          <motion.div
            className={cn('h-full rounded-full', barColor)}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </div>
    </motion.div>
  );
}