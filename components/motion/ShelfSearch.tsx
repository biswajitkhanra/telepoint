'use client';

import { motion } from 'framer-motion';

/**
 * Inline search loader — a compact "records room" strip rendered directly
 * UNDER the search bar (never a full-screen takeover). Multiple people scan
 * multiple shelves for the customer file; files fly out of the shelves while
 * the query runs. Purely decorative: holds no data and shares no state with
 * the results that replace it.
 */

const SHELF_TINTS = [
  'from-amber-500/25 to-amber-500/5 border-amber-500/40',
  'from-sky-500/25 to-sky-500/5 border-sky-500/40',
  'from-violet-500/25 to-violet-500/5 border-violet-500/40',
];
const SEARCHERS = ['🕵️', '🧑‍💼', '👩‍💼'];

function Shelf({ index }: { index: number }) {
  return (
    <div className="relative flex-1 min-w-0">
      {/* The rack */}
      <div className={`flex flex-col gap-1 rounded-lg border bg-gradient-to-b p-1.5 ${SHELF_TINTS[index % SHELF_TINTS.length]}`}>
        {[0, 1].map(row => (
          <div key={row} className="flex justify-center gap-0.5 rounded bg-white/50 px-1 py-0.5 text-sm leading-none">
            {['📁', '📁', '📁', '📁'].map((f, i) => (
              <motion.span
                key={i}
                animate={{ y: [0, -2, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, delay: (index * 4 + row * 2 + i) * 0.07 }}
              >
                {f}
              </motion.span>
            ))}
          </div>
        ))}
      </div>

      {/* File pulled out of THIS shelf, flying down towards the results area */}
      <motion.span
        className="pointer-events-none absolute left-1/2 top-1 text-base"
        animate={{ y: [0, 46], x: [0, index % 2 ? 14 : -14], opacity: [0, 1, 0], rotate: [0, index % 2 ? 24 : -24] }}
        transition={{ duration: 1.1, repeat: Infinity, delay: 0.3 + index * 0.35, ease: 'easeIn' }}
      >
        📄
      </motion.span>

      {/* Searcher pacing in front of the shelf, rummaging */}
      <motion.span
        className="absolute -bottom-1 left-0 text-xl"
        animate={{ x: ['8%', '62%', '8%'], scaleX: [1, 1, -1, -1, 1] }}
        transition={{ duration: 1.6 + index * 0.3, repeat: Infinity, ease: 'easeInOut', delay: index * 0.2 }}
      >
        {SEARCHERS[index % SEARCHERS.length]}
      </motion.span>
    </div>
  );
}

export default function ShelfSearch() {
  return (
    <motion.div
      key="shelf-search"
      initial={{ opacity: 0, height: 0, y: -8 }}
      animate={{ opacity: 1, height: 'auto', y: 0 }}
      exit={{ opacity: 0, height: 0, y: -8 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="card mt-2 border-l-4 border-amber-500 bg-gradient-to-r from-amber-50 via-white to-violet-50 px-4 pb-4 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
            🔎 Searching the record shelves…
          </p>
          <motion.span
            className="text-[11px] text-ink-muted"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.1, repeat: Infinity }}
          >
            scanning files
          </motion.span>
        </div>
        <div className="flex items-end gap-3">
          <Shelf index={0} />
          <Shelf index={1} />
          <Shelf index={2} />
        </div>
      </div>
    </motion.div>
  );
}
