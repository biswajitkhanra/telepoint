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

export default function NavBar({ role, pendingCount = 0 }: NavBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const _sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (typeof window !== 'undefined' && !_sbRef.current) _sbRef.current = createClient();
  const supabase = _sbRef.current!;

  async function logout() {
    // scope: 'local' clears ONLY this browser's session. The default ('global')
    // revokes every refresh token for the user across all devices/tabs — which
    // is wrong for a multi-session app and is what made logging out (or any
    // server-side password touch) cascade into other sessions. Each user/session
    // must be independent, so we only ever drop the local tokens here.
    await supabase.auth.signOut({ scope: 'local' });
    toast.success('Logged out');
    router.replace('/login');
  }

  const isActive = (href: string, exact = false) => exact ? pathname === href : pathname.startsWith(href);

  // Shared-layout active pill that glides between links.
  const NavItem = ({ href, exact, children }: { href: string; exact?: boolean; children: React.ReactNode }) => {
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
        {children}
      </Link>
    );
  };

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={SPRING}
      className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-surface-4 shadow-sm no-print"
    >
      <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
        {/* Logo */}
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
        </motion.div>

        {/* Desktop nav links — hidden on mobile (BottomNav handles mobile) */}
        <nav className="hidden sm:flex items-center gap-1">
          {role === 'admin' && (
            <>
              <NavItem href="/admin" exact>Dashboard</NavItem>
              <div className="relative">
                <NavItem href="/admin/approvals">Approvals</NavItem>
                {pendingCount > 0 && (
                  <motion.span
                    variants={popIn} initial="hidden" animate="show"
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-brand-500 text-white text-[10px] font-bold px-1 num"
                  >
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </motion.span>
                )}
              </div>
            </>
          )}
          {role === 'retailer' && (
            <>
              <NavItem href="/retailer" exact>Home</NavItem>
              <NavItem href="/retailer/dashboard" exact>Dashboard</NavItem>
              <NavItem href="/retailer/reports" exact>Reports</NavItem>
            </>
          )}
        </nav>

        {/* Logout — always visible */}
        <motion.button
          {...pressable}
          onClick={logout}
          className="btn-ghost text-xs px-3 py-2 text-danger hover:bg-danger-light hover:text-danger flex-shrink-0"
        >
          Logout
        </motion.button>
      </div>
    </motion.header>
  );
}
