'use client';

import { useId } from 'react';

/**
 * The shared mobile-finance loading scene: a phone with a live EMI ring and
 * monthly installment tiles ticking off as paid, ₹ coins dropping in, a card
 * sliding out from behind and a security shield sealing it. Pure CSS
 * transform/opacity keyframes (`.cpl-*` in globals.css), so it stays on the
 * compositor even on budget phones.
 *
 * Used by the customer portal's opening screen and the staff "opening
 * customer" overlay. `scale` shrinks the whole stage without re-layout.
 */
export default function FinanceScene({ scale = 1 }: { scale?: number }) {
  const uid = useId().replace(/:/g, '');
  const ring = `cplRing-${uid}`;
  const shield = `cplShield-${uid}`;

  return (
    <div style={{ width: 240 * scale, height: 270 * scale }} aria-hidden="true">
      <div className="cpl-stage" style={scale === 1 ? undefined : { transform: `scale(${scale})`, transformOrigin: 'top left' }}>
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
                <circle className="cpl-ring" cx="37" cy="37" r="30" stroke={`url(#${ring})`} strokeWidth="6" strokeLinecap="round" fill="none" transform="rotate(-90 37 37)" />
                <defs>
                  <linearGradient id={ring} x1="0" y1="0" x2="1" y2="1">
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
            <path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3z" fill={`url(#${shield})`} />
            <path d="M8.5 12.2l2.4 2.4 4.6-4.8" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            <defs>
              <linearGradient id={shield} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#0ea5e9" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>
    </div>
  );
}
