'use client';

/**
 * Light / Dark / System theme switch. The choice persists in localStorage
 * ('tp-theme') and is applied before first paint by the boot script in
 * app/layout.tsx, so there is never a flash of the wrong theme.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sun, Moon, MonitorSmartphone } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SPRING } from '@/lib/motion';

export type ThemeChoice = 'light' | 'dark' | 'system';

function apply(choice: ThemeChoice) {
  const dark = choice === 'dark' ||
    (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function useTheme(): [ThemeChoice, (c: ThemeChoice) => void] {
  // Light is the portal default — dark only when the user explicitly picks it
  // (or picks System on an OS that prefers dark).
  const [choice, setChoice] = useState<ThemeChoice>('light');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tp-theme') as ThemeChoice | null;
      if (saved === 'light' || saved === 'dark' || saved === 'system') setChoice(saved);
    } catch { /* private mode */ }
  }, []);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystem = () => { if (choice === 'system') apply('system'); };
    mq.addEventListener('change', onSystem);
    return () => mq.removeEventListener('change', onSystem);
  }, [choice]);
  const set = (c: ThemeChoice) => {
    setChoice(c);
    try { localStorage.setItem('tp-theme', c); } catch { /* private mode */ }
    apply(c);
  };
  return [choice, set];
}

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: MonitorSmartphone },
];

export default function ThemeToggle({ className }: { className?: string }) {
  const [choice, setChoice] = useTheme();
  return (
    <div
      role="radiogroup" aria-label="Color theme"
      className={cn('inline-flex items-center gap-0.5 rounded-xl border border-surface-4 bg-surface-2 p-1', className)}
    >
      {OPTIONS.map(o => {
        const active = o.value === choice;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            role="radio" aria-checked={active}
            onClick={() => setChoice(o.value)}
            className={cn(
              'relative z-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
              active ? 'text-white' : 'text-ink-muted hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId="theme-toggle-pill"
                className="absolute inset-0 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-sm shadow-indigo-500/30 -z-10"
                transition={SPRING}
              />
            )}
            <Icon size={13} aria-hidden />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
