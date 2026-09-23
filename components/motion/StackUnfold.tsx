'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import FinanceScene from '@/components/motion/FinanceScene';

/**
 * "Opening customer" overlay for admin and retailer search. A sheet rises in
 * carrying the mobile-finance phone scene (EMI ring filling, installments
 * ticking off, coins dropping in), the customer's name and the step being
 * loaded. It lifts and blurs away as the detail view takes over.
 */
const STEPS = ['Opening account', 'Loading EMI schedule', 'Checking dues & fines'];

export default function StackUnfold({ name }: { name?: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep(s => Math.min(s + 1, STEPS.length - 1)), 420);
    return () => clearInterval(t);
  }, []);

  return (
    <motion.div
      key="stack-unfold"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.22, delay: 0.04 } }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-6 backdrop-blur-[3px]"
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 1.03, y: -8, filter: 'blur(4px)' }}
        transition={{ type: 'spring', duration: 0.45, bounce: 0.22 }}
        className="su-sheet relative flex w-full max-w-[320px] flex-col items-center overflow-hidden rounded-[26px] bg-surface px-5 pb-5 pt-4 text-center"
      >
        <FinanceScene scale={0.7} />

        <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted">Opening customer</p>
        <p className="mt-0.5 max-w-full truncate text-lg font-semibold tracking-tight text-ink">{name || 'Customer'}</p>
        <div className="mt-1 h-5 overflow-hidden">
          <p key={step} className="cpl-step text-[13px] text-ink-muted">{STEPS[step]}…</p>
        </div>

        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-sky-500 to-brand-500 transition-[width] duration-300 ease-out"
            style={{ width: `${[38, 70, 92][step]}%` }}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}
