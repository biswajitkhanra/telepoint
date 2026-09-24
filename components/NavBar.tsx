'use client';
import { useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
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

// Names that would just repeat the brand or the role chip ("RETAILER Retailer").
const GENERIC_NAMES = new Set(['admin', 'super admin', 'retailer', 'telepoint', 'my shop']);

export default function NavBar({ role, userName, pendingCount = 0 }: NavBarProps) {
  const shownName = userName?.trim() && !GENERIC_NAMES.has(userName.trim().toLowerCase()) ? userName.trim() : '';
  const pathname = usePathname();
  const _sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (typeof window !== 'undefined' && !_sbRef.current) _sbRef.current = createClient();
  const supabase = _sbRef.current!;

  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    let failed = false;
    try {
      // scope: 'local' clears ONLY this browser's session — not all devices.
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      failed = !!error;
    } catch {
      failed = true;
    }
    // On a network error supabase-js keeps the session, which left people
    // "logged out" on the login screen but still signed in. Drop the auth
    // cookies (including chunked .0/.1 parts) ourselves in that case.
    if (failed) {
      document.cookie.split(';').map(c => c.split('=')[0].trim())
        .filter(n => /^sb-.+-auth-token(\.\d+)?$/.test(n))
        .forEach(n => { document.cookie = `${n}=; Max-Age=0; path=/`; });
    }
    toast.success('Logged out');
    // Full page load, not a client transition: drops the router cache and all
    // in-memory state, so Back or a re-login never shows the previous account.
    window.location.replace('/login');
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
      className="sticky top-0 z-40 bg-surface/80 backdrop-blur-xl backdrop-saturate-150 border-b border-slate-900/[0.06] dark:border-white/[0.07] no-print"
    >
      <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
        {/* Logo + wordmark */}
        <motion.div
          className="flex min-w-0 items-center gap-2"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...SPRING, delay: 0.08 }}
        >
          <motion.div whileTap={{ scale: 0.95 }} transition={SPRING} className="flex-shrink-0">
            <Logo size={32} className="rounded-lg shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_2px_6px_-2px_rgba(30,49,102,0.35)]" />
          </motion.div>
          {/* Wordmark + who is signed in (shown on every screen size) */}
          <div className="min-w-0 leading-tight">
            <span className="block font-display font-semibold text-ink text-[15px] tracking-[-0.02em]">Telepoint</span>
            <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-ink-muted">
              <span className={`inline-flex flex-shrink-0 items-center px-1.5 py-px rounded-full text-[9px] font-semibold uppercase tracking-[0.08em] ring-1 ring-inset ${
                role === 'admin'
                  ? 'bg-brand-50 text-brand-700 ring-brand-600/15'
                  : 'bg-emerald-50 text-emerald-700 ring-emerald-600/15'
              }`}>
                {role === 'admin' ? 'Admin' : 'Retailer'}
              </span>
              {shownName && <span className="truncate font-medium text-ink-light" title={shownName}>{shownName}</span>}
            </span>
          </div>
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
          disabled={loggingOut}
          aria-label="Log out"
          title="Log out"
          className="btn-ghost text-xs px-3 py-2 text-danger hover:bg-danger-light hover:text-danger flex-shrink-0 gap-1.5 disabled:opacity-60"
        >
          {Icons.logout}
          <span className="hidden sm:inline">Logout</span>
        </motion.button>
      </div>
    </motion.header>
  );
}
