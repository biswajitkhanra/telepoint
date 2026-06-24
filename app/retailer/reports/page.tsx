'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import NavBar from '@/components/NavBar';
import BottomNav from '@/components/BottomNav';
import { formatCurrency, todayIST } from '@/lib/formatters';
import { fadeUp, cardRise, staggerContainer } from '@/lib/motion';
import type { RetailerDashboard } from '@/app/api/retailer/dashboard/route';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');

function monthRange(year: number, month1: number): { from: string; to: string } {
  const today = todayIST();
  const [ty, tm] = today.split('-').map(Number);
  const isCurrent = year === ty && month1 === tm;
  const from = `${year}-${pad(month1)}-01`;
  const lastDay = new Date(year, month1, 0).getDate();
  const to = isCurrent ? today : `${year}-${pad(month1)}-${pad(lastDay)}`;
  return { from, to };
}

export default function RetailerReportsPage() {
  // Browser-only Supabase client — never instantiate during SSR/prerender.
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (typeof window !== 'undefined' && !supabaseRef.current) supabaseRef.current = createClient();
  const supabase = supabaseRef.current;
  const [retailer, setRetailer] = useState<{ id: string; name: string } | null>(null);

  const today = todayIST();
  const [ty, tm] = today.split('-').map(Number);
  const [year, setYear] = useState(ty);
  const [month, setMonth] = useState(tm);

  const [data, setData] = useState<RetailerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  const { from, to } = useMemo(() => monthRange(year, month), [year, month]);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: r } = await supabase.from('retailers').select('id, name').eq('auth_user_id', user.id).single();
      if (r) setRetailer(r);
    })();
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/retailer/dashboard?from=${from}&to=${to}`, { cache: 'no-store' });
      setData(res.ok ? await res.json() : null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  async function download(type: 'customers' | 'brands') {
    setDownloading(type);
    try {
      const res = await fetch(`/api/retailer/report?type=${type}&from=${from}&to=${to}`, { cache: 'no-store' });
      if (!res.ok) return;
      const blob = await res.blob();
      const dispo = res.headers.get('Content-Disposition') || '';
      const match = dispo.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `${type}_report.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="min-h-screen page-bg">
      <NavBar role="retailer" userName={retailer?.name || 'Retailer'} />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24">
        <motion.div className="mb-6" variants={fadeUp} initial="hidden" animate="show">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">Reports</h1>
          <p className="text-ink-muted text-sm mt-0.5">Your disbursal &amp; collection figures · {retailer?.name || 'My Shop'}</p>
        </motion.div>

        {/* Period picker */}
        <motion.div className="card p-4 mb-5 flex flex-wrap items-center gap-3" variants={cardRise} initial="hidden" animate="show">
          <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Period</span>
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="input !py-2 !w-auto">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <div className="flex items-center rounded-xl border border-surface-4 bg-surface-2 overflow-hidden">
            <button onClick={() => setYear(y => y - 1)} className="px-3 py-2 text-ink-muted hover:bg-surface-3" aria-label="Previous year">‹</button>
            <span className="px-3 py-2 text-sm font-semibold text-ink num">{year}</span>
            <button onClick={() => setYear(y => Math.min(ty, y + 1))} className="px-3 py-2 text-ink-muted hover:bg-surface-3" aria-label="Next year">›</button>
          </div>
          <button onClick={load} className="btn-ghost text-xs px-3 py-2 ml-auto">{loading ? 'Loading…' : '↻ Refresh'}</button>
        </motion.div>

        {/* Summary tiles */}
        <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6" variants={staggerContainer(0.07, 0.05)} initial="hidden" animate="show">
          <SummaryStat label="Total Disbursed" value={formatCurrency(data?.totalDisbursed ?? 0)} />
          <SummaryStat label="Loans Disbursed" value={String(data?.disbursedCount ?? 0)} />
          <SummaryStat label="Collected" value={formatCurrency(data?.collectedAmount ?? 0)} />
          <SummaryStat label="Fine Collected" value={formatCurrency(data?.fineCollected ?? 0)} />
        </motion.div>

        {/* Downloads */}
        <motion.div className="card p-5 mb-6" variants={cardRise} initial="hidden" animate="show">
          <p className="section-header">⬇ Download (CSV)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DownloadCard
              title="Disbursal Report"
              desc="One row per loan started this period — customer, device, brand, disbursed amount, EMI &amp; status."
              loading={downloading === 'customers'}
              onClick={() => download('customers')}
            />
            <DownloadCard
              title="Brand Performance"
              desc="Devices disbursed and total amount, grouped by brand (first word of the device name)."
              loading={downloading === 'brands'}
              onClick={() => download('brands')}
            />
          </div>
        </motion.div>

        {/* Brand preview */}
        <motion.div className="card overflow-hidden mb-6" variants={cardRise} initial="hidden" animate="show">
          <div className="px-5 py-3 border-b border-surface-4">
            <span className="text-sm font-semibold text-ink">Top Performing Brands — {MONTHS[month - 1]} {year}</span>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">{[0, 1, 2].map(i => <div key={i} className="skeleton h-6 w-full rounded" />)}</div>
          ) : (data?.brands?.length ?? 0) === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-muted text-center">No loans disbursed in this period.</p>
          ) : (
            <table className="data-table text-xs sm:text-sm">
              <thead><tr><th>#</th><th>Brand</th><th>Devices</th><th>Total Disbursed</th></tr></thead>
              <tbody>
                {data!.brands.map((b, i) => (
                  <tr key={b.name}>
                    <td className="num text-ink-muted">{i + 1}</td>
                    <td className="font-semibold text-ink">{b.name}</td>
                    <td className="num">{b.count}</td>
                    <td className="num font-semibold">{formatCurrency(b.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </motion.div>

        <div className="flex flex-wrap gap-2">
          <Link href="/retailer/dashboard" className="btn-secondary text-sm">📊 Dashboard</Link>
          <Link href="/retailer" className="btn-ghost text-sm">← Back to Collection</Link>
        </div>
      </div>

      <BottomNav role="retailer" />
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <motion.div variants={cardRise} className="rounded-2xl border border-surface-4 bg-white px-4 py-3 shadow-card">
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">{label}</p>
      <p className="num text-xl font-extrabold text-ink mt-1">{value}</p>
    </motion.div>
  );
}

function DownloadCard({ title, desc, loading, onClick }: { title: string; desc: string; loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="text-left rounded-2xl border border-surface-4 bg-surface-2 hover:bg-surface-3 transition-colors p-4 disabled:opacity-60"
    >
      <p className="text-sm font-bold text-ink flex items-center gap-2">{title} <span className="text-brand-600">{loading ? '…' : '⬇'}</span></p>
      <p className="text-[11px] text-ink-muted mt-1">{desc}</p>
    </button>
  );
}
