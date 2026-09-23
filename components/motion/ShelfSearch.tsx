'use client';

import { motion } from 'framer-motion';

/**
 * Inline search loader rendered directly under the search bar while the
 * customer query runs. It previews the SHAPE of the results (avatar, name,
 * meta line, status pill) so the list that replaces it lands without a jump,
 * with a hairline progress track and a single soft light band sweeping the
 * rows. Transform/opacity only; decorative, holds no data.
 */
const ROWS = [0.62, 0.48, 0.55];

export default function ShelfSearch() {
  return (
    <motion.div
      key="shelf-search"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.16, ease: [0.23, 1, 0.32, 1] } }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      className="overflow-hidden"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="card relative mt-2 overflow-hidden">
        <div className="ss-track" aria-hidden="true"><span className="ss-track-bar" /></div>

        <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-1">
          <span className="ss-lens" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
            </svg>
          </span>
          <p className="text-[13px] font-medium text-ink">Searching customers</p>
          <span className="ss-dots text-ink-muted" aria-hidden="true"><i /><i /><i /></span>
        </div>

        <ul className="relative px-2 pb-2 pt-1">
          {ROWS.map((w, i) => (
            <li
              key={i}
              className="ss-row flex items-center gap-3 rounded-xl px-2 py-2.5"
              style={{ animationDelay: `${i * 45}ms` }}
            >
              <span className="ss-block h-9 w-9 flex-shrink-0 rounded-[10px]" />
              <span className="min-w-0 flex-1 space-y-2">
                <span className="ss-block block h-2.5 rounded-full" style={{ width: `${w * 100}%` }} />
                <span className="ss-block block h-2 rounded-full opacity-70" style={{ width: `${(w - 0.18) * 100}%` }} />
              </span>
              <span className="ss-block h-5 w-16 flex-shrink-0 rounded-md" />
            </li>
          ))}
          <span className="ss-sweep" aria-hidden="true" />
        </ul>
      </div>
    </motion.div>
  );
}
