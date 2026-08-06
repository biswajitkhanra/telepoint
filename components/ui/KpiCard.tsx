'use client';

/**
 * Premium KPI card — icon chip, animated count-up, optional REAL sparkline
 * series, optional real delta badge, progress bar, tooltip and skeleton.
 *
 * No value on this card is ever invented: sparklines and deltas render ONLY
 * when the caller supplies genuine series/comparison data from the API.
 */

import { motion } from 'framer-motion';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import CountUp from '@/components/motion/CountUp';
import { cn } from '@/lib/cn';
import { SPRING, cardRise } from '@/lib/motion';
import { InfoTip, ProgressBar, Skeleton } from '@/components/ui/primitives';

export type KpiTone = 'indigo' | 'sky' | 'emerald' | 'amber' | 'rose' | 'purple' | 'slate';

const TONES: Record<KpiTone, { chip: string; spark: string; bar: string; ring: string; wash: string }> = {
  indigo:  { chip: 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/40',   spark: '#6366f1', bar: 'bg-gradient-to-r from-indigo-500 to-indigo-400', ring: 'hover:border-indigo-300 dark:hover:border-indigo-500/60 hover:shadow-indigo-500/20', wash: 'from-indigo-500/[0.07]' },
  sky:     { chip: 'bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-md shadow-sky-500/40',           spark: '#0ea5e9', bar: 'bg-gradient-to-r from-sky-500 to-sky-400',       ring: 'hover:border-sky-300 dark:hover:border-sky-500/60 hover:shadow-sky-500/20', wash: 'from-sky-500/[0.07]' },
  emerald: { chip: 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/40',   spark: '#10b981', bar: 'bg-gradient-to-r from-emerald-500 to-emerald-400', ring: 'hover:border-emerald-300 dark:hover:border-emerald-500/60 hover:shadow-emerald-500/20', wash: 'from-emerald-500/[0.07]' },
  amber:   { chip: 'bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/40',     spark: '#f59e0b', bar: 'bg-gradient-to-r from-amber-500 to-amber-400',   ring: 'hover:border-amber-300 dark:hover:border-amber-500/60 hover:shadow-amber-500/20', wash: 'from-amber-500/[0.07]' },
  rose:    { chip: 'bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-md shadow-rose-500/40',         spark: '#f43f5e', bar: 'bg-gradient-to-r from-rose-500 to-rose-400',     ring: 'hover:border-rose-300 dark:hover:border-rose-500/60 hover:shadow-rose-500/20', wash: 'from-rose-500/[0.07]' },
  purple:  { chip: 'bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white shadow-md shadow-purple-500/40',  spark: '#a855f7', bar: 'bg-gradient-to-r from-purple-500 to-purple-400', ring: 'hover:border-purple-300 dark:hover:border-purple-500/60 hover:shadow-purple-500/20', wash: 'from-purple-500/[0.07]' },
  slate:   { chip: 'bg-gradient-to-br from-slate-500 to-slate-600 text-white shadow-md shadow-slate-500/40',      spark: '#64748b', bar: 'bg-gradient-to-r from-slate-500 to-slate-400',   ring: 'hover:border-slate-300 dark:hover:border-slate-500/60 hover:shadow-slate-500/20', wash: 'from-slate-500/[0.07]' },
};

/** Inline SVG sparkline drawn from a REAL numeric series. */
function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return null;
  const w = 96, h = 28, pad = 2;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const step = (w - pad * 2) / (points.length - 1);
  const path = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(pad + i * step).toFixed(1)},${(h - pad - ((v - min) / span) * (h - pad * 2)).toFixed(1)}`)
    .join(' ');
  const areaPath = `${path} L${(pad + (points.length - 1) * step).toFixed(1)},${h} L${pad},${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden>
      <path d={areaPath} fill={color} opacity={0.12} />
      <motion.path
        d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      />
      <circle
        cx={pad + (points.length - 1) * step}
        cy={h - pad - ((points[points.length - 1] - min) / span) * (h - pad * 2)}
        r={2.5} fill={color}
      />
    </svg>
  );
}

