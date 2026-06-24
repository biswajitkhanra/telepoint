'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import NavBar from '@/components/NavBar';
import BottomNav from '@/components/BottomNav';
import { formatCurrency, todayIST } from '@/lib/formatters';
import { SPRING, fadeUp, cardRise, staggerContainer } from '@/lib/motion';
import type { RetailerDashboard } from '@/app/api/retailer/dashboard/route';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');

// Each ranked sector gets its OWN vivid colour (dot + figure).
const SECTOR_COLORS = [
  { dot: 'bg-violet-500', text: 'text-violet-700' },
  { dot: 'bg-sky-500', text: 'text-sky-700' },
  { dot: 'bg-emerald-500', text: 'text-emerald-700' },
  { dot: 'bg-amber-500', text: 'text-amber-700' },
  { dot: 'bg-rose-500', text: 'text-rose-700' },
  { dot: 'bg-indigo-500', text: 'text-indigo-700' },
  { dot: 'bg-teal-500', text: 'text-teal-700' },
  { dot: 'bg-fuchsia-500', text: 'text-fuchsia-700' },
];

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
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold">
            <span className="bg-gradient-to-r from-sky-600 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">Reports</span>
          </h1>
          <p className="text-ink-muted text-sm mt-0.5">Your disbursal &amp; collection figures · {retailer?.name || 'My Shop'}</p>
        </motion.div>

        {/* Period picker — INDIGO sector */}
        <motion.div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-indigo-50 shadow-card p-4 mb-5 flex flex-wrap items-center gap-3" variants={cardRise} initial="hidden" animate="show">
          <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Period</span>
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="input !py-2 !w-auto">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <div className="flex items-center rounded-xl border border-indigo-200 bg-white overflow-hidden">
            <button onClick={() => setYear(y => y - 1)} className="px-3 py-2 text-indigo-600 hover:bg-indigo-100" aria-label="Previous year">‹</button>
            <span className="px-3 py-2 text-sm font-semibold text-indigo-900 num">{year}</span>
            <button onClick={() => setYear(y => Math.min(ty, y + 1))} className="px-3 py-2 text-indigo-600 hover:bg-indigo-100" aria-label="Next year">›</button>
          </div>
          <button onClick={load} className="btn-ghost text-xs px-3 py-2 ml-auto">{loading ? 'Loading…' : '↻ Refresh'}</button>
        </motion.div>

        {/* Summary tiles — each its OWN colour */}
        <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6" variants={staggerContainer(0.08, 0.05)} initial="hidden" animate="show">
          <SummaryStat grad="from-amber-500 to-orange-500" label="Total Disbursed" value={formatCurrency(data?.totalDisbursed ?? 0)} />
          <SummaryStat grad="from-sky-500 to-indigo-500" label="Loans Disbursed" value={String(data?.disbursedCount ?? 0)} />
          <SummaryStat grad="from-emerald-500 to-teal-500" label="Collected" value={formatCurrency(data?.collectedAmount ?? 0)} />
          <SummaryStat grad="from-rose-500 to-pink-500" label="Fine Collected" value={formatCurrency(data?.fineCollected ?? 0)} />
        </motion.div>

        {/* Downloads — VIOLET sector */}
        <motion.div className="rounded-3xl overflow-hidden border border-violet-200 bg-white shadow-card mb-6" variants={cardRise} initial="hidden" animate="show">
          <div className="bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-3 sheen-track">
            <p className="text-sm font-bold text-white flex items-center gap-2">⬇ Download (CSV)</p>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DownloadCard
              tint="violet"
              title="Disbursal Report"
              desc="One row per loan started this period — customer, device, brand, disbursed amount, EMI &amp; status."
              loading={downloading === 'customers'}
              onClick={() => download('customers')}
            />
            <DownloadCard
              tint="fuchsia"
              title="Brand Performance"
              desc="Devices disbursed and total amount, grouped by brand (first word of the device name)."
              loading={downloading === 'brands'}
              onClick={() => download('brands')}
            />
          </div>
        </motion.div>

        {/* Brand preview — TEAL sector with rainbow rank dots */}
        <motion.div className="rounded-3xl overflow-hidden border border-teal-200 bg-white shadow-card mb-6" variants={cardRise} initial="hidden" animate="show">
          <div className="bg-gradient-to-r from-teal-500 to-emerald-500 px-5 py-3 sheen-track">
            <span className="text-sm font-bold text-white">🏆 Top Performing Brands — {MONTHS[month - 1]} {year}</span>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">{[0, 1, 2].map(i => <div key={i} className="skeleton h-6 w-full rounded" />)}</div>
          ) : (data?.brands?.length ?? 0) === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-muted text-center">No loans disbursed in this period.</p>
          ) : (
            <table className="data-table text-xs sm:text-sm">
              <thead><tr><th>#</th><th>Brand</th><th>Devices</th><th>Total Disbursed</th></tr></thead>
              <tbody>
                {data!.brands.map((b, i) => {
                  const c = SECTOR_COLORS[i % SECTOR_COLORS.length];
                  return (
                    <tr key={b.name}>
                      <td><span className={`inline-flex w-5 h-5 rounded-md ${c.dot} text-white text-[10px] font-bold items-center justify-center`}>{i + 1}</span></td>
                      <td className="font-semibold text-ink">{b.name}</td>
                      <td className="num">{b.count}</td>
                      <td className={`num font-semibold ${c.text}`}>{formatCurrency(b.amount)}</td>
                    </tr>
                  );
                })}
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

function SummaryStat({ grad, label, value }: { grad: string; label: string; value: string }) {
  return (
    <motion.div
      variants={cardRise}
      whileHover={{ y: -4, scale: 1.02 }}
      transition={SPRING}
      className={`relative rounded-2xl overflow-hidden bg-gradient-to-br ${grad} px-4 py-3.5 shadow-lg sheen-track`}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/85">{label}</p>
      <p className="num text-xl font-extrabold text-white mt-1 drop-shadow-sm">{value}</p>
    </motion.div>
  );
}

const DL_TINT: Record<string, string> = {
  violet: 'border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-700',
  fuchsia: 'border-fuchsia-200 bg-fuchsia-50 hover:bg-fuchsia-100 text-fuchsia-700',
};

function DownloadCard({ tint, title, desc, loading, onClick }: { tint: 'violet' | 'fuchsia'; title: string; desc: string; loading: boolean; onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      disabled={loading}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      className={`text-left rounded-2xl border ${DL_TINT[tint]} transition-colors p-4 disabled:opacity-60`}
    >
      <p className="text-sm font-bold text-ink flex items-center gap-2">{title} <span className="text-lg">{loading ? '…' : '⬇'}</span></p>
      <p className="text-[11px] text-ink-muted mt-1">{desc}</p>
    </motion.button>
  );
}
