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
    <div className="min-h-screen page-bg flex items-center justify-center p-4">
      <motion.div
        className="w-full max-w-sm"
        variants={staggerContainer(0.12, 0.08)}
        initial="hidden"
        animate="show"
      >

        {/* Logo */}
        <motion.div className="text-center mb-8" variants={fadeUp}>
          <motion.div
            className="inline-flex items-center justify-center mb-4"
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ ...SPRING, delay: 0.1 }}
            whileHover={{ scale: 1.08, rotate: 6 }}
          >
            <span className="animate-float inline-block">
              <Logo size={64} className="rounded-2xl shadow-lg shadow-ink/20" />
            </span>
          </motion.div>
          <h1 className="text-3xl font-bold text-ink">EMI Management Portal</h1>
          <p className="text-ink-muted text-sm mt-1">Secure access for authorized users</p>
        </motion.div>

        <motion.div className="card p-8" variants={fadeUp}>
          {/* Tab */}
          <div className="flex rounded-xl bg-surface-3 p-1 mb-6">
            {(['admin', 'retailer'] as Tab[]).map(t => (
              <motion.button
                key={t}
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => { setTab(t); setUsername(''); setPassword(''); }}
                className={`relative flex-1 py-2 rounded-lg text-sm font-semibold capitalize whitespace-nowrap transition-colors ${
                  tab === t ? 'text-brand-700' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {tab === t && (
                  <motion.span
                    layoutId="login-tab-pill"
                    className="absolute inset-0 rounded-lg bg-white shadow-sm -z-10"
                    transition={SPRING}
                  />
                )}
                {t === 'admin' ? '🔐 Admin' : '🏪 Retailer'}
              </motion.button>
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
            <button type="submit" disabled={loading || !username || !password} className="btn-primary w-full py-3 mt-2">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </motion.div>

        <motion.div className="text-center mt-5" variants={fadeUp}>
          <Link href="/customer" className="text-sm text-ink-muted hover:text-brand-600 transition-colors underline underline-offset-4">
            Customer? View your EMI account →
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}
