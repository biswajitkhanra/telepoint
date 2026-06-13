'use client';

import { motion } from 'framer-motion';

/**
 * Customer-open loader — "Stack Unfold".
 *
 * The customer card sits on top of a little stack of papers. While the record
 * loads we replay the beat the user described: the top card slides forward,
 * the cards behind shift backward slightly, and the top card unfolds open.
 * On exit the top card blooms to full screen, so the customer popup feels like
 * it unfolded straight out of the stack.
 *
 * A soft dimmed stage sits behind the cards so the white "paper" reads clearly
 * over whatever page is loading underneath.
 */

const LOOP = 2.4;

// A faux customer card face — paper with an accent header + content lines.
function CardFace({ sheen = false }: { sheen?: boolean }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
      <div className="h-7 w-full rounded-lg bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500" />
      <div className="mt-3 space-y-2">
        <div className="h-3 w-2/3 rounded-full bg-slate-200" />
        <div className="h-3 w-1/2 rounded-full bg-slate-200" />
        <div className="h-3 w-4/5 rounded-full bg-slate-100" />
      </div>
      <div className="mt-4 flex gap-2">
        <div className="h-6 w-16 rounded-full bg-emerald-100" />
        <div className="h-6 w-16 rounded-full bg-sky-100" />
      </div>
      {sheen && (
        <motion.div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.6) 50%, transparent 70%)' }}
          animate={{ x: ['-120%', '220%'] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </div>
  );
}

export default function StackUnfold({ name }: { name?: string }) {
  // Backing papers behind the hero card (deepest first).
  const backing = [3, 2, 1];

  return (
    <motion.div
      key="stack-unfold"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center overflow-hidden bg-slate-900/35 backdrop-blur-sm"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="relative" style={{ width: 240, height: 150, perspective: 1100 }}>
        {/* Backing cards — shift backward slightly on each loop */}
        {backing.map((depth, idx) => {
          const dir = idx % 2 ? 1 : -1;
          return (
            <motion.div
              key={depth}
              className="absolute inset-0"
              style={{ transformOrigin: 'center top' }}
              animate={{
                y: [depth * 8, depth * 8 + 7, depth * 8],
                x: [dir * depth * 4, dir * depth * 7, dir * depth * 4],
                rotate: [dir * depth, dir * (depth + 1.5), dir * depth],
                scale: [1 - depth * 0.05, 1 - depth * 0.07, 1 - depth * 0.05],
              }}
              transition={{ duration: LOOP, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div
                className="h-full w-full rounded-2xl border border-slate-200 bg-white shadow-lg"
                style={{ opacity: 1 - depth * 0.16 }}
              />
            </motion.div>
          );
        })}

        {/* Hero card — slides forward, then unfolds open */}
        <motion.div
          className="absolute inset-0"
          style={{ transformOrigin: 'center top' }}
          animate={{ y: [0, 34, 34, 0], scale: [1, 1.08, 1.1, 1] }}
          transition={{ duration: LOOP, repeat: Infinity, ease: 'easeInOut', times: [0, 0.3, 0.7, 1] }}
          // On exit the top card blooms to full screen — the popup "unfolds"
          // straight out of the stack.
          exit={{ scale: 6, opacity: 0, transition: { duration: 0.45, ease: 'easeIn' } }}
        >
          {/* Unfolding flap — a second sheet that flips open from the top edge */}
          <motion.div
            className="absolute inset-0 origin-top"
            style={{ transformStyle: 'preserve-3d' }}
            animate={{ rotateX: [90, 90, 0, 90], opacity: [0, 0.5, 1, 0] }}
            transition={{ duration: LOOP, repeat: Infinity, ease: 'easeInOut', times: [0, 0.3, 0.7, 1] }}
          >
            <CardFace />
          </motion.div>
          <CardFace sheen />
        </motion.div>
      </div>

      {/* Caption */}
      <motion.p
        className="mt-14 rounded-full bg-slate-900/85 px-4 py-1.5 text-base font-bold text-white shadow-lg"
        animate={{ opacity: [0.75, 1, 0.75] }}
        transition={{ duration: 1.2, repeat: Infinity }}
      >
        Opening customer…
      </motion.p>
      {name && <p className="mt-2 max-w-[80vw] truncate rounded-full bg-amber-500 px-3 py-1 text-sm font-semibold text-white shadow">{name}</p>}
      <p className="mt-2 rounded-full bg-slate-900/70 px-3 py-1 text-xs text-white/90">Unfolding the customer card…</p>
    </motion.div>
  );
}
