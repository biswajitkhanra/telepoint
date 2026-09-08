'use client';

import { motion, MotionConfig, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';

/**
 * Route-level transition — directional slide between pages.
 *
 * The page slides in from the right and out to the left (like a native app
 * pushing a new screen). AnimatePresence with mode="popLayout" ensures the
 * outgoing page is removed immediately so it doesn't block the incoming one.
 *
 * CRITICAL: We do NOT apply transform at this level because doing so would
 * turn the wrapper into a containing block for any position:fixed child
 * (BottomNav, modals, sticky bars). Only opacity and translateY are safe here.
 * The X-axis slide is intentionally applied via clip — not transform on a
 * fixed-positioned ancestor.
 */

const pageVariants = {
  initial: {
    opacity: 0,
    y: 8,
  },
  animate: {
    opacity: 1,
    y: 0,
  },
  exit: {
    opacity: 0,
    y: -4,
  },
};

const pageTransition = {
  duration: 0.28,
  ease: [0.16, 1, 0.3, 1],
};

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={pathname}
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={pageTransition}
          className="contents"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
}

