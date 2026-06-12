'use client';

import { motion } from 'framer-motion';

/**
 * Customer-open loader — a CREW of goofy skeletons dancing with their phones
 * under disco lights while the customer's record loads. Shown the moment a
 * single customer is clicked/opened (admin + retailer dashboards).
 *
 * The exit is the punchline: the centre skeleton's phone zooms out at the
 * viewer with a white flash, so the customer popup feels like it came OUT of
 * the skeleton's phone.
 */

function Bone({ className, delayOffset = 0, from = -55, to = 15 }: {
  className?: string; delayOffset?: number; from?: number; to?: number;
}) {
  return (
    <motion.span
      className={className}
      animate={{ rotate: [from, to, from] }}
      transition={{ duration: 0.62, repeat: Infinity, ease: 'easeInOut', delay: delayOffset }}
    >
      🦴
    </motion.span>
  );
}

function DancingSkeleton({ scale = 1, delay = 0, phoneIsHero = false }: {
  scale?: number; delay?: number; phoneIsHero?: boolean;
}) {
  return (
    <motion.div
      className="relative flex flex-col items-center"
      style={{ scale }}
      animate={{ y: [0, -16, 0], rotate: [-3, 3, -3] }}
      transition={{ duration: 0.62, repeat: Infinity, ease: 'easeInOut', delay }}
    >
      {/* Head */}
      <motion.div
        className="text-6xl leading-none drop-shadow-[0_0_18px_rgba(255,255,255,0.45)]"
        animate={{ rotate: [-14, 14, -14] }}
        transition={{ duration: 0.62, repeat: Infinity, ease: 'easeInOut', delay }}
      >
        💀
      </motion.div>

      {/* Torso + arms */}
      <div className="relative -mt-1 flex items-center">
        <Bone className="origin-right text-3xl" delayOffset={delay} />
        {/* Ribcage — pure divs so it renders identically everywhere */}
        <motion.div
          className="relative mx-2 h-10 w-10"
          animate={{ scaleX: [1, 1.14, 1] }}
          transition={{ duration: 0.31, repeat: Infinity, ease: 'easeInOut', delay }}
        >
          <div className="absolute left-1/2 top-0 h-10 w-1.5 -translate-x-1/2 rounded-full bg-white/90 shadow-[0_0_10px_rgba(255,255,255,0.6)]" />
          <div className="absolute left-1/2 top-1 h-1.5 w-9 -translate-x-1/2 rounded-full bg-white/90" />
          <div className="absolute left-1/2 top-4 h-1.5 w-7 -translate-x-1/2 rounded-full bg-white/90" />
          <div className="absolute left-1/2 top-7 h-1.5 w-5 -translate-x-1/2 rounded-full bg-white/90" />
        </motion.div>
        {/* Phone hand — every skeleton in the crew has one */}
        <motion.div
          className="origin-left text-3xl"
          animate={{ rotate: [40, -20, 40] }}
          transition={{ duration: 0.62, repeat: Infinity, ease: 'easeInOut', delay }}
          // The hero phone zooms at the viewer on exit — the popup "comes out
          // of the skeleton's phone".
          {...(phoneIsHero ? { exit: { scale: 14, opacity: 0, transition: { duration: 0.45, ease: 'easeIn' } } } : {})}
        >
          📱
        </motion.div>
      </div>

      {/* Hips + legs kicking */}
      <motion.div
        className="-mt-1 flex gap-1"
        animate={{ x: [-10, 10, -10] }}
        transition={{ duration: 0.62, repeat: Infinity, ease: 'easeInOut', delay }}
      >
        <Bone className="origin-top text-2xl" from={-30} to={25} delayOffset={delay} />
        <Bone className="origin-top text-2xl" from={25} to={-30} delayOffset={delay + 0.31} />
      </motion.div>

      {/* Dance floor glow */}
      <motion.div
        className="mt-3 h-3 w-36 rounded-full"
        style={{ background: 'radial-gradient(closest-side, rgba(255,255,255,0.55), transparent)' }}
        animate={{ scaleX: [1, 0.75, 1], opacity: [0.7, 0.4, 0.7] }}
        transition={{ duration: 0.62, repeat: Infinity, ease: 'easeInOut', delay }}
      />
    </motion.div>
  );
}

export default function SkeletonDance({ name }: { name?: string }) {
  return (
    <motion.div
      key="skeleton-dance"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.45 } }}
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

      {/* ── The skeleton crew — phones out, dancing ── */}
      <div className="flex items-end gap-4 sm:gap-10">
        <DancingSkeleton scale={0.72} delay={0.2} />
        <DancingSkeleton scale={1.05} phoneIsHero />
        <DancingSkeleton scale={0.72} delay={0.42} />
      </div>

      {/* White flash that blooms on exit, selling the popup-out-of-the-phone */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0 }}
        exit={{ opacity: [0, 0.9, 0], transition: { duration: 0.45, times: [0, 0.4, 1] } }}
        style={{ background: 'radial-gradient(circle at 50% 48%, rgba(255,255,255,0.95), transparent 55%)' }}
      />

      {/* Caption */}
      <motion.p
        className="mt-8 text-base font-bold text-white drop-shadow"
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 1.2, repeat: Infinity }}
      >
        Opening customer…
      </motion.p>
      {name && <p className="mt-1 max-w-[80vw] truncate text-sm font-semibold text-amber-300">{name}</p>}
      <p className="mt-1 text-xs text-white/70">The skeleton crew is pulling it up on their phones 📲</p>
    </motion.div>
  );
}
