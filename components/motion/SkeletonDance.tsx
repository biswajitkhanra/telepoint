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
        className="text-6xl leading-none drop-shadow-[0_3px_10px_rgba(15,23,42,0.45)]"
        animate={{ rotate: [-14, 14, -14] }}
        transition={{ duration: 0.62, repeat: Infinity, ease: 'easeInOut', delay }}
      >
        💀
      </motion.div>

      {/* Torso + arms */}
      <div className="relative -mt-1 flex items-center">
        <Bone className="origin-right text-3xl drop-shadow-[0_2px_6px_rgba(15,23,42,0.4)]" delayOffset={delay} />
        {/* Ribcage — pure divs so it renders identically everywhere. Bones are a
           solid slate so the skeleton stays crisp over the now-transparent
           background (it dances over whatever page is behind it). */}
        <motion.div
          className="relative mx-2 h-10 w-10"
          animate={{ scaleX: [1, 1.14, 1] }}
          transition={{ duration: 0.31, repeat: Infinity, ease: 'easeInOut', delay }}
        >
          <div className="absolute left-1/2 top-0 h-10 w-1.5 -translate-x-1/2 rounded-full bg-slate-700 shadow-[0_1px_4px_rgba(15,23,42,0.5)]" />
          <div className="absolute left-1/2 top-1 h-1.5 w-9 -translate-x-1/2 rounded-full bg-slate-700" />
          <div className="absolute left-1/2 top-4 h-1.5 w-7 -translate-x-1/2 rounded-full bg-slate-700" />
          <div className="absolute left-1/2 top-7 h-1.5 w-5 -translate-x-1/2 rounded-full bg-slate-700" />
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
        <Bone className="origin-top text-2xl drop-shadow-[0_2px_6px_rgba(15,23,42,0.4)]" from={-30} to={25} delayOffset={delay} />
        <Bone className="origin-top text-2xl drop-shadow-[0_2px_6px_rgba(15,23,42,0.4)]" from={25} to={-30} delayOffset={delay + 0.31} />
      </motion.div>

      {/* Dance floor shadow — a soft contact shadow so the skeleton looks
         grounded on the transparent stage. */}
      <motion.div
        className="mt-3 h-3 w-36 rounded-full"
        style={{ background: 'radial-gradient(closest-side, rgba(15,23,42,0.28), transparent)' }}
        animate={{ scaleX: [1, 0.75, 1], opacity: [0.6, 0.35, 0.6] }}
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
      // No colour wash — the background stays fully transparent so ONLY the
      // skeletons dancing with their phones appear on screen, over whatever
      // page is loading behind them.
      style={{ background: 'transparent' }}
      aria-busy="true"
      aria-live="polite"
    >
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

      {/* Caption — dark, chip-backed text so it stays legible on the
         transparent stage regardless of the page behind it. */}
      <motion.p
        className="mt-8 rounded-full bg-slate-900/85 px-4 py-1.5 text-base font-bold text-white shadow-lg"
        animate={{ opacity: [0.75, 1, 0.75] }}
        transition={{ duration: 1.2, repeat: Infinity }}
      >
        Opening customer…
      </motion.p>
      {name && <p className="mt-2 max-w-[80vw] truncate rounded-full bg-amber-500 px-3 py-1 text-sm font-semibold text-white shadow">{name}</p>}
      <p className="mt-2 rounded-full bg-slate-900/70 px-3 py-1 text-xs text-white/90">The skeleton crew is pulling it up on their phones 📲</p>
    </motion.div>
  );
}
