'use client';
import { useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { SPRING, pressable, popIn } from '@/lib/motion';

interface NavBarProps { role: 'admin' | 'retailer'; userName?: string; pendingCount?: number; }

/* Minimal inline SVG icons — no extra deps */
const Icons = {
  dashboard: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  approvals: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" />
    </svg>
  ),
  home: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  chart: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  logout: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
};

export default function NavBar({ role, pendingCount = 0 }: NavBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const _sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (typeof window !== 'undefined' && !_sbRef.current) _sbRef.current = createClient();
  const supabase = _sbRef.current!;

  async function logout() {
    // scope: 'local' clears ONLY this browser's session — not all devices.
    await supabase.auth.signOut({ scope: 'local' });
    toast.success('Logged out');
    router.replace('/login');
  }

  const isActive = (href: string, exact = false) => exact ? pathname === href : pathname.startsWith(href);

  const NavItem = ({ href, exact, icon, children }: { href: string; exact?: boolean; icon: React.ReactNode; children: React.ReactNode }) => {
    const active = isActive(href, exact);
    return (
      <Link href={href} className={`${active ? 'nav-link-active' : 'nav-link'} relative`}>
        {active && (
          <motion.span
            layoutId="nav-active-pill"
            className="absolute inset-0 rounded-xl bg-brand-50 -z-10"
            transition={SPRING}
          />
        )}
        {icon}
        {children}
      </Link>
    );
  };

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={SPRING}
      className="sticky top-0 z-40 bg-white/90 dark:bg-surface/90 backdrop-blur-md border-b border-surface-4 shadow-sm no-print"
    >
      <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
        {/* Logo + wordmark */}
        <motion.div
          className="flex items-center gap-2 flex-shrink-0"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...SPRING, delay: 0.08 }}
        >
          <motion.div whileHover={{ rotate: -8, scale: 1.08 }} whileTap={{ scale: 0.92 }} transition={SPRING}>
            <Logo size={32} className="rounded-lg shadow-sm" />
          </motion.div>
          <span className="font-display font-bold text-ink text-base inline tracking-tight">Telepoint</span>
          {/* Role chip */}
          <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            role === 'admin'
              ? 'bg-violet-100 text-violet-700 border border-violet-200'
              : 'bg-teal-100 text-teal-700 border border-teal-200'
          }`}>
            {role === 'admin' ? 'Admin' : 'Retailer'}
          </span>
        </motion.div>

        {/* Desktop nav links */}
        <nav className="hidden sm:flex items-center gap-1">
          {role === 'admin' && (
            <>
              <NavItem href="/admin" exact icon={Icons.dashboard}>Dashboard</NavItem>
              <div className="relative">
                <NavItem href="/admin/approvals" icon={Icons.approvals}>Approvals</NavItem>
                {pendingCount > 0 && (
                  <motion.span
                    variants={popIn} initial="hidden" animate="show"
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-danger text-white text-[10px] font-bold px-1 num"
                  >
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </motion.span>
                )}
              </div>
            </>
          )}
          {role === 'retailer' && (
            <>
              <NavItem href="/retailer" exact icon={Icons.home}>Home</NavItem>
              <NavItem href="/retailer/dashboard" exact icon={Icons.chart}>Dashboard</NavItem>
            </>
          )}
        </nav>

        {/* Logout */}
        <motion.button
          {...pressable}
          onClick={logout}
          className="btn-ghost text-xs px-3 py-2 text-danger hover:bg-danger-light hover:text-danger flex-shrink-0 gap-1.5"
        >
          {Icons.logout}
          <span className="hidden sm:inline">Logout</span>
        </motion.button>
      </div>
    </motion.header>
  );
}
