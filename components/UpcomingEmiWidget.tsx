'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { diffDaysIST, todayIST } from '@/lib/ist';
import { format } from 'date-fns';

export interface UpcomingRow {
  customer_id: string;
  customer_name: string;
  mobile: string;
  imei: string;
  customer_photo_url: string | null;
  due_date: string;
  emi_no: number;
  emi_amount: number;
  remaining_balance: number;
  days_remaining: number;
}

interface Props {
  rows: UpcomingRow[];
  onOpen: (customerId: string) => void;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n);
}

// Best-effort conversion of an ImgBB share/view URL into a direct image URL.
function ibbDirect(url?: string | null): string {
  if (!url) return '';
  if (/i\.ibb\.co|\.jpg|\.jpeg|\.png|\.webp/i.test(url)) return url;
  if (url.includes('ibb.co/')) {
    const id = url.split('ibb.co/')[1]?.split('/')[0];
    if (id) return `https://i.ibb.co/${id}/img.jpg`;
  }
  return url;
}

// Remaining-days → badge styling + label. Matches the product spec:
//   Today → Red · Tomorrow → Orange · 2–3 days → Blue · 4–5 days → Neutral
function badgeFor(days: number) {
  if (days <= 0) {
    return { label: 'TODAY', cls: 'bg-rose-100 text-rose-700 border-rose-200', dot: 'bg-rose-500', stripe: 'from-rose-500 to-rose-400' };
  }
  if (days === 1) {
    return { label: 'TOMORROW', cls: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500', stripe: 'from-orange-500 to-orange-400' };
  }
  if (days <= 3) {
    return { label: `IN ${days} DAYS`, cls: 'bg-sky-100 text-sky-700 border-sky-200', dot: 'bg-sky-500', stripe: 'from-sky-500 to-sky-400' };
  }
  return { label: `IN ${days} DAYS`, cls: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400', stripe: 'from-slate-400 to-slate-300' };
}

// Spring-physics stagger for a "native app" reveal.
const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
const item = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 30, mass: 0.7 } },
};

function Avatar({ row }: { row: UpcomingRow }) {
  const [broken, setBroken] = useState(false);
  const initial = row.customer_name?.[0]?.toUpperCase() ?? '?';
  return (
    <div className="relative h-12 w-12 sm:h-11 sm:w-11 flex-shrink-0 overflow-hidden rounded-2xl border border-surface-4 bg-amber-50">
      <span className="absolute inset-0 flex items-center justify-center font-display text-lg font-bold text-amber-400 select-none">
        {initial}
      </span>
      {row.customer_photo_url && !broken && (
        <img
          src={ibbDirect(row.customer_photo_url)}
          alt={row.customer_name}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      )}
    </div>
  );
}

export default function UpcomingEmiWidget({ rows, onOpen }: Props) {
  // Live day-granular countdown: recompute against the IST calendar so a badge
  // flips from "TOMORROW" to "TODAY" at the midnight rollover without a reload.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const today = todayIST();

  if (rows.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="card overflow-hidden mb-6"
      >
        <div className="px-5 py-10 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-2xl">
            🎉
          </div>
          <p className="text-ink font-semibold">All clear for the next 5 days</p>
          <p className="text-ink-muted text-sm mt-0.5">No EMIs are due in this window.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="card overflow-hidden mb-6">
      {/* Sticky section header — stays pinned while the list scrolls on mobile */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-surface-4 bg-white/90 px-5 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">🔔</span>
          <div>
            <p className="text-sm font-semibold leading-tight text-ink">Upcoming · Next 5 Days</p>
            <p className="text-[11px] leading-tight text-ink-muted">Sorted by nearest due date</p>
          </div>
        </div>
        <span className="badge bg-brand-50 text-brand-700 border border-brand-200 num">
          {rows.length}
        </span>
      </div>

      <motion.ul variants={container} initial="hidden" animate="show" className="divide-y divide-surface-3">
        <AnimatePresence initial={false}>
          {rows.map(row => {
            const days = Math.max(0, diffDaysIST(row.due_date, today));
            const b = badgeFor(days);
            return (
              <motion.li
                key={row.customer_id}
                variants={item}
                layout
                whileTap={{ scale: 0.98 }}
                whileHover={{ backgroundColor: 'rgba(248,250,252,1)' }}
                onClick={() => onOpen(row.customer_id)}
                className="relative flex cursor-pointer items-center gap-3 px-4 py-3 sm:px-5"
                title="Open EMI details"
              >
                {/* Left accent stripe coloured by urgency */}
                <span className={`absolute left-0 top-0 h-full w-1 bg-gradient-to-b ${b.stripe}`} />

                <Avatar row={row} />

                {/* Identity */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{row.customer_name}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-muted">
                    <span className="num">{row.mobile || '—'}</span>
                    <span className="hidden sm:inline text-surface-4">·</span>
                    <span>EMI #{row.emi_no}</span>
                  </div>
                </div>

                {/* Amount + due date (compact list metrics on desktop) */}
                <div className="hidden text-right sm:block">
                  <p className="num font-bold text-brand-700">{fmt(row.emi_amount)}</p>
                  <p className="num text-xs text-ink-muted">{format(new Date(row.due_date), 'd MMM yyyy')}</p>
                </div>

                {/* Urgency badge */}
                <div className="flex flex-col items-end gap-1 sm:w-28">
                  <motion.span
                    layout
                    className={`badge border ${b.cls} num`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${b.dot}`} />
                    {b.label}
                  </motion.span>
                  {/* Amount shown under the badge on mobile (no desktop column) */}
                  <p className="num text-sm font-bold text-brand-700 sm:hidden">{fmt(row.emi_amount)}</p>
                  <p className="num text-[11px] text-ink-muted sm:hidden">{format(new Date(row.due_date), 'd MMM')}</p>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </motion.ul>
    </div>
  );
}
