'use client';

import { motion, MotionConfig } from 'framer-motion';
import { usePathname } from 'next/navigation';

/**
 * Route-level transition. Next.js re-mounts this template on every navigation,
 * so keying the wrapper on the pathname gives an animated cross-fade between
 * pages.
 *
 * Intentionally OPACITY-ONLY at this level: a transform/filter here would turn
 * the wrapper into the containing block for any `position: fixed` descendant
 * (bottom nav, sticky Collect-Payment bar, modals), nudging them out of place.
 * The richer slide / scale / stagger motion lives inside each page's content,
 * where it can't disturb fixed workflow controls.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
