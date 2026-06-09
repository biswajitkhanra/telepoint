'use client';

/**
 * Shared motion primitives — a tiny, reusable animation system built on
 * framer-motion. Purely presentational: these wrappers add page-entry reveals,
 * staggered lists, hover-lift cards, count-up numbers and animated progress.
 * No business logic lives here.
 */

import {
  motion,
  useInView,
  useMotionValue,
  useSpring,
  useTransform,
  AnimatePresence,
  type Variants,
} from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';

/* Easing used across the app — an expressive "out-expo"-ish curve. */
export const EASE = [0.16, 1, 0.3, 1] as const;
export const SPRING = { type: 'spring', stiffness: 380, damping: 30, mass: 0.7 } as const;

/* ── Reveal — fade + rise into view on scroll/mount ───────────────────────── */
export function Reveal({
  children,
  delay = 0,
  y = 18,
  className = '',
  once = true,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  once?: boolean;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount: 0.2 }}
      transition={{ duration: 0.55, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/* ── Stagger — orchestrates child reveals in sequence ─────────────────────── */
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: SPRING },
};

export function Stagger({
  children,
  className = '',
  amount = 0.15,
}: {
  children: ReactNode;
  className?: string;
  amount?: number;
}) {
  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}

/* ── HoverCard — subtle elevate / press feedback ──────────────────────────── */
export function HoverCard({
  children,
  className = '',
  onClick,
  lift = -4,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  lift?: number;
}) {
  return (
    <motion.div
      className={className}
      onClick={onClick}
      whileHover={{ y: lift }}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      transition={SPRING}
    >
      {children}
    </motion.div>
  );
}

/* ── CountUp — animates a number from 0 → value when it enters view ───────── */
export function CountUp({
  value,
  format = (n: number) => String(Math.round(n)),
  className = '',
  duration = 1.2,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { duration: duration * 1000, bounce: 0 });
  const display = useTransform(spring, (latest) => format(latest));

  useEffect(() => {
    if (inView) mv.set(value);
  }, [inView, value, mv]);

  // Render the final value immediately for SSR / no-JS safety, then animate.
  return (
    <motion.span ref={ref} className={className}>
      {display}
    </motion.span>
  );
}

/* ── AnimatedBar — width grows from 0 → pct ───────────────────────────────── */
export function AnimatedBar({
  pct,
  className = '',
  barClassName = '',
  delay = 0,
}: {
  pct: number;
  className?: string;
  barClassName?: string;
  delay?: number;
}) {
  return (
    <div className={className}>
      <motion.div
        className={barClassName}
        initial={{ width: 0 }}
        whileInView={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, ease: EASE, delay }}
        style={{ height: '100%' }}
      />
    </div>
  );
}

export { motion, AnimatePresence };
