'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';

const ADMIN_TABS = [
  { href: '/admin', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', exact: true },
  { href: '/admin/approvals', label: 'Approvals', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', exact: false },
];
const RETAILER_TABS = [
  { href: '/retailer', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', exact: true },
];

export default function BottomNav({ role, pendingCount = 0 }: { role: 'admin' | 'retailer'; pendingCount?: number }) {
  const p = usePathname();
  const tabs = role === 'admin' ? ADMIN_TABS : RETAILER_TABS;

  return (
    <>
      {/* Spacer so content isn't hidden behind nav */}
      <div className="h-20 sm:hidden" />
      {/* Nav bar — frosted glass */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 glass border-t border-white/40 sm:hidden no-print safe-bottom shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
        <div className="flex items-center justify-around h-16 px-2 max-w-lg mx-auto">
          {tabs.map(t => {
            const active = t.exact ? p === t.href : p.startsWith(t.href.split('?')[0]);
            return (
              <Link key={t.href} href={t.href}
                className={`group relative flex flex-col items-center gap-0.5 min-w-[60px] min-h-[44px] justify-center rounded-2xl px-3 transition-colors ${active ? 'text-brand-600' : 'text-ink-muted'}`}>
                {active && (
                  <motion.span
                    layoutId="bottomnav-pill"
                    className="absolute inset-0 rounded-2xl bg-brand-50 ring-1 ring-brand-200/70"
                    transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                  />
                )}
                <motion.span
                  className="relative flex flex-col items-center gap-0.5"
                  whileTap={{ scale: 0.85 }}
                  transition={{ type: 'spring', stiffness: 600, damping: 20 }}
                >
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d={t.icon} />
                  </svg>
                  <span className={`text-[10px] ${active ? 'font-bold' : 'font-medium'}`}>{t.label}</span>
                </motion.span>
                {t.label === 'Approvals' && pendingCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-danger text-white text-[9px] font-bold px-1 z-10">
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
