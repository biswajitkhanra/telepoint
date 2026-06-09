'use client';
import { useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import Link from 'next/link';
import Logo from '@/components/Logo';

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

  return (
    <header className="sticky top-0 z-40 navy-chrome border-b border-white/10 shadow-lg shadow-navy-900/20 no-print">
      {/* faint cyan glow line at the very top */}
      <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-accent-400/70 to-transparent" />
      <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
        {/* Logo */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <Logo size={32} className="rounded-xl shadow-md shadow-navy-950/40 ring-1 ring-white/10" />
          <span className="font-display font-extrabold text-white text-base inline tracking-tight">
            Tele<span className="text-accent-300">point</span>
          </span>
        </div>

        {/* Desktop nav links — hidden on mobile (BottomNav handles mobile) */}
        <nav className="hidden sm:flex items-center gap-1">
          {role === 'admin' && (
            <>
              <Link href="/admin" className={isActive('/admin', true) ? 'nav-link-active' : 'nav-link'}>Dashboard</Link>
              <Link href="/admin/approvals" className={`${isActive('/admin/approvals') ? 'nav-link-active' : 'nav-link'} relative`}>
                Approvals
                {pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-accent-400 text-navy-900 text-[10px] font-bold px-1 shadow-glow-cyan">
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )}
              </Link>
            </>
          )}
          {role === 'retailer' && (
            <Link href="/retailer" className={isActive('/retailer') ? 'nav-link-active' : 'nav-link'}>Dashboard</Link>
          )}
        </nav>

        {/* Logout — always visible */}
        <button onClick={logout} className="text-xs font-semibold px-3 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-all flex-shrink-0">
          Logout
        </button>
      </div>
    </header>
  );
}
