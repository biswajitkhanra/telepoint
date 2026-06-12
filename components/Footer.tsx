'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

/**
 * Global footer — mounted in app/layout.tsx so it sits below every page.
 *
 * Cyber-Luxe interactive attribution. The footer opens in a calm "Made By"
 * resting state; tapping it triggers a three-act animation chain:
 *
 *   1. 3D PARTICLE BOMB — the "Made By" label vaporizes into a burst of
 *      colourful light particles that fly out (and back through Z) from the
 *      exact click point.
 *   2. 777 SLOT MACHINE — three digital reels spin and stop sequentially,
 *      left → right, settling on the developer's name.
 *   3. MOVING GRADIENT REVEAL — the full credit line stays on screen, every
 *      word carrying a constant smooth gradient (deep reds → violet → blue)
 *      tuned to stay crystal-clear and readable.
 *
 * Attribution is intentionally hidden on retailer-facing routes.
 */

type Phase = 'idle' | 'blast' | 'slots' | 'revealed';

const REELS = ['BISWODIP', '·', 'GOJ'] as const;
const FINAL_LINE = 'The Mastermind Behind The Code: Biswodip Goj';

// Particle colour set — electric pinks, ultraviolet, cyan, lime.
const PARTICLE_COLORS = [
  '#f43f5e', '#ec4899', '#a855f7', '#8b5cf6',
  '#3b82f6', '#22d3ee', '#a3e635', '#facc15',
];

interface Particle {
  id: number;
  x: number; y: number; z: number;
  rotate: number;
  size: number;
  color: string;
  delay: number;
}

function makeParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, id) => {
    const angle = (Math.PI * 2 * id) / count + Math.random() * 0.5;
    const dist = 60 + Math.random() * 140;
    return {
      id,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist - 20, // slight upward bias — fireworks feel
      z: (Math.random() - 0.5) * 240,
      rotate: Math.random() * 720 - 360,
      size: 5 + Math.random() * 9,
      color: PARTICLE_COLORS[id % PARTICLE_COLORS.length],
      delay: Math.random() * 0.06,
    };
  });
}

