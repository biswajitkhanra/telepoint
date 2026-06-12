'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

/**
 * Global footer — mounted in app/layout.tsx so it sits below every page
 * (admin, customer AND retailer) as the single developer attribution.
 *
 * AT REST it is colourless: just the credit "Made By Biswodip Goj" sitting on
 * the same background as the page, with only the name carrying a moving
 * gradient. There is no coloured panel until you interact.
 *
 * ON TAP it takes over the FULL SCREEN with a vibrant liquid-glass overlay and
 * plays a cinematic chain:
 *   1. COUNTDOWN  — 3 · 2 · 1 with pulsing energy rings.
 *   2. BOMB BLAST — multiple 3D particle bombs detonate across the screen.
 *   3. 777 SLOTS  — oversized glass reels spin and lock left → right.
 *   4. REVEAL     — "The Mastermind Behind The Code: Biswodip Goj" with every
 *                   word in a constant moving gradient, under a confetti rain.
 * Tap anywhere (or ✕) to dismiss back to the colourless resting credit.
 */

type Phase = 'countdown' | 'blast' | 'slots' | 'reveal';

const NAME_WORDS = ['Biswodip', 'Goj'] as const;
const REELS = ['BISWODIP', '·', 'GOJ'] as const;
const FINAL_LINE = 'The Mastermind Behind The Code: Biswodip Goj';

const COLORS = ['#f43f5e', '#ec4899', '#a855f7', '#8b5cf6', '#3b82f6', '#22d3ee', '#a3e635', '#facc15'];

interface Particle {
  id: number; x: number; y: number; z: number; rotate: number; size: number; color: string; delay: number;
}

function burst(count: number, spread: number): Particle[] {
  return Array.from({ length: count }, (_, id) => {
    const angle = (Math.PI * 2 * id) / count + Math.random() * 0.6;
    const dist = spread * (0.4 + Math.random() * 0.6);
    return {
      id,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      z: (Math.random() - 0.5) * 320,
      rotate: Math.random() * 720 - 360,
      size: 6 + Math.random() * 12,
      color: COLORS[id % COLORS.length],
      delay: Math.random() * 0.12,
    };
  });
}

