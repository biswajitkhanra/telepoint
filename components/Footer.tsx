'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

/**
 * Global footer — mounted in app/layout.tsx so it sits below every page and is
 * the single source of the developer attribution.
 *
 * Resting state shows the full credit — "Made By Biswodip Goj" — with the name
 * carrying a constant, smooth moving gradient (deep reds → violet → electric
 * blue), tuned to stay crystal-clear. Tapping it replays a contained celebration
 * chain that lives ENTIRELY inside the footer band (never the full page):
 *
 *   1. 3D PARTICLE BOMB — a compact burst of colourful light particles.
 *   2. 777 SLOT MACHINE — three glass reels spin and stop left → right on the
 *      name, then it settles back to the resting credit.
 *
 * Attribution is intentionally hidden on retailer-facing routes.
 */

type Phase = 'idle' | 'blast' | 'slots';

const NAME_WORDS = ['Biswodip', 'Goj'] as const;
const REELS = ['BISWODIP', '·', 'GOJ'] as const;

const COLORS = ['#f43f5e', '#ec4899', '#a855f7', '#8b5cf6', '#3b82f6', '#22d3ee', '#a3e635', '#facc15'];

interface Particle {
  id: number; x: number; y: number; z: number; rotate: number; size: number; color: string; delay: number;
}

// Compact spread so the whole burst stays inside the footer band.
function makeParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, id) => {
    const angle = (Math.PI * 2 * id) / count + Math.random() * 0.5;
    const dist = 36 + Math.random() * 70;
    return {
      id,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist * 0.5, // flatter — the band is short
      z: (Math.random() - 0.5) * 160,
      rotate: Math.random() * 540 - 270,
      size: 4 + Math.random() * 7,
      color: PARTICLE_COLORS[id % PARTICLE_COLORS.length],
      delay: Math.random() * 0.05,
    };
  });
}

