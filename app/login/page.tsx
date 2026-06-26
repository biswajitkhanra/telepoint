'use client';
export const dynamic = 'force-dynamic';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { SPRING, fadeUp, staggerContainer } from '@/lib/motion';

type Tab = 'admin' | 'retailer';

const EyeIcon = ({ open }: { open: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {open ? (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ) : (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    )}
  </svg>
);

export default function LoginPage() {
  const router = useRouter();
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (typeof window !== 'undefined' && !supabaseRef.current) supabaseRef.current = createClient();
  const supabase = supabaseRef.current!;
  const [tab, setTab] = useState<Tab>('admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const toEmail = (u: string, t: Tab) =>
    t === 'admin'
      ? ({ TELEPOINT: 'telepoint@admin.local', telepoint: 'telepoint@admin.local' }[u] ?? `${u}@admin.local`)
      : `${u.toLowerCase()}@tele.local`;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: toEmail(username, tab), password });
      if (error) { toast.error('Incorrect username or password'); return; }
      toast.success('Welcome!');
      router.replace(tab === 'admin' ? '/admin' : '/retailer');
      router.refresh();
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen page-bg flex items-center justify-center p-4">
      <motion.div
        className="w-full max-w-sm"
        variants={staggerContainer(0.12, 0.08)}
        initial="hidden"
        animate="show"
      >

        {/* Brand hero */}
        <motion.div className="text-center mb-8" variants={fadeUp}>
          <motion.div
            className="inline-flex items-center justify-center mb-5"
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ ...SPRING, delay: 0.1 }}
            whileHover={{ scale: 1.08, rotate: 6 }}
          >
            <div className="relative">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-blue-400 to-indigo-500 blur-xl opacity-40 scale-110" />
              <span className="animate-float inline-block relative">
                <Logo size={72} className="rounded-3xl shadow-xl shadow-blue-500/25" />
              </span>
            </div>
          </motion.div>
          <h1 className="text-3xl font-bold text-ink tracking-tight">EMI Management Portal</h1>
          <p className="text-ink-muted text-sm mt-1.5">Secure access for authorized users</p>
          <div className="flex items-center justify-center gap-1.5 mt-3">
            <span className="h-1.5 w-6 rounded-full bg-blue-500" />
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
          </div>
        </motion.div>

        <motion.div className="card p-8 shadow-xl shadow-blue-500/8" variants={fadeUp}>
          {/* Tab selector */}
          <div className="flex rounded-xl bg-surface-3 p-1 mb-6">
            {(['admin', 'retailer'] as Tab[]).map(t => (
              <motion.button
                key={t}
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => { setTab(t); setUsername(''); setPassword(''); setShowPassword(false); }}
                aria-pressed={tab === t}
                className={`relative flex-1 py-2 rounded-lg text-sm capitalize whitespace-nowrap transition-colors ${
                  tab === t ? 'font-bold text-brand-700' : 'font-semibold text-ink-muted hover:text-ink'
                }`}
              >
                {tab === t && (
                  <motion.span
                    layoutId="login-tab-pill"
                    className="absolute inset-0 rounded-lg bg-white shadow-sm ring-1 ring-brand-200"
                    transition={SPRING}
                  />
                )}
                <span className="relative z-10 flex items-center justify-center gap-1.5">
                  {t === 'admin' ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                      </svg>
                      Admin
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
                      </svg>
                      Retailer
                    </>
                  )}
                  {tab === t && (
                    <motion.svg
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={SPRING}
                      width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </motion.svg>
                  )}
                </span>
              </motion.button>
            ))}
          </div>

          {/* Role confirmation */}
          <motion.p
            key={tab}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="-mt-3 mb-5 text-center text-xs text-ink-muted"
          >
            Signing in as{' '}
            <span className="font-bold capitalize text-brand-600">
              {tab === 'admin' ? 'Admin' : 'Retailer'}
            </span>
          </motion.p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label">Username</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted/60">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="input pl-10"
                  placeholder={tab === 'admin' ? 'admin username' : 'retailer username'}
                  autoFocus
                  autoComplete="username"
                />
              </div>
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted/60">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input pl-10 pr-10"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted/60 hover:text-ink-muted transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading || !username || !password}
              className="btn-primary w-full py-3 mt-2 text-base"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                    <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                  Sign In
                </span>
              )}
            </button>
          </form>
        </motion.div>

        <motion.div className="text-center mt-5" variants={fadeUp}>
          <Link href="/customer" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-brand-600 transition-colors group">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-0.5 transition-transform">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            Customer? View your EMI account →
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}
