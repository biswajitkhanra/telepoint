'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { EASE_OUT } from '@/lib/motion';

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
        <div className="cpl-stage" aria-hidden="true">
          <span className="cpl-glow" />

          {/* Card sliding out from behind the phone */}
          <div className="cpl-card">
            <span className="cpl-card-chip" />
            <span className="cpl-card-wave" />
            <span className="cpl-card-num" />
          </div>

          {/* Coins dropping into the phone */}
          {[0, 1, 2].map(i => (
            <span key={i} className="cpl-coin" style={{ animationDelay: `${i * 0.55}s`, left: `${46 + (i - 1) * 9}%` }}>₹</span>
          ))}

          {/* The phone */}
          <div className="cpl-phone">
            <span className="cpl-notch" />
            <div className="cpl-screen">
              <div className="cpl-screen-head">
                <span className="cpl-dot" />
                <span className="cpl-line w-10" />
                <svg className="ml-auto" width="9" height="11" viewBox="0 0 24 28" fill="none" stroke="#a5f3fc" strokeWidth="3">
                  <rect x="3" y="12" width="18" height="13" rx="3" />
                  <path d="M7 12V8a5 5 0 0110 0v4" />
                </svg>
              </div>

              <div className="cpl-ring-wrap">
                <svg width="74" height="74" viewBox="0 0 74 74">
                  <circle cx="37" cy="37" r="30" stroke="rgba(255,255,255,0.12)" strokeWidth="6" fill="none" />
                  <circle className="cpl-ring" cx="37" cy="37" r="30" stroke="url(#cplRing)" strokeWidth="6" strokeLinecap="round" fill="none" transform="rotate(-90 37 37)" />
                  <defs>
                    <linearGradient id="cplRing" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#34d399" />
                      <stop offset="100%" stopColor="#22d3ee" />
                    </linearGradient>
                  </defs>
                </svg>
                <span className="cpl-rupee">₹</span>
              </div>

              <span className="cpl-line cpl-shimmer w-16 mx-auto" />
              <span className="cpl-line cpl-shimmer w-10 mx-auto mt-1.5" style={{ animationDelay: '.2s' }} />

              {/* Monthly installments ticking off */}
              <div className="cpl-tiles">
                {Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} className="cpl-tile" style={{ animationDelay: `${i * 0.28}s` }} />
                ))}
              </div>
            </div>
          </div>

          {/* Security shield seal */}
          <div className="cpl-shield">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3z" fill="url(#cplShield)" />
              <path d="M8.5 12.2l2.4 2.4 4.6-4.8" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <defs>
                <linearGradient id="cplShield" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#0ea5e9" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>

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
