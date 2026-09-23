'use client';

import { motion } from 'framer-motion';

/**
 * Customer-open overlay. A single sheet rises into place (scale .96 → 1,
 * strong ease-out) carrying the customer's monogram inside a rotating
 * progress ring, their name, and a preview of the account layout. On exit
 * it lifts and blurs away as the real detail view takes over.
 *
 * Kept deliberately calm: one moving ring, one shimmer, one hairline track.
 */
export default function StackUnfold({ name }: { name?: string }) {
  const initial = (name || '').trim().charAt(0).toUpperCase() || '•';

  return (
    <motion.div
      key="stack-unfold"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.22, delay: 0.04 } }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 px-6 backdrop-blur-[3px]"
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 1.02, y: -6, filter: 'blur(4px)' }}
        transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
        className="su-sheet relative w-full max-w-[340px] overflow-hidden rounded-[22px] bg-surface p-5"
      >
        <div className="flex items-center gap-3.5">
          <div className="relative h-14 w-14 flex-shrink-0">
            <span className="su-ring absolute inset-0 rounded-full" aria-hidden="true" />
            <span className="absolute inset-[4px] flex items-center justify-center rounded-full bg-gradient-to-b from-brand-500 to-brand-700 text-lg font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
              {initial}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted">Opening account</p>
            <p className="mt-0.5 truncate text-[17px] font-semibold tracking-tight text-ink">
              {name || 'Customer'}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 keep-cols gap-2" aria-hidden="true">
          {[0, 1, 2].map(i => (
            <div key={i} className="su-tile rounded-xl p-2.5" style={{ animationDelay: `${120 + i * 60}ms` }}>
              <span className="ss-block block h-1.5 w-8 rounded-full" />
              <span className="ss-block mt-2 block h-3 w-12 rounded-full" />
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-2" aria-hidden="true">
          {[0.92, 0.74, 0.84].map((w, i) => (
            <span key={i} className="su-tile ss-block block h-2.5 rounded-full" style={{ width: `${w * 100}%`, animationDelay: `${300 + i * 60}ms` }} />
          ))}
        </div>

        <div className="ss-track mt-5 !relative !inset-auto rounded-full" aria-hidden="true"><span className="ss-track-bar" /></div>
      </motion.div>
    </motion.div>
  );
}
