'use client';

import { motion } from 'framer-motion';

/**
 * Inline search loader under the search bar. A small phone scrolls through a
 * customer ledger while a magnifying glass sweeps across it and ₹ coins hop
 * out; beside it the step copy, and below two rows shaped like the results so
 * the list lands without a jump. Pure CSS transform/opacity loops (`.fs-*`).
 */
const LEDGER = [0.9, 0.7, 0.8, 0.6, 0.85, 0.65];

export default function ShelfSearch() {
  return (
    <motion.div
      key="shelf-search"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.16, ease: [0.23, 1, 0.32, 1] } }}
      transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
      className="overflow-hidden"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="card relative mt-2 overflow-hidden">
        <div className="ss-track" aria-hidden="true"><span className="ss-track-bar" /></div>

        <div className="flex items-center gap-4 px-4 pb-2 pt-4">
          {/* Mini phone scanning the ledger */}
          <div className="fs-stage" aria-hidden="true">
            <div className="fs-phone">
              <span className="fs-notch" />
              <div className="fs-screen">
                <div className="fs-list">
                  {[...LEDGER, ...LEDGER].map((w, i) => (
                    <div key={i} className="fs-row">
                      <span className={`fs-dot ${i % 3 === 1 ? 'fs-dot--amber' : i % 3 === 2 ? 'fs-dot--blue' : ''}`} />
                      <span className="fs-line" style={{ width: `${w * 100}%` }} />
                    </div>
                  ))}
                </div>
                <span className="fs-beam" />
              </div>
            </div>
            <span className="fs-lens">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <circle cx="10" cy="10" r="6.5" fill="rgba(255,255,255,0.35)" stroke="#2a52c4" strokeWidth="2.4" />
                <path d="M15 15l5.5 5.5" stroke="#2a52c4" strokeWidth="2.8" strokeLinecap="round" />
                <path d="M7.2 8.2a3.4 3.4 0 012.6-1.9" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </span>
            {[0, 1, 2].map(i => (
              <span key={i} className="fs-coin" style={{ animationDelay: `${i * 0.42}s`, left: `${58 + i * 10}px` }}>₹</span>
            ))}
          </div>

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
              Finding customers
              <span className="ss-dots text-ink-muted" aria-hidden="true"><i /><i /><i /></span>
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">Matching name, IMEI and Aadhaar across every loan</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5" aria-hidden="true">
              {['Name', 'IMEI', 'Aadhaar'].map((t, i) => (
                <span key={t} className="fs-chip" style={{ animationDelay: `${i * 0.35}s` }}>{t}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Result-shaped placeholders */}
        <ul className="relative px-2 pb-2">
          {[0.62, 0.48].map((w, i) => (
            <li key={i} className="ss-row flex items-center gap-3 rounded-xl px-2 py-2.5" style={{ animationDelay: `${120 + i * 50}ms` }}>
              <span className="ss-block h-9 w-1 flex-shrink-0 rounded-full" />
              <span className="min-w-0 flex-1 space-y-2">
                <span className="ss-block block h-2.5 rounded-full" style={{ width: `${w * 100}%` }} />
                <span className="ss-block block h-2 rounded-full opacity-70" style={{ width: `${(w + 0.2) * 100}%` }} />
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