export default function Footer() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<Phase>('countdown');
  const [count, setCount] = useState(3);

  const start = useCallback(() => {
    if (active) return;
    setActive(true);
    if (reduceMotion) { setPhase('reveal'); return; }
    setPhase('countdown');
    setCount(3);
  }, [active, reduceMotion]);

  const close = useCallback(() => {
    setActive(false);
    setPhase('countdown');
    setCount(3);
  }, []);

  // Countdown ticker: 3 → 2 → 1 → blast.
  useEffect(() => {
    if (!active || reduceMotion || phase !== 'countdown') return;
    if (count <= 0) { setPhase('blast'); return; }
    const t = window.setTimeout(() => setCount((c) => c - 1), 850);
    return () => window.clearTimeout(t);
  }, [active, reduceMotion, phase, count]);

  // Blast → slots → reveal timeline.
  useEffect(() => {
    if (!active || reduceMotion) return;
    if (phase === 'blast') {
      const t = window.setTimeout(() => setPhase('slots'), 1100);
      return () => window.clearTimeout(t);
    }
    if (phase === 'slots') {
      const t = window.setTimeout(() => setPhase('reveal'), 2400);
      return () => window.clearTimeout(t);
    }
  }, [active, reduceMotion, phase]);

  // Lock background scroll while the takeover is on screen.
  useEffect(() => {
    document.body.style.overflow = active ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [active]);

  if (pathname?.startsWith('/login')) return null;

  return (
    <>
      {/* ── Resting credit — colourless, blends with the page ─────── */}
      <footer
        className="no-print relative mt-10 px-4 pt-6 text-center"
        style={{ paddingBottom: 'max(96px, calc(env(safe-area-inset-bottom) + 88px))' }}
      >
        <motion.button
          type="button"
          onClick={start}
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.93 }}
          transition={{ type: 'spring', stiffness: 420, damping: 22 }}
          className="rounded-full px-5 py-2 text-sm font-bold sm:text-base"
          style={{ WebkitTapHighlightColor: 'transparent' }}
          aria-label="Made By Biswodip Goj — tap to celebrate"
          title="Tap me ✨"
        >
          <span className="flex items-center justify-center gap-x-[0.45ch]">
            <span className="text-ink/70">Made&nbsp;By</span>
            {NAME_WORDS.map((word, i) => (
              <span key={word} className="luxe-word" style={{ animationDelay: `${i * -0.5}s` }}>
                {word}
              </span>
            ))}
          </span>
        </motion.button>
      </footer>

      {/* ── Full-screen takeover ──────────────────────────────────── */}
      <AnimatePresence>
        {active && (
          <motion.div
            key="takeover"
            className="no-print fixed inset-0 z-[120] flex items-center justify-center overflow-hidden"
            onClick={phase === 'reveal' ? close : undefined}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.45 } }}
            style={{ perspective: '1000px', cursor: phase === 'reveal' ? 'pointer' : 'default' }}
          >
            {/* Animated vibrant void background */}
            <motion.div
              aria-hidden
              className="absolute inset-0"
              initial={{ scale: 1.1 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              style={{
                background:
                  'linear-gradient(125deg, #1e1b4b 0%, #2e1065 26%, #0a0d1a 50%, #4c1d95 74%, #831843 100%)',
                backgroundSize: '180% 180%',
                animation: reduceMotion ? undefined : 'pageAura 9s ease-in-out infinite alternate',
              }}
            />
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(60% 50% at 18% 110%, rgba(236,72,153,0.40), transparent 60%),' +
                  'radial-gradient(60% 50% at 82% -10%, rgba(34,211,238,0.40), transparent 60%),' +
                  'radial-gradient(50% 40% at 50% 50%, rgba(168,85,247,0.30), transparent 65%)',
              }}
            />

            {/* Close button */}
            <button
              onClick={(e) => { e.stopPropagation(); close(); }}
              className="glass-luxe absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full text-white"
              style={{ paddingTop: 'env(safe-area-inset-top)' }}
              aria-label="Close"
            >
              ✕
            </button>

            <div className="relative flex w-full max-w-3xl flex-col items-center px-6" style={{ transformStyle: 'preserve-3d' }}>
              <AnimatePresence mode="wait">
                {/* ── 1. Countdown ─────────────────────────────────── */}
                {phase === 'countdown' && (
                  <motion.div
                    key={`count-${count}`}
                    className="relative flex items-center justify-center"
                    initial={{ scale: 0.2, opacity: 0, rotate: -20 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    exit={{ scale: 2.4, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 16 }}
                  >
                    <motion.span
                      className="absolute rounded-full border-4 border-white/40"
                      initial={{ width: 60, height: 60, opacity: 0.8 }}
                      animate={{ width: 260, height: 260, opacity: 0 }}
                      transition={{ duration: 0.85, ease: 'easeOut' }}
                    />
                    <span
                      className="bg-gradient-to-br from-cyan-300 via-fuchsia-400 to-amber-300 bg-clip-text text-[7rem] font-black leading-none text-transparent sm:text-[10rem]"
                      style={{ filter: 'drop-shadow(0 0 28px rgba(168,85,247,0.8))' }}
                    >
                      {count}
                    </span>
                  </motion.div>
                )}

                {/* ── 2. Bomb blast ────────────────────────────────── */}
                {phase === 'blast' && (
                  <motion.div
                    key="blast"
                    className="relative flex h-72 w-full items-center justify-center"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{ transformStyle: 'preserve-3d' }}
                  >
                    <BombField />
                    <motion.span
                      className="absolute text-5xl font-black text-white sm:text-7xl"
                      initial={{ scale: 0.3, opacity: 0 }}
                      animate={{ scale: [0.3, 1.3, 1], opacity: [0, 1, 0] }}
                      transition={{ duration: 1, times: [0, 0.4, 1] }}
                      style={{ textShadow: '0 0 30px rgba(250,204,21,0.9)' }}
                    >
                      💥 BOOM 💥
                    </motion.span>
                  </motion.div>
                )}

                {/* ── 3. 777 slot machine ──────────────────────────── */}
                {phase === 'slots' && (
                  <motion.div
                    key="slots"
                    className="flex flex-col items-center gap-4"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.05 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  >
                    <motion.p
                      className="text-sm font-bold uppercase tracking-[0.4em] text-amber-300"
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      style={{ textShadow: '0 0 14px rgba(250,204,21,0.7)' }}
                    >
                      ✦ JACKPOT ✦
                    </motion.p>
                    <div className="flex items-center gap-3 sm:gap-4">
                      {REELS.map((label, i) => (
                        <Reel key={i} label={label} index={i} />
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* ── 4. Reveal ────────────────────────────────────── */}
                {phase === 'reveal' && (
                  <motion.div
                    key="reveal"
                    className="relative flex flex-col items-center gap-6"
                    initial={{ opacity: 0, y: 16, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {!reduceMotion && <Confetti />}
                    <motion.div
                      className="glass-luxe rounded-3xl px-7 py-7 sm:px-10"
                      initial={{ rotateX: 18 }}
                      animate={{ rotateX: 0 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 18 }}
                    >
                      <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.35em] text-white/60">
                        🏆 The Mastermind
                      </p>
                      <p className="flex flex-wrap items-center justify-center gap-x-[0.4ch] gap-y-1 text-center text-xl font-extrabold sm:text-3xl">
                        {FINAL_LINE.split(' ').map((word, i) => (
                          <motion.span
                            key={`${word}-${i}`}
                            className="luxe-word"
                            style={{ animationDelay: `${i * -0.35}s` }}
                            initial={{ opacity: 0, y: 12, scale: 0.8 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ delay: 0.08 * i, type: 'spring', stiffness: 360, damping: 18 }}
                          >
                            {word}
                          </motion.span>
                        ))}
                      </p>
                    </motion.div>
                    <motion.p
                      className="text-xs text-white/50"
                      animate={{ opacity: [0.3, 0.8, 0.3] }}
                      transition={{ duration: 1.6, repeat: Infinity }}
                    >
                      Tap anywhere to close
                    </motion.p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Multiple detonating bombs across the blast field ────────────────────────
function BombField() {
  const bombs = useMemo(
    () => [
      { x: '0%', y: '0%', d: 0, n: 22, s: 220 },
      { x: '-32%', y: '-18%', d: 0.18, n: 16, s: 170 },
      { x: '34%', y: '14%', d: 0.3, n: 16, s: 170 },
      { x: '-22%', y: '22%', d: 0.45, n: 14, s: 150 },
      { x: '26%', y: '-24%', d: 0.55, n: 14, s: 150 },
    ],
    [],
  );
  return (
    <>
      {bombs.map((b, bi) => (
        <div key={bi} className="absolute" style={{ left: '50%', top: '50%', transform: `translate(calc(-50% + ${b.x}), calc(-50% + ${b.y}))`, transformStyle: 'preserve-3d' }}>
          <motion.span
            className="absolute rounded-full"
            style={{ left: '50%', top: '50%', x: '-50%', y: '-50%', background: 'radial-gradient(circle, rgba(255,255,255,0.95), rgba(168,85,247,0.5) 45%, transparent 70%)' }}
            initial={{ width: 10, height: 10, opacity: 0.9 }}
            animate={{ width: b.s, height: b.s, opacity: 0 }}
            transition={{ duration: 0.7, delay: b.d, ease: 'easeOut' }}
          />
          {burst(b.n, b.s * 0.8).map((p) => (
            <motion.span
              key={p.id}
              className="absolute rounded-[2px]"
              style={{ left: '50%', top: '50%', width: p.size, height: p.size, background: p.color, boxShadow: `0 0 14px ${p.color}` }}
              initial={{ x: '-50%', y: '-50%', z: 0, scale: 1, opacity: 1, rotate: 0 }}
              animate={{ x: `calc(-50% + ${p.x}px)`, y: `calc(-50% + ${p.y}px)`, z: p.z, rotate: p.rotate, scale: 0, opacity: 0 }}
              transition={{ duration: 0.85, delay: b.d + p.delay, ease: [0.12, 0.8, 0.2, 1] }}
            />
          ))}
        </div>
      ))}
    </>
  );
}

// ── 777 reel — spins lucky 7s then snaps to its label, with a stop-shake ────
function Reel({ label, index }: { label: string; index: number }) {
  const STOP_DELAY = 0.5 + index * 0.65;
  const strip = ['7', '7', '7', '7', '7', '7'];
  return (
    <motion.div
      className="glass-luxe relative h-20 overflow-hidden rounded-2xl px-4 sm:h-24"
      style={{ minWidth: label === '·' ? 34 : 120 }}
      initial={{ y: 0 }}
      animate={{ y: [0, 0, -6, 6, 0] }}
      transition={{ delay: STOP_DELAY, duration: 0.35, times: [0, 0.5, 0.7, 0.85, 1] }}
    >
      <motion.div
        className="absolute inset-x-0 top-0 flex flex-col items-center"
        initial={{ y: 0 }}
        animate={{ y: ['0%', '-83.33%'] }}
        transition={{ duration: 0.18, repeat: Infinity, ease: 'linear' }}
        style={{ filter: 'blur(0.5px)' }}
      >
        {strip.map((s, i) => (
          <span key={i} className="flex h-20 items-center justify-center text-4xl font-black text-amber-300 sm:h-24 sm:text-5xl" style={{ textShadow: '0 0 18px rgba(250,204,21,0.8)' }}>
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

// ── Confetti rain for the reveal ────────────────────────────────────────────
function Confetti() {
  const pieces = useMemo(
    () => Array.from({ length: 60 }, (_, id) => ({
      id,
      left: Math.random() * 100,
      delay: Math.random() * 1.2,
      duration: 2.4 + Math.random() * 2,
      size: 6 + Math.random() * 8,
      color: COLORS[id % COLORS.length],
      rotate: Math.random() * 360,
      drift: (Math.random() - 0.5) * 120,
    })),
    [],
  );
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-[2px]"
          style={{ left: `${p.left}%`, top: -20, width: p.size, height: p.size * 0.5, background: p.color }}
          initial={{ y: -20, x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '105vh', x: p.drift, rotate: p.rotate + 540, opacity: [1, 1, 0.4] }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'linear' }}
        />
      ))}
    </div>
  );
}
