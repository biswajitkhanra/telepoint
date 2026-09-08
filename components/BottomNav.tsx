'use client';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { SPRING, popIn } from '@/lib/motion';

/* ── Tab definitions ──────────────────────────────────────── */
type TabDef = {
  href: string;
  label: string;
  exact: boolean;
  badge?: boolean;
  iconPath: string | string[];
};

const ADMIN_TABS: TabDef[] = [
  {
    href: '/admin', label: 'Home', exact: true,
    iconPath: ['M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z', 'M9 22V12h6v10'],
  },
  {
    href: '/admin/approvals', label: 'Approvals', exact: false, badge: true,
    iconPath: ['M9 12l2 2 4-4', 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z'],
  },
  {
    href: '/admin', label: 'Customers', exact: false,
    iconPath: ['M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2', 'M9 3a4 4 0 110 8 4 4 0 010-8z', 'M23 21v-2a4 4 0 00-3-3.87', 'M16 3.13a4 4 0 010 7.75'],
  },
  {
    href: '/admin', label: 'Settings', exact: false,
    iconPath: [
      'M12 15a3 3 0 100-6 3 3 0 000 6z',
      'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z',
    ],
  },
];

const RETAILER_TABS: TabDef[] = [
  {
    href: '/retailer', label: 'Home', exact: true,
    iconPath: ['M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z', 'M9 22V12h6v10'],
  },
  {
    href: '/retailer', label: 'Due List', exact: false,
    iconPath: ['M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z', 'M12 6v6l4 2'],
  },
  {
    href: '/retailer', label: 'Customers', exact: false,
    iconPath: ['M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2', 'M9 3a4 4 0 110 8 4 4 0 010-8z', 'M23 21v-2a4 4 0 00-3-3.87', 'M16 3.13a4 4 0 010 7.75'],
  },
  {
    href: '/retailer/dashboard', label: 'Dashboard', exact: true,
    iconPath: ['M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'],
  },
];

const PILL_SPRING = { type: 'spring' as const, damping: 25, stiffness: 320, mass: 0.8 };

/* ── Component ─────────────────────────────────────────────── */
export default function BottomNav({
  role,
  pendingCount = 0,
}: {
  role: 'admin' | 'retailer';
  pendingCount?: number;
}) {
  const p = usePathname();
  const tabs = role === 'admin' ? ADMIN_TABS : RETAILER_TABS;

  const isActive = (tab: TabDef) => {
    const basePath = tab.href.split('?')[0];
    if (tab.label === 'Customers') return false; // tab is accessed via admin main page tabs
    if (tab.label === 'Settings') return false;
    if (tab.label === 'Due List') return false;
    return tab.exact ? p === basePath : p.startsWith(basePath);
  };

  return (
    <>
      <div className="h-[calc(4rem+env(safe-area-inset-bottom,0px))] sm:hidden" />
      <motion.nav
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...SPRING, delay: 0.15 }}
        className="fixed bottom-0 left-0 right-0 z-40 sm:hidden no-print"
        style={{
          background: 'rgba(var(--tp-surface), 0.96)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(var(--tp-surface-4), 0.6)',
          boxShadow: '0 -4px 32px rgba(15,23,42,0.10)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="flex items-center justify-around h-16 px-1 max-w-lg mx-auto">
          {tabs.map((tab) => {
            const active = isActive(tab);
            const paths = Array.isArray(tab.iconPath) ? tab.iconPath : [tab.iconPath];

            return (
              <Link
                key={`${tab.href}-${tab.label}`}
                href={tab.href}
                className="relative flex flex-col items-center justify-center gap-0.5 min-w-[60px] min-h-[52px] rounded-xl px-1.5"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {active && (
                  <motion.span
                    layoutId={`bottomnav-pill-${role}`}
                    className="absolute inset-0 rounded-xl"
                    transition={PILL_SPRING}
                    style={{
                      background: 'rgba(59,130,246,0.08)',
                      boxShadow: '0 0 0 1px rgba(59,130,246,0.14), 0 2px 12px rgba(59,130,246,0.10)',
                    }}
                  />
                )}

                {/* Icon */}
                <motion.span
                  className="relative flex items-center justify-center"
                  animate={{ scale: active ? 1.1 : 1, y: active ? -1 : 0 }}
                  whileTap={{ scale: 0.8 }}
                  transition={SPRING}
                  style={{
                    color: active ? '#2563eb' : 'rgb(var(--tp-ink-muted))',
                    filter: active ? 'drop-shadow(0 0 5px rgba(59,130,246,0.5))' : 'none',
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
                    {paths.map((d, i) => <path key={i} d={d} />)}
                  </svg>

                  {tab.badge && pendingCount > 0 && (
                    <motion.span
                      variants={popIn} initial="hidden" animate="show"
                      className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-danger text-white text-[9px] font-bold px-1"
                    >
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </motion.span>
                  )}
                </motion.span>

                {/* Label */}
                <motion.span
                  animate={{ color: active ? '#2563eb' : 'rgb(var(--tp-ink-muted))' }}
                  transition={SPRING}
                  className="text-[10px] leading-none"
                  style={{ fontWeight: active ? 700 : 500 }}
                >
                  {tab.label}
                </motion.span>
              </Link>
            );
          })}
        </div>
      </motion.nav>
    </>
  );
}
