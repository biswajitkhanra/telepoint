'use client';

/**
 * TelePoint dashboard design system — shadcn-style primitives.
 *
 * Every enterprise surface (Reports / Analytics / Settings) is composed from
 * these pieces so spacing, radii (18–24px), shadows, typography and dark-mode
 * behaviour stay consistent. All colors run through the semantic ink/surface
 * tokens (CSS variables), so light and dark themes both render first-class.
 */

import { ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { LucideIcon, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { toDisplayName } from '@/lib/formatters';
import { SPRING, sheetPanel, backdrop, cardRise } from '@/lib/motion';

/* ── Panel — the standard rounded card ──────────────────────────────────── */
export function Panel({
  children, className, hover = false, animate = true,
}: {
  children: ReactNode; className?: string; hover?: boolean; animate?: boolean;
}) {
  const body = (
    <div
      className={cn(
        'rounded-[20px] border border-surface-4/80 bg-surface shadow-card',
        'dark:border-surface-3',
        hover && 'transition-shadow hover:shadow-card-hover',
        className,
      )}
    >
      {children}
    </div>
  );
  if (!animate) return body;
  return (
    <motion.div variants={cardRise} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }}>
      {body}
    </motion.div>
  );
}

/* ── Section heading with icon chip ─────────────────────────────────────── */
export function SectionHead({
  icon: Icon, title, sub, tint = 'text-white bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md shadow-indigo-500/30', right,
}: {
  icon: LucideIcon; title: string; sub?: string; tint?: string; right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-white/25', tint)}>
          <Icon size={18} strokeWidth={2.2} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-ink leading-tight">{title}</h2>
          {sub && <p className="text-xs text-ink-muted mt-0.5">{sub}</p>}
        </div>
      </div>
      {right && <div className="flex items-center gap-2 ml-auto">{right}</div>}
    </div>
  );
}

/* ── Small labelled chip ────────────────────────────────────────────────── */
export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold border',
      'border-surface-4 bg-surface-2 text-ink-muted',
      className,
    )}>
      {children}
    </span>
  );
}

/* ── Segmented control (animated pill) ──────────────────────────────────── */
export function Segmented<T extends string>({
  options, value, onChange, id, size = 'md', className,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  /** Unique layoutId namespace so multiple controls don't fight. */
  id: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-xl border border-surface-4 bg-surface-2 p-1 overflow-x-auto max-w-full',
        className,
      )}
      style={{ scrollbarWidth: 'none' }}
    >
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative z-0 rounded-lg font-semibold whitespace-nowrap transition-colors shrink-0',
              size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-xs',
              active ? 'text-white' : 'text-ink-muted hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-sm shadow-indigo-500/30 -z-10"
                transition={SPRING}
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Animated progress bar ──────────────────────────────────────────────── */
export function ProgressBar({
  pct, className, barClassName = 'bg-gradient-to-r from-indigo-500 to-sky-500', height = 'h-2', delay = 0,
}: {
  pct: number; className?: string; barClassName?: string; height?: string; delay?: number;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      className={cn('w-full rounded-full bg-surface-3 overflow-hidden', height, className)}
      role="progressbar" aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100}
    >
      <motion.div
        className={cn('h-full rounded-full bar-glint', barClassName)}
        initial={{ width: 0 }}
        whileInView={{ width: `${clamped}%` }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay }}
      />
    </div>
  );
}

/* ── Info tooltip (accessible: hover, focus, and tap on touch) ──────────── */
// The bubble is portalled to <body> with fixed positioning: KPI cards use
// overflow-hidden and the mobile KPI row scrolls sideways, and either one
// clipped an in-card tooltip so it never showed.
const TIP_W = 240;
export function InfoTip({ text, className }: { text: string; className?: string }) {
  const id = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const lastPointer = useRef<string>('');
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) { setPos(null); return; }
    const r = btnRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - TIP_W / 2), vw - TIP_W - 8);
    const above = r.top > 140;               // not enough room → open below
    setPos({ left, top: above ? r.top - 8 : r.bottom + 8, above });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span
      className={cn('relative inline-flex', className)}
      // Mouse opens on hover; touch fires emulated hover/focus before the
      // click, so those are ignored for touch and the tap alone toggles.
      onPointerEnter={e => { if (e.pointerType === 'mouse') setOpen(true); }}
      onPointerLeave={e => { if (e.pointerType === 'mouse') setOpen(false); }}
    >
      {/* 28×28 hit target around the 14px glyph; the negative margin keeps the
          card layout unchanged. Tap toggles it, since touch has no hover. */}
      <button
        ref={btnRef}
        type="button"
        aria-label="How this is calculated"
        aria-describedby={id}
        aria-expanded={open}
        onPointerDown={e => { lastPointer.current = e.pointerType; }}
        onClick={e => {
          e.stopPropagation();
          if (lastPointer.current !== 'mouse') setOpen(o => !o);
          lastPointer.current = '';
        }}
        onFocus={e => { if (e.currentTarget.matches(':focus-visible')) setOpen(true); }}
        onBlur={() => setOpen(false)}
        className="-m-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-muted/70 hover:text-ink-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      >
        <Info size={14} aria-hidden />
      </button>
      {/* Always in the DOM for aria-describedby; the visible bubble is below. */}
      <span id={id} className="sr-only">{text}</span>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <span
          aria-hidden
          className="pointer-events-none fixed z-[90] rounded-xl border border-surface-4 bg-surface px-3 py-2 text-xs leading-relaxed text-ink shadow-modal animate-fade-in"
          style={{ left: pos.left, top: pos.top, width: TIP_W, transform: pos.above ? 'translateY(-100%)' : undefined }}
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  );
}

