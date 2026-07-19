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

const TONES: Record<KpiTone, { chip: string; spark: string; bar: string; ring: string }> = {
  indigo:  { chip: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300',   spark: '#6366f1', bar: 'bg-gradient-to-r from-indigo-500 to-indigo-400', ring: 'hover:border-indigo-300 dark:hover:border-indigo-500/60' },
  sky:     { chip: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',               spark: '#0ea5e9', bar: 'bg-gradient-to-r from-sky-500 to-sky-400',       ring: 'hover:border-sky-300 dark:hover:border-sky-500/60' },
  emerald: { chip: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300', spark: '#10b981', bar: 'bg-gradient-to-r from-emerald-500 to-emerald-400', ring: 'hover:border-emerald-300 dark:hover:border-emerald-500/60' },
  amber:   { chip: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',       spark: '#f59e0b', bar: 'bg-gradient-to-r from-amber-500 to-amber-400',   ring: 'hover:border-amber-300 dark:hover:border-amber-500/60' },
  rose:    { chip: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',           spark: '#f43f5e', bar: 'bg-gradient-to-r from-rose-500 to-rose-400',     ring: 'hover:border-rose-300 dark:hover:border-rose-500/60' },
  purple:  { chip: 'bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-300',   spark: '#a855f7', bar: 'bg-gradient-to-r from-purple-500 to-purple-400', ring: 'hover:border-purple-300 dark:hover:border-purple-500/60' },
  slate:   { chip: 'bg-surface-3 text-ink-muted',                                               spark: '#64748b', bar: 'bg-gradient-to-r from-slate-500 to-slate-400',   ring: 'hover:border-slate-300 dark:hover:border-slate-500/60' },
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
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
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
      <div className={cn('rounded-[20px] border border-surface-4/80 bg-surface p-4 sm:p-5 shadow-card', className)}>
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
      whileHover={{ y: -4, transition: SPRING }}
      className={cn(
        'group relative rounded-[20px] border border-surface-4/80 bg-surface p-4 sm:p-5 shadow-card',
        'transition-[border-color,box-shadow] hover:shadow-card-hover dark:border-surface-3',
        t.ring, className,
      )}
      role="group" aria-label={label}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', t.chip)}>
          <Icon size={17} strokeWidth={2.2} aria-hidden />
        </span>
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

      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <CountUp value={value} format={fmt} className="num block text-xl sm:text-2xl font-extrabold text-ink leading-tight" />
          <p className="text-[11px] font-semibold text-ink-muted mt-1 truncate">{label}</p>
        </div>
        {spark && spark.length >= 2 && (
          <div className="shrink-0 hidden xs:block sm:block"><Sparkline points={spark} color={t.spark} /></div>
        )}
      </div>

      {secondary && (
        <p className="mt-2 text-[11px] text-ink-muted">
          {secondary.label}{' '}
          <span className="num font-bold text-ink">{(secondary.format ?? fmt)(secondary.value)}</span>
        </p>
      )}

      {progressPct !== undefined && (
        <div className="mt-3">
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
