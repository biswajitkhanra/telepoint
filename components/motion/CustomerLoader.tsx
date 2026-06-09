'use client';

import { motion } from 'framer-motion';
import { SPRING } from '@/lib/motion';

interface Props {
  /** Optional label shown under the courier. */
  label?: string;
  name?: string;
}

/**
 * Premium fintech-style loading sequence shown the instant a customer is
 * opened — a courier races down a dashed road while a progress bar fills and
 * skeleton chips shimmer. Gives immediate feedback (no dead-click feeling)
 * even when the data resolves instantly. Auto-dismissed by the parent after a
 * short minimum duration via <AnimatePresence/>.
 */
export default function CustomerLoader({ label = 'Fetching customer', name }: Props) {
  return (
    <motion.div
      key="customer-loader"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-white/65 backdrop-blur-md"
      aria-busy="true"
      aria-live="polite"
    >
      <motion.div
        initial={{ scale: 0.9, y: 24, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.94, y: 12, opacity: 0 }}
        transition={SPRING}
        className="card w-[min(86vw,340px)] px-7 py-7 text-center shadow-modal"
      >
        {/* Courier racing down a dashed road */}
        <div className="relative mb-5 h-16 overflow-hidden">
          {/* Spinning coin / pulse ring behind */}
          <motion.div
            className="absolute left-1/2 top-1 h-10 w-10 -translate-x-1/2 rounded-full bg-brand-100"
            animate={{ scale: [1, 1.35, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
          />
          <motion.div
            className="absolute top-1.5 text-3xl will-change-transform"
            initial={{ x: '-25%' }}
            animate={{ x: ['-25%', '118%'], rotate: [-3, 3, -3] }}
            transition={{
              x: { duration: 1.15, repeat: Infinity, ease: 'easeInOut' },
              rotate: { duration: 0.4, repeat: Infinity, ease: 'easeInOut' },
            }}
          >
            🛵
          </motion.div>
          {/* Dashed road */}
          <motion.div
            className="absolute bottom-2 left-0 right-0 h-[3px] rounded-full"
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg,#cbd5e1 0 12px,transparent 12px 24px)',
              backgroundSize: '24px 3px',
            }}
            animate={{ backgroundPositionX: ['0px', '-24px'] }}
            transition={{ duration: 0.5, repeat: Infinity, ease: 'linear' }}
          />
        </div>

        <p className="font-display text-base font-bold text-ink">
          {label}
          <Dots />
        </p>
        {name && <p className="mt-0.5 truncate text-sm font-semibold text-brand-700">{name}</p>}
        <p className="mt-1 text-xs text-ink-muted">Crunching EMI &amp; fine details</p>

        {/* Progress bar */}
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
            initial={{ width: '8%' }}
            animate={{ width: ['8%', '64%', '92%'] }}
            transition={{ duration: 0.95, ease: 'easeOut' }}
          />
        </div>

        {/* Shimmer skeleton chips */}
        <div className="mt-4 flex items-center justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-2 w-10 rounded-full bg-surface-4"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Dots() {
  return (
    <span className="inline-flex">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        >
          .
        </motion.span>
      ))}
    </span>
  );
}
