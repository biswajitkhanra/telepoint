'use client';

import { motion } from 'framer-motion';

/**
 * Full-screen customer-search loader — a goofy skeleton dancing with a phone
 * under disco lights while the search runs. Shown by the admin + retailer
 * dashboards whenever a customer search is in flight; the results replace it
 * the moment the query resolves (pages keep it up for a short minimum so the
 * dance is always visible, never a flash).
 */
export default function SkeletonDance() {
  return (
    <motion.div
      key="skeleton-dance"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center overflow-hidden"
      style={{
        background:
          'radial-gradient(700px 420px at 20% 10%, rgba(236,72,153,0.35), transparent 60%),' +
          'radial-gradient(700px 420px at 80% 90%, rgba(34,211,238,0.35), transparent 60%),' +
          'radial-gradient(600px 500px at 50% 50%, rgba(168,85,247,0.30), transparent 65%),' +
          'linear-gradient(135deg, #0f172a, #1e1b4b 55%, #312e81)',
      }}
      aria-busy="true"
      aria-live="polite"
    >
      {/* Disco light sweeps */}
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="pointer-events-none absolute h-72 w-72 rounded-full blur-3xl"
          style={{
            background: ['rgba(244,63,94,0.35)', 'rgba(34,211,238,0.3)', 'rgba(163,230,53,0.28)'][i],
            top: `${15 + i * 25}%`,
          }}
          animate={{ left: ['-10%', '85%', '-10%'] }}
          transition={{ duration: 5 + i * 1.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.6 }}
        />
      ))}

      {/* Floating music notes */}
      {['🎵', '🎶', '🎵', '🎶', '✨'].map((n, i) => (
        <motion.span
          key={i}
          className="pointer-events-none absolute text-2xl"
          style={{ left: `${12 + i * 18}%`, bottom: '30%' }}
          animate={{ y: [-6, -90], opacity: [0, 1, 0], rotate: [0, i % 2 ? 28 : -28] }}
          transition={{ duration: 2.1, repeat: Infinity, delay: i * 0.45, ease: 'easeOut' }}
        >
          {n}
        </motion.span>
      ))}

      {/* ── The dancing skeleton ── */}
      <motion.div
        className="relative flex flex-col items-center"
        animate={{ y: [0, -16, 0], rotate: [-3, 3, -3] }}
        transition={{ duration: 0.62, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* Head */}
        <motion.div
          className="text-7xl leading-none drop-shadow-[0_0_18px_rgba(255,255,255,0.45)]"
          animate={{ rotate: [-14, 14, -14] }}
          transition={{ duration: 0.62, repeat: Infinity, ease: 'easeInOut' }}
        >
          💀
        </motion.div>

        {/* Torso + arms */}
        <div className="relative -mt-1 flex items-center">
          {/* Left arm waving a bone */}
          <motion.div
            className="origin-right text-4xl"
            animate={{ rotate: [-55, 15, -55] }}
            transition={{ duration: 0.62, repeat: Infinity, ease: 'easeInOut' }}
          >
            🦴
          </motion.div>
          {/* Ribcage — pure divs so it renders identically everywhere */}
          <motion.div
            className="relative mx-2 h-10 w-10"
            animate={{ scaleX: [1, 1.14, 1] }}
            transition={{ duration: 0.31, repeat: Infinity, ease: 'easeInOut' }}
          >
            {/* spine */}
            <div className="absolute left-1/2 top-0 h-10 w-1.5 -translate-x-1/2 rounded-full bg-white/90 shadow-[0_0_10px_rgba(255,255,255,0.6)]" />
            {/* ribs */}
            <div className="absolute left-1/2 top-1 h-1.5 w-9 -translate-x-1/2 rounded-full bg-white/90" />
            <div className="absolute left-1/2 top-4 h-1.5 w-7 -translate-x-1/2 rounded-full bg-white/90" />
            <div className="absolute left-1/2 top-7 h-1.5 w-5 -translate-x-1/2 rounded-full bg-white/90" />
          </motion.div>
          {/* Right arm holding THE PHONE */}
          <motion.div
            className="origin-left text-4xl"
            animate={{ rotate: [40, -20, 40] }}
            transition={{ duration: 0.62, repeat: Infinity, ease: 'easeInOut' }}
          >
            📱
          </motion.div>
        </div>

        {/* Hips + legs kicking */}
        <motion.div
          className="-mt-1 flex gap-1"
          animate={{ x: [-10, 10, -10] }}
          transition={{ duration: 0.62, repeat: Infinity, ease: 'easeInOut' }}
        >
          <motion.span
            className="origin-top text-3xl"
            animate={{ rotate: [-30, 25, -30] }}
            transition={{ duration: 0.62, repeat: Infinity, ease: 'easeInOut' }}
          >
            🦴
          </motion.span>
          <motion.span
            className="origin-top text-3xl"
            animate={{ rotate: [25, -30, 25] }}
            transition={{ duration: 0.62, repeat: Infinity, ease: 'easeInOut', delay: 0.31 }}
          >
            🦴
          </motion.span>
        </motion.div>

        {/* Dance floor glow */}
        <motion.div
          className="mt-3 h-3 w-44 rounded-full"
          style={{ background: 'radial-gradient(closest-side, rgba(255,255,255,0.55), transparent)' }}
          animate={{ scaleX: [1, 0.75, 1], opacity: [0.7, 0.4, 0.7] }}
          transition={{ duration: 0.62, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>

      {/* Caption */}
      <motion.p
        className="mt-8 text-base font-bold text-white drop-shadow"
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 1.2, repeat: Infinity }}
      >
        Searching customers…
      </motion.p>
      <p className="mt-1 text-xs text-white/70">The skeleton crew is digging through the records 📂</p>
    </motion.div>
  );
}