export default function Footer() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('idle');
  const particles = useMemo(() => makeParticles(28), [phase === 'blast']); // eslint-disable-line react-hooks/exhaustive-deps

  const trigger = useCallback(() => {
    if (phase !== 'idle') return;
    if (reduceMotion) return; // name is already shown; nothing to animate

    setPhase('blast');
    window.setTimeout(() => setPhase('slots'), 650);
    window.setTimeout(() => setPhase('idle'), 650 + 1750);
  }, [phase, reduceMotion]);

  if (pathname?.startsWith('/login')) return null;

  return (
    <footer
      className="no-print relative mt-10 overflow-hidden px-4 py-7 text-center"
      style={{
        paddingBottom: 'max(28px, env(safe-area-inset-bottom))',
        background:
          'linear-gradient(120deg, #2e1065 0%, #1e3a8a 30%, #0a0d1a 52%, #4c1d95 74%, #831843 100%)',
        perspective: '900px',
      }}
    >
      {/* Eye-catching ambient colour orbs behind the glass */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(440px 220px at 12% 130%, rgba(236,72,153,0.45), transparent 60%),' +
            'radial-gradient(440px 220px at 88% -30%, rgba(34,211,238,0.40), transparent 60%),' +
            'radial-gradient(360px 200px at 50% 50%, rgba(168,85,247,0.30), transparent 65%)',
        }}
      />

      <div
        className="relative mx-auto flex min-h-[60px] max-w-2xl items-center justify-center"
        style={{ transformStyle: 'preserve-3d' }}
      >
        <AnimatePresence mode="wait">
          {/* ── Resting: full "Made By Biswodip Goj" credit ──────── */}
          {phase === 'idle' && (
            <motion.button
              key="credit"
              type="button"
              onClick={trigger}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.25, filter: 'blur(5px)' }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.93 }}
              className="glass-luxe rounded-full px-7 py-3"
              style={{ WebkitTapHighlightColor: 'transparent' }}
              aria-label="Made By Biswodip Goj — tap to celebrate"
              title="Tap me ✨"
            >
              <span className="flex items-center justify-center gap-x-[0.45ch] text-sm font-extrabold sm:text-base">
                <span className="text-white/90">Made&nbsp;By</span>
                {NAME_WORDS.map((word, i) => (
                  <span
                    key={word}
                    className="luxe-word"
                    style={{ animationDelay: `${i * -0.5}s` }}
                  >
                    {word}
                  </span>
                ))}
              </span>
            ))}
          </span>
        </motion.button>
      </footer>

          {/* ── Act 1: contained 3D particle bomb ────────────────── */}
          {phase === 'blast' && (
            <motion.div
              key="blast"
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ transformStyle: 'preserve-3d' }}
            >
              <motion.span
                className="absolute rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.9), rgba(168,85,247,0.4) 45%, transparent 70%)' }}
                initial={{ width: 10, height: 10, opacity: 0.9 }}
                animate={{ width: 180, height: 180, opacity: 0 }}
                transition={{ duration: 0.55, ease: 'easeOut' }}
              />
              {particles.map((p) => (
                <motion.span
                  key={p.id}
                  className="absolute rounded-[2px]"
                  style={{
                    width: p.size,
                    height: p.size,
                    background: p.color,
                    boxShadow: `0 0 10px ${p.color}, 0 0 4px ${p.color}`,
                  }}
                  initial={{ x: 0, y: 0, z: 0, scale: 1, opacity: 1, rotate: 0 }}
                  animate={{ x: p.x, y: p.y, z: p.z, rotate: p.rotate, scale: 0, opacity: 0 }}
                  transition={{ duration: 0.65, delay: p.delay, ease: [0.12, 0.8, 0.2, 1] }}
                />
              ))}
            </motion.div>
          )}

            {/* Close button */}
            <button
              onClick={(e) => { e.stopPropagation(); close(); }}
              className="glass-luxe absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full text-white"
              style={{ paddingTop: 'env(safe-area-inset-top)' }}
              aria-label="Close"
            >
              {REELS.map((label, i) => (
                <Reel key={i} label={label} index={i} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </footer>
  );
}

// ── 777 reel — spins lucky 7s then snaps to its label, with a stop-shake ────
function Reel({ label, index }: { label: string; index: number }) {
  const STOP_DELAY = 0.4 + index * 0.5;
  const strip = ['7', '7', '7', '7', '7', '7'];
  return (
    <div
      className="glass-luxe relative h-11 overflow-hidden rounded-xl px-3 sm:h-12"
      style={{ minWidth: label === '·' ? 24 : 92 }}
    >
      <motion.div
        className="absolute inset-x-0 top-0 flex flex-col items-center"
        initial={{ y: 0 }}
        animate={{ y: ['0%', '-83.33%'] }}
        transition={{ duration: 0.22, repeat: Infinity, ease: 'linear' }}
        style={{ filter: 'blur(0.4px)' }}
      >
        {strip.map((s, i) => (
          <span
            key={i}
            className="flex h-11 items-center justify-center text-2xl font-black text-amber-300 sm:h-12"
            style={{ textShadow: '0 0 14px rgba(250,204,21,0.7)' }}
          >
            {s}
          </span>
        ))}
      </motion.div>

      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        initial={{ y: '120%', opacity: 0 }}
        animate={{ y: '0%', opacity: 1 }}
        transition={{ delay: STOP_DELAY, type: 'spring', stiffness: 420, damping: 22 }}
      >
        <span
          className="bg-gradient-to-b from-white via-fuchsia-100 to-cyan-200 bg-clip-text text-xl font-black tracking-wider text-transparent sm:text-2xl"
          style={{ filter: 'drop-shadow(0 0 14px rgba(168,85,247,0.8))' }}
        >
          {label}
        </span>
      </motion.div>
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.22), transparent 38%, rgba(0,0,0,0.32))' }} />
    </motion.div>
  );
}

      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.18), transparent 40%, rgba(0,0,0,0.25))' }}
      />
    </div>
  );
}
