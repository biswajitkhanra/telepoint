'use client';
export const dynamic = 'force-dynamic';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { motion, AnimatePresence } from 'framer-motion';

type Tab = 'admin' | 'retailer';

export default function LoginPage() {
  const router = useRouter();
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (typeof window !== 'undefined' && !supabaseRef.current) supabaseRef.current = createClient();
  const supabase = supabaseRef.current!;
  const [tab, setTab] = useState<Tab>('admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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
    <div className="min-h-screen page-bg flex items-center justify-center p-4 relative overflow-hidden">
      {/* ambient floating glows */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-24 h-80 w-80 rounded-full bg-brand-400/20 blur-3xl"
        animate={{ y: [0, 24, 0], x: [0, 16, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-accent-400/20 blur-3xl"
        animate={{ y: [0, -20, 0], x: [0, -14, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        className="w-full max-w-sm relative"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } } }}
      >
        {/* Logo */}
        <motion.div
          className="text-center mb-8"
          variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } } }}
        >
          <motion.div
            className="inline-flex items-center justify-center mb-4"
            initial={{ scale: 0.6, rotate: -8, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
          >
            <Logo size={68} className="rounded-2xl shadow-glow-indigo ring-1 ring-white/40" />
          </motion.div>
          <h1 className="text-display-2 text-gradient">Telepoint</h1>
          <p className="text-ink-muted text-sm mt-1">Premium EMI management portal</p>
        </motion.div>

        <motion.div
          className="card p-8 shadow-float"
          variants={{ hidden: { opacity: 0, y: 22, scale: 0.98 }, show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } } }}
        >
          {/* Tab */}
          <div className="relative flex rounded-xl bg-surface-3 p-1 mb-6">
            {(['admin', 'retailer'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setUsername(''); setPassword(''); }}
                className={`relative flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-colors whitespace-nowrap z-10 ${
                  tab === t ? 'text-brand-700' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {tab === t && (
                  <motion.span
                    layoutId="login-tab"
                    className="absolute inset-0 rounded-lg bg-white shadow-sm"
                    transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                  />
                )}
                <span className="relative">{t === 'admin' ? '🔐 Admin' : '🏪 Retailer'}</span>
              </button>
            ))}
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label">Username</label>
              <input value={username} onChange={e => setUsername(e.target.value)}
                className="input" placeholder={tab === 'admin' ? 'admin username' : 'retailer username'}
                autoFocus autoComplete="username" />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="input" placeholder="••••••••" autoComplete="current-password" />
            </div>
            <motion.button
              type="submit" disabled={loading || !username || !password}
              className="btn-primary w-full py-3 mt-2"
              whileTap={{ scale: 0.98 }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={loading ? 'loading' : 'idle'}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                >
                  {loading ? 'Signing in…' : 'Sign In'}
                </motion.span>
              </AnimatePresence>
            </motion.button>
          </form>
        </motion.div>

        <motion.div
          className="text-center mt-5"
          variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.5 } } }}
        >
          <Link href="/customer" className="text-sm text-ink-muted hover:text-brand-600 transition-colors underline underline-offset-4">
            Customer? View your EMI account →
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}
