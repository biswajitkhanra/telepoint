'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { EASE_OUT } from '@/lib/motion';
import FinanceScene from '@/components/motion/FinanceScene';

/**
 * Full-screen "opening your account" moment for returning customers whose
 * app-link token is being verified (never shown for a manual login).
 *
 * Mobile-finance themed: a phone with a live EMI ring and monthly installment
 * tiles ticking off as paid, ₹ coins dropping into it, a card sliding out from
 * behind and a security shield sealing the session. Every loop is a pure CSS
 * transform/opacity keyframe (see `.cpl-*` in globals.css) so it stays on the
 * compositor and runs at 60fps even on low-end Android phones.
 */
const STEPS = [
  'Securing your connection',
  'Fetching your EMI plan',
  'Calculating dues & fines',
  'Preparing your dashboard',
];

export default function CustomerLoadingScreen() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setStep(s => Math.min(s + 1, STEPS.length - 1)), 650);
    return () => clearInterval(t);
  }, []);

  const progress = [22, 48, 74, 92][step];

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center page-bg cp-static-bg"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04, transition: { duration: 0.4, ease: EASE_OUT } }}
      role="status"
      aria-live="polite"
      aria-label="Opening your account"
    >
      <div className="flex flex-col items-center px-6 text-center">
        <FinanceScene />

        <p className="mt-8 font-display text-xl font-bold tracking-tight text-ink">Opening your account</p>
        <div className="mt-1.5 h-5 overflow-hidden">
          <p key={step} className="cpl-step text-sm text-ink-muted">{STEPS[step]}…</p>
        </div>

        <div className="mt-5 h-1.5 w-56 overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-sky-500 to-indigo-500 transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="mt-6 inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
          End-to-end secure · TelePoint EMI
        </p>
      </div>
    </motion.div>
  );
}