export interface KpiCardProps {
  label: string;
  value: number;
  format?: (n: number) => string;
  icon: LucideIcon;
  tone?: KpiTone;
  /** Explanation of exactly how this figure is computed (shown as tooltip). */
  formula?: string;
  /** Secondary labelled figure (always real). */
  secondary?: { label: string; value: number; format?: (n: number) => string };
  /** Real completion ratio 0–100 (renders a progress bar + % chip). */
  progressPct?: number;
  progressLabel?: string;
  /** REAL historical series for the sparkline (e.g. monthly totals). */
  spark?: number[];
  /** REAL period-over-period delta %, only when a true comparison exists. */
  deltaPct?: number;
  /** For metrics where DOWN is good (e.g. bounce rate). */
  deltaInvert?: boolean;
  deltaLabel?: string;
  loading?: boolean;
  className?: string;
}

export function KpiCard({
  label, value, format, icon: Icon, tone = 'indigo', formula, secondary,
  progressPct, progressLabel, spark, deltaPct, deltaInvert, deltaLabel,
  loading, className,
}: KpiCardProps) {
  const t = TONES[tone];
  const fmt = format ?? ((n: number) => String(Math.round(n)));

  if (loading) {
    return (
      <div className={cn('rounded-xl border border-surface-4 bg-surface p-4 sm:p-5 shadow-sm', className)}>
        <div className="flex items-start justify-between">
          <Skeleton className="w-9 h-9 rounded-xl" />
          <Skeleton className="w-16 h-4 rounded-md" />
        </div>
        <Skeleton className="w-28 h-7 rounded-lg mt-4" />
        <Skeleton className="w-20 h-3 rounded mt-2.5" />
      </div>
    );
  }

  const good = deltaPct !== undefined ? (deltaInvert ? deltaPct <= 0 : deltaPct >= 0) : true;

  return (
    <motion.div
      variants={cardRise}
      whileHover={{ y: -2, transition: SPRING }}
      className={cn(
        'group relative overflow-hidden rounded-xl border border-surface-4 bg-surface p-4 sm:p-5 shadow-sm',
        'transition-all duration-200 hover:shadow-md dark:border-surface-3',
        t.ring, className,
      )}
      role="group" aria-label={label}
    >
      {/* Soft tonal wash that blooms on hover — pure opacity, stays 60fps */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300',
          t.wash,
        )}
      />
      <div className="relative flex items-start justify-between gap-2">
        <motion.span
          className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-white/25', t.chip)}
          whileHover={{ rotate: -6, scale: 1.08 }}
          transition={SPRING}
        >
          <Icon size={18} strokeWidth={2.2} aria-hidden />
        </motion.span>
        <div className="flex items-center gap-1.5">
          {deltaPct !== undefined && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold num',
                good
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                  : 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
              )}
              title={deltaLabel}
            >
              {deltaPct >= 0 ? <TrendingUp size={11} aria-hidden /> : <TrendingDown size={11} aria-hidden />}
              {Math.abs(deltaPct).toFixed(0)}%
            </span>
          )}
          {formula && <InfoTip text={formula} />}
        </div>
      </div>

      <div className="relative mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <CountUp value={value} format={fmt} duration={0.8} className="num block text-xl sm:text-2xl font-extrabold text-ink leading-tight" />
          <p className="text-[11px] font-semibold text-ink-muted mt-1 truncate">{label}</p>
        </div>
        {spark && spark.length >= 2 && (
          <div className="shrink-0 hidden xs:block sm:block"><Sparkline points={spark} color={t.spark} /></div>
        )}
      </div>

      {secondary && (
        <p className="relative mt-2 text-[11px] text-ink-muted">
          {secondary.label}{' '}
          <span className="num font-bold text-ink">{(secondary.format ?? fmt)(secondary.value)}</span>
        </p>
      )}

      {progressPct !== undefined && (
        <div className="relative mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{progressLabel ?? 'Progress'}</span>
            <span className="num text-[10px] font-extrabold text-ink">{Math.round(progressPct)}%</span>
          </div>
          <ProgressBar pct={progressPct} height="h-1.5" barClassName={t.bar} />
        </div>
      )}
    </motion.div>
  );
}

/**
 * Responsive KPI grid: 4-up desktop, 2-up tablet, horizontal snap-scroll on
 * mobile (swipeable cards) with each card at ~78vw.
 */
export function KpiGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4',
        '[&>*]:snap-start [&>*]:shrink-0 [&>*]:w-[82vw] [&>*]:max-w-[400px]',
        'sm:grid sm:grid-cols-2 xl:grid-cols-4 sm:gap-4 sm:overflow-visible sm:pb-0 sm:mx-0 sm:px-0',
        'sm:[&>*]:w-auto sm:[&>*]:max-w-none',
      )}
      style={{ scrollbarWidth: 'none' }}
    >
      {children}
    </div>
  );
}
