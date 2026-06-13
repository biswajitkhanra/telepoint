'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';

/**
 * Approval success celebration — emblems spin in FROM EVERY SCREEN EDGE and
 * converge on a big rotating ✓ badge, then the parent dismisses the overlay.
 *
 * Render-once by design: the parent mounts it ONLY inside the verified
 * success path (HTTP ok) and unmounts on a timer, so re-renders, state
 * refreshes and orientation changes can never replay it — the animation
 * belongs to the mount, not to renders.
 */

const EMBLEMS = ['✅', '✨', '🎉', '⭐', '💚', '✅', '✨', '🎉', '⭐', '💚', '✅', '✨'];

export default function SuccessBurst({ label = 'Payment Approved' }: { label?: string }) {
  // Random edge starts, computed once per mount.
  const flyers = useMemo(
    () =>
      EMBLEMS.map((emoji, i) => {
        const edge = i % 4; // 0 left, 1 right, 2 top, 3 bottom
        const along = 10 + Math.random() * 80;
        const start =
          edge === 0 ? { x: '-60vw', y: `${along - 50}vh` } :
          edge === 1 ? { x: '60vw', y: `${along - 50}vh` } :
          edge === 2 ? { x: `${along - 50}vw`, y: '-60vh' } :
                       { x: `${along - 50}vw`, y: '60vh' };
        return { emoji, start, delay: 0.05 + (i % 6) * 0.06, spin: i % 2 ? 720 : -720 };
      }),
    [],
  );

  return (
    <motion.div
      key="success-burst"
      className="pointer-events-none fixed inset-0 z-[130] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
      style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,0.18), rgba(15,23,42,0.55))' }}
      aria-live="polite"
    >
      {/* Emblems rotating in from all four edges */}
      {flyers.map((f, i) => (
        <motion.span
          key={i}
          className="absolute text-3xl"
          initial={{ x: f.start.x, y: f.start.y, rotate: 0, opacity: 0, scale: 0.6 }}
          animate={{ x: '0vw', y: '0vh', rotate: f.spin, opacity: [0, 1, 0], scale: [0.6, 1.2, 0.5] }}
          transition={{ duration: 0.95, delay: f.delay, ease: [0.16, 1, 0.3, 1] }}
        >
          {f.emoji}
        </motion.span>
      ))}

      {/* Rotating success ring */}
      <motion.div
        className="absolute h-64 w-64 rounded-full border-4 border-dashed border-emerald-300/80"
        initial={{ rotate: 0, scale: 0.4, opacity: 0 }}
        animate={{ rotate: 360, scale: 1, opacity: 1 }}
        transition={{ rotate: { duration: 2.2, repeat: Infinity, ease: 'linear' }, scale: { type: 'spring', stiffness: 260, damping: 18, delay: 0.25 }, opacity: { delay: 0.25 } }}
      />

      {/* BIG tick mark — a large gradient disc whose checkmark draws itself in,
         the centrepiece the moment a payment is approved. */}
      <motion.div
        className="relative flex flex-col items-center gap-4"
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 18, delay: 0.2 }}
      >
        <motion.div
          className="flex h-40 w-40 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 shadow-2xl shadow-emerald-500/60 ring-8 ring-white/40"
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 0.7, repeat: 3, delay: 0.5 }}
        >
          <svg viewBox="0 0 52 52" className="h-24 w-24" fill="none">
            <motion.path
              d="M14 27 L23 36 L39 18"
              stroke="white"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut', delay: 0.55 }}
              style={{ filter: 'drop-shadow(0 2px 4px rgba(6,78,59,0.45))' }}
            />
          </svg>
        </motion.div>
        <motion.p
          className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-2 text-base font-extrabold uppercase tracking-widest text-white shadow-xl shadow-emerald-500/50"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          {label}
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