export default function Footer() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('idle');
  const containerRef = useRef<HTMLDivElement>(null);
  const particles = useMemo(() => makeParticles(34), [phase === 'blast']); // eslint-disable-line react-hooks/exhaustive-deps

  const trigger = useCallback(() => {
    if (phase !== 'idle' && phase !== 'revealed') return;

    // Reduced-motion users skip straight to the readable reveal.
    if (reduceMotion) {
      setPhase('revealed');
      return;
    }

    setPhase('blast');
    // Blast settles → reels spin in.
    window.setTimeout(() => setPhase('slots'), 750);
    // Reels stop left→right (staggered inside) → final line locks in.
    window.setTimeout(() => setPhase('revealed'), 750 + 1850);
  }, [phase, reduceMotion]);

  if (pathname?.startsWith('/retailer')) return null;

  return (
    <footer
      className="no-print relative mt-10 overflow-hidden px-4 py-7 text-center"
      style={{
        paddingBottom: 'max(28px, env(safe-area-inset-bottom))',
        background:
          'linear-gradient(135deg, #0a0d1a 0%, #161d35 45%, #1e1b4b 75%, #0a0d1a 100%)',
        perspective: '900px',
      }}
    >
      {/* Ambient colour orbs behind the glass */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(420px 200px at 15% 120%, rgba(168,85,247,0.30), transparent 60%),' +
            'radial-gradient(420px 200px at 85% -20%, rgba(59,130,246,0.30), transparent 60%),' +
            'radial-gradient(300px 160px at 50% 50%, rgba(244,63,94,0.18), transparent 65%)',
        }}
      />

      <div
        ref={containerRef}
        className="relative mx-auto flex min-h-[68px] max-w-2xl items-center justify-center"
        style={{ transformStyle: 'preserve-3d' }}
      >
        <AnimatePresence mode="wait">
          {/* ── Act 0: resting "Made By" ─────────────────────────── */}
          {phase === 'idle' && (
            <motion.button
              key="made-by"
              type="button"
              onClick={trigger}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.6, filter: 'blur(6px)' }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ scale: 1.06, y: -2 }}
              whileTap={{ scale: 0.92 }}
              className="glass-luxe group rounded-full px-7 py-3 text-sm font-bold tracking-wide text-white"
              style={{ WebkitTapHighlightColor: 'transparent' }}
              aria-label="Reveal the mastermind behind the code"
            >
              <span className="bg-gradient-to-r from-cyan-300 via-fuchsia-300 to-amber-200 bg-clip-text text-transparent">
                Made&nbsp;By
              </span>
              <span className="ml-2 inline-block text-white/50 transition-transform duration-300 group-hover:translate-x-0.5">
                ✦
              </span>
            </motion.button>
          )}

          {/* ── Act 1: 3D particle bomb blast ────────────────────── */}
          {phase === 'blast' && (
            <motion.div
              key="blast"
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ transformStyle: 'preserve-3d' }}
            >
              {/* Shockwave flash */}
              <motion.span
                className="absolute rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.9), rgba(168,85,247,0.4) 45%, transparent 70%)' }}
                initial={{ width: 12, height: 12, opacity: 0.9 }}
                animate={{ width: 320, height: 320, opacity: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
              {particles.map((p) => (
                <motion.span
                  key={p.id}
                  className="absolute rounded-[2px]"
                  style={{
                    width: p.size,
                    height: p.size,
                    background: p.color,
                    boxShadow: `0 0 12px ${p.color}, 0 0 4px ${p.color}`,
                  }}
                  initial={{ x: 0, y: 0, z: 0, scale: 1, opacity: 1, rotate: 0 }}
                  animate={{
                    x: p.x,
                    y: p.y,
                    z: p.z,
                    rotate: p.rotate,
                    scale: 0,
                    opacity: 0,
                  }}
                  transition={{ duration: 0.7, delay: p.delay, ease: [0.12, 0.8, 0.2, 1] }}
                />
              ))}
            </motion.div>
          )}

          {/* ── Act 2: 777 slot machine ──────────────────────────── */}
          {phase === 'slots' && (
            <motion.div
              key="slots"
              className="flex items-center gap-2 sm:gap-3"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.04 }}
              transition={{ duration: 0.25 }}
            >
              {REELS.map((label, i) => (
                <Reel key={i} label={label} index={i} />
              ))}
            </motion.div>
          )}

          {/* ── Act 3: moving-gradient reveal ────────────────────── */}
          {phase === 'revealed' && (
            <motion.button
              key="revealed"
              type="button"
              onClick={trigger}
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="glass-luxe rounded-2xl px-5 py-3"
              aria-label="The Mastermind Behind The Code: Biswodip Goj — tap to replay"
              title="Tap to replay"
            >
              <p className="flex flex-wrap items-center justify-center gap-x-[0.4ch] gap-y-0.5 text-sm font-extrabold sm:text-base">
                {FINAL_LINE.split(' ').map((word, i) => (
                  <motion.span
                    key={`${word}-${i}`}
                    className="luxe-word"
                    style={{ animationDelay: `${i * -0.4}s` }}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * i, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {word}
                  </motion.span>
                ))}
              </p>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </footer>
  );
}

// ── 777 reel ──────────────────────────────────────────────────────────────
// Each reel spins through a strip of lucky 7s, then snaps to its label.
// Reels stop sequentially left → right via a per-index delay.
function Reel({ label, index }: { label: string; index: number }) {
  const STOP_DELAY = 0.45 + index * 0.55; // left reel locks first
  const strip = ['7', '7', '7', '7', '7', '7'];

  return (
    <div
      className="glass-luxe relative h-12 overflow-hidden rounded-xl px-3 sm:h-14"
      style={{ minWidth: label === '·' ? 26 : 96 }}
    >
      {/* Spinning 7s */}
      <motion.div
        className="absolute inset-x-0 top-0 flex flex-col items-center"
        initial={{ y: 0 }}
        animate={{ y: ['0%', '-83.33%'] }}
        transition={{
          duration: 0.22,
          repeat: Infinity,
          ease: 'linear',
        }}
        style={{ filter: 'blur(0.4px)' }}
      >
        {strip.map((s, i) => (
          <span
            key={i}
            className="flex h-12 items-center justify-center text-2xl font-black text-amber-300 sm:h-14"
            style={{ textShadow: '0 0 14px rgba(250,204,21,0.7)' }}
          >
            {s}
          </span>
        ))}
      </motion.div>

      {/* Locked-in label slides up over the spin once the reel "stops" */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        initial={{ y: '110%', opacity: 0 }}
        animate={{ y: '0%', opacity: 1 }}
        transition={{ delay: STOP_DELAY, type: 'spring', stiffness: 420, damping: 24 }}
      >
        <span
          className="bg-gradient-to-b from-white via-fuchsia-100 to-cyan-200 bg-clip-text text-base font-black tracking-wider text-transparent sm:text-lg"
          style={{ filter: 'drop-shadow(0 0 10px rgba(168,85,247,0.7))' }}
        >
          {label}
        </span>
      </motion.div>

      {/* Reel glass sheen */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.18), transparent 40%, rgba(0,0,0,0.25))' }}
      />
    </div>
  );
}