/* ── Skeleton block ─────────────────────────────────────────────────────── */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

/* ── Empty state ────────────────────────────────────────────────────────── */
export function EmptyState({ icon: Icon, title, sub }: { icon: LucideIcon; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="w-14 h-14 rounded-2xl bg-surface-2 border border-surface-4 flex items-center justify-center mb-3">
        <Icon size={22} className="text-ink-muted/60" aria-hidden />
      </span>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {sub && <p className="text-xs text-ink-muted mt-1 max-w-xs">{sub}</p>}
    </div>
  );
}

/* ── Mobile bottom sheet / desktop modal ────────────────────────────────── */
export function BottomSheet({
  open, onClose, title, children,
}: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
}) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          variants={backdrop} initial="hidden" animate="show" exit="exit"
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-ink/50 backdrop-blur-sm p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            variants={reduce ? undefined : sheetPanel}
            initial="hidden" animate="show" exit="exit"
            role="dialog" aria-modal="true" aria-label={title}
            className="w-full sm:max-w-lg max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-surface-4 bg-surface shadow-modal safe-bottom"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 border-b border-surface-4 bg-surface/95 backdrop-blur rounded-t-3xl">
              <span className="sm:hidden absolute left-1/2 -translate-x-1/2 top-2 w-10 h-1 rounded-full bg-surface-4" aria-hidden />
              <h3 className="text-sm font-bold text-ink">{title}</h3>
              <button onClick={onClose} aria-label="Close" className="btn-icon !min-h-0 !p-1.5">
                <X size={16} />
              </button>
            </div>
            <div className="p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── Ranked bar row (leaderboards) ──────────────────────────────────────── */
const RANK_STYLES = [
  'bg-gradient-to-br from-amber-400 to-amber-500 text-amber-950',   // 🥇
  'bg-gradient-to-br from-slate-300 to-slate-400 text-slate-800',   // 🥈
  'bg-gradient-to-br from-orange-300 to-orange-400 text-orange-900',// 🥉
];

export function RankRow({
  rank, name, valueLabel, pct, barClassName = 'bg-gradient-to-r from-indigo-500 to-sky-500',
  sub, onClick, delay = 0,
}: {
  rank: number; name: string; valueLabel: string; pct: number;
  barClassName?: string; sub?: string; onClick?: () => void; delay?: number;
}) {
  const Tag = onClick ? motion.button : motion.div;
  return (
    <Tag
      onClick={onClick}
      initial={{ opacity: 0, x: -14 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ ...SPRING, delay }}
      className={cn(
        'flex w-full items-center gap-3 text-left rounded-xl px-2 py-1.5 -mx-2 whitespace-normal',
        onClick && 'hover:bg-surface-2 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-400 focus:outline-none',
      )}
    >
      <span
        className={cn(
          'w-7 h-7 rounded-lg text-xs font-extrabold flex items-center justify-center shrink-0 shadow-sm num',
          RANK_STYLES[rank - 1] ?? 'bg-surface-3 text-ink-muted',
        )}
        aria-label={`Rank ${rank}`}
      >
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-[13px] font-semibold text-ink truncate" title={name}>
            {toDisplayName(name)}
            {sub && <span className="ml-1.5 text-xs font-medium text-ink-muted">{sub}</span>}
          </p>
          <p className="num text-xs font-bold text-ink whitespace-nowrap">{valueLabel}</p>
        </div>
        <ProgressBar pct={pct} height="h-1.5" barClassName={barClassName} delay={delay} />
      </div>
    </Tag>
  );
}
