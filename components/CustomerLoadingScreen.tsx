'use client';

import { motion } from 'framer-motion';
import Logo from '@/components/Logo';
import { EASE_OUT } from '@/lib/motion';

/**
 * Full-screen branded loading experience shown ONLY while a returning
 * customer's saved session/app-link token is being verified (the "opening"
 * moment) — never for a brand-new manual login, which goes straight to the
 * form. Replaces what would otherwise be a jarring flash of the login form
 * before the real dashboard appears.
 */
export default function CustomerLoadingScreen() {
  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center page-bg"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.45, ease: EASE_OUT } }}
    >
      <div className="relative flex flex-col items-center gap-7 px-6 text-center">
        {/* Orbiting rings around the brand mark */}
        <div className="relative flex items-center justify-center" style={{ width: 128, height: 128 }}>
          <motion.span
            className="absolute rounded-full border-2 border-brand-400/40"
            style={{ width: 128, height: 128 }}
            animate={{ rotate: 360 }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'linear' }}
          />
          <motion.span
            className="absolute rounded-full border-2 border-dashed border-secondary-400/40"
            style={{ width: 100, height: 100 }}
            animate={{ rotate: -360 }}
            transition={{ duration: 4.4, repeat: Infinity, ease: 'linear' }}
          />
          {/* Soft pulsing halo behind the mark */}
          <motion.span
            className="absolute rounded-full bg-brand-400/25 blur-2xl"
            style={{ width: 90, height: 90 }}
            animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0.9, 0.6] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className="relative z-10 rounded-2xl shadow-xl shadow-brand-500/20"
          >
            <Logo size={64} />
          </motion.div>
          {/* Satellite dot riding the outer orbit */}
          <motion.div
            className="absolute inset-0"
            animate={{ rotate: 360 }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'linear' }}
          >
            <span
              className="absolute h-2.5 w-2.5 rounded-full bg-brand-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]"
              style={{ top: 1, left: '50%', marginLeft: -5 }}
            />
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4, ease: EASE_OUT }}
        >
          <p className="font-display text-lg font-bold text-ink">Opening your account</p>
          <p className="mt-1 text-sm text-ink-muted">Fetching your EMI plan securely…</p>
        </motion.div>

        {/* Shimmering progress line */}
        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-surface-3">
          <motion.div
            className="h-full w-1/2 rounded-full bg-gradient-to-r from-brand-400 via-secondary-500 to-accent-400"
            animate={{ x: ['-100%', '220%'] }}
            transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>
    </motion.div>
  );
}
