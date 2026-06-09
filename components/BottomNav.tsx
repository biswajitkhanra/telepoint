'use client';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { SPRING, popIn } from '@/lib/motion';

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
      {/* Nav bar */}
      <motion.nav
        initial={{ y: 80 }}
        animate={{ y: 0 }}
        transition={{ ...SPRING, delay: 0.1 }}
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-surface-4 sm:hidden no-print safe-bottom"
      >
        <div className="flex items-center justify-around h-16 px-2 max-w-lg mx-auto">
          {tabs.map(t => {
            const active = t.exact ? p === t.href : p.startsWith(t.href.split('?')[0]);
            return (
              <Link key={t.href} href={t.href}
                className={`flex flex-col items-center gap-0.5 min-w-[56px] min-h-[44px] justify-center rounded-xl relative ${active ? 'text-brand-600' : 'text-ink-muted'}`}>
                {/* Magic-move active pill that glides between tabs */}
                {active && (
                  <motion.span
                    layoutId="bottomnav-pill"
                    className="absolute inset-x-1 inset-y-1 rounded-xl bg-brand-50 -z-10"
                    transition={SPRING}
                  />
                )}
                <motion.svg
                  width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round"
                  animate={{ scale: active ? 1.15 : 1, y: active ? -1 : 0 }}
                  whileTap={{ scale: 0.85 }}
                  transition={SPRING}
                >
                  <path d={t.icon} />
                </motion.svg>
                <span className={`text-[10px] ${active ? 'font-bold' : 'font-medium'}`}>{t.label}</span>
                {t.label === 'Approvals' && pendingCount > 0 && (
                  <motion.span
                    variants={popIn} initial="hidden" animate="show"
                    className="absolute -top-0.5 right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-danger text-white text-[9px] font-bold px-1 num"
                  >
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </motion.span>
                )}
              </Link>
            );
          })}
        </div>
      </motion.nav>
    </>
  );
}
