/**
 * Central motion system for TelePoint.
 *
 * One source of truth for spring physics, entrance variants, stagger
 * containers and interaction presets so the whole app moves with the same
 * premium, native-app feel (think CRED / Revolut / Apple Wallet).
 *
 * Usage:
 *   <motion.div variants={fadeUp} initial="hidden" animate="show" />
 *   <motion.ul variants={staggerContainer()} initial="hidden" animate="show">
 *     <motion.li variants={cardRise} />
 *   </motion.ul>
 *   <motion.button {...pressable}>…</motion.button>
 */
import type { Variants, Transition } from 'framer-motion';

// ── Spring physics presets ───────────────────────────────────────────────────
// Matched to the existing UpcomingEmiWidget feel and tuned per use-case.
export const SPRING: Transition = { type: 'spring', stiffness: 380, damping: 30, mass: 0.7 };
export const SPRING_SOFT: Transition = { type: 'spring', stiffness: 240, damping: 26, mass: 0.9 };
export const SPRING_SNAPPY: Transition = { type: 'spring', stiffness: 520, damping: 34, mass: 0.6 };
export const SPRING_BOUNCY: Transition = { type: 'spring', stiffness: 440, damping: 17, mass: 0.8 };
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const EASE_IN = [0.4, 0, 1, 1] as const;

// ── Stagger container ────────────────────────────────────────────────────────
export const staggerContainer = (stagger = 0.07, delayChildren = 0.05): Variants => ({
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: stagger, delayChildren },
  },
  exit: { opacity: 0, transition: { staggerChildren: 0.03, staggerDirection: -1 } },
});

// ── Entrance item variants ───────────────────────────────────────────────────
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: SPRING },
  exit: { opacity: 0, y: 10, transition: { duration: 0.18 } },
};

export const fadeUpSm: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: SPRING },
  exit: { opacity: 0, y: 8, transition: { duration: 0.16 } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.35, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

/** Card-style rise + subtle scale — the workhorse for grids of cards/tiles. */
export const cardRise: Variants = {
  hidden: { opacity: 0, y: 26, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: SPRING },
  exit: { opacity: 0, y: 12, scale: 0.97, transition: { duration: 0.18 } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: { opacity: 1, scale: 1, transition: SPRING },
  exit: { opacity: 0, scale: 0.92, transition: { duration: 0.18 } },
};

/** Springy pop — for badges, alerts, popups, count chips. */
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.7, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: SPRING_BOUNCY },
  exit: { opacity: 0, scale: 0.8, transition: { duration: 0.16 } },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 28 },
  show: { opacity: 1, x: 0, transition: SPRING },
  exit: { opacity: 0, x: 16, transition: { duration: 0.18 } },
};

/** Table / list row — enters with a small horizontal drift + fade. */
export const rowItem: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: SPRING },
  exit: { opacity: 0, x: -24, transition: { duration: 0.2 } },
};

// ── Interaction presets (spread onto motion.button / motion.div) ─────────────
/** Buttons & small controls: hover lift, tactile compression, spring release. */
export const pressable = {
  whileHover: { y: -2, transition: SPRING_SNAPPY },
  whileTap: { scale: 0.95, y: 0, transition: { type: 'spring', stiffness: 700, damping: 30 } },
} as const;

/** Cards & list items: elevate on hover, compress on touch. */
export const liftCard = {
  whileHover: { y: -4, transition: SPRING_SNAPPY },
  whileTap: { scale: 0.98, transition: { type: 'spring', stiffness: 600, damping: 32 } },
} as const;

/** Subtle tap-only feedback for elements that must not shift position. */
export const tapOnly = {
  whileTap: { scale: 0.96, transition: { type: 'spring', stiffness: 700, damping: 30 } },
} as const;

// ── Overlay / modal / sheet variants ─────────────────────────────────────────
export const backdrop: Variants = {
  hidden: { opacity: 0, backdropFilter: 'blur(0px)' },
  show: { opacity: 1, backdropFilter: 'blur(6px)', transition: { duration: 0.25, ease: EASE_OUT } },
  exit: { opacity: 0, backdropFilter: 'blur(0px)', transition: { duration: 0.2, ease: EASE_IN } },
};

/** Desktop modal — scale + rise in, reverse out. */
export const modalPanel: Variants = {
  hidden: { opacity: 0, scale: 0.9, y: 28 },
  show: { opacity: 1, scale: 1, y: 0, transition: SPRING },
  exit: { opacity: 0, scale: 0.94, y: 20, transition: { duration: 0.2, ease: EASE_IN } },
};

/** Mobile bottom-sheet — slide up from the bottom, reverse out. */
export const sheetPanel: Variants = {
  hidden: { y: '100%', opacity: 0.6 },
  show: { y: 0, opacity: 1, transition: SPRING_SOFT },
  exit: { y: '100%', opacity: 0.4, transition: { duration: 0.26, ease: EASE_IN } },
};

// ── Page transition (route-level) ────────────────────────────────────────────
export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } },
};
