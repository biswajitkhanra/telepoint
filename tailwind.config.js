/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Plus Jakarta Sans', 'DM Sans', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        /* ── Brand — Indigo (primary) ─────────────────────────── */
        brand: {
          50:  '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc',
          400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca',
          800: '#3730a3', 900: '#312e81', 950: '#1e1b4b',
        },
        /* ── Accent — Cyan (highlights / glows) ───────────────── */
        accent: {
          50:  '#ecfeff', 100: '#cffafe', 200: '#a5f3fc', 300: '#67e8f9',
          400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490',
        },
        /* ── Deep Navy — dark surfaces / chrome ───────────────── */
        navy: {
          50:  '#f0f4fb', 100: '#dde6f5', 200: '#b9c9e8',
          600: '#1e2a52', 700: '#162041', 800: '#0f1730', 900: '#0a0f22', 950: '#060a18',
        },
        ink:  { DEFAULT: '#0f172a', light: '#1e293b', muted: '#64748b' },
        surface: { DEFAULT: '#ffffff', 2: '#f6f8fc', 3: '#eef2f9', 4: '#dfe6f1' },
        success: { DEFAULT: '#059669', light: '#ecfdf5', border: '#6ee7b7' },
        warning: { DEFAULT: '#d97706', light: '#fffbeb', border: '#fcd34d' },
        danger:  { DEFAULT: '#e11d48', light: '#fff1f3', border: '#fda4af' },
        info:    { DEFAULT: '#4f46e5', light: '#eef2ff', border: '#a5b4fc' },
        // Legacy aliases (kept so old class names keep resolving)
        gold: { 300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5' },
        jade: { 400: '#34d399', 500: '#10b981' },
        crimson: { 300: '#fb7185', 400: '#f43f5e', 500: '#e11d48' },
        sapphire: { 300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1' },
        obsidian: { 600: '#1e2a52', 700: '#162041', 800: '#0f1730', 900: '#0a0f22', 950: '#060a18' },
        slate: { 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155' },
      },
      boxShadow: {
        'card': '0 1px 2px rgba(15,23,42,0.04), 0 6px 16px rgba(15,23,42,0.06)',
        'card-hover': '0 12px 32px rgba(79,70,229,0.14), 0 4px 10px rgba(15,23,42,0.08)',
        'modal': '0 24px 64px rgba(15,23,42,0.28), 0 8px 24px rgba(15,23,42,0.12)',
        'float': '0 14px 36px rgba(15,23,42,0.14)',
        'glow-indigo': '0 8px 28px rgba(99,102,241,0.35)',
        'glow-cyan': '0 8px 28px rgba(34,211,238,0.30)',
        'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.6)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #6366f1 0%, #4f46e5 45%, #06b6d4 130%)',
        'brand-gradient-soft': 'linear-gradient(135deg, #818cf8 0%, #22d3ee 100%)',
        'navy-gradient': 'linear-gradient(120deg, #0f1730 0%, #162041 55%, #1e2a52 100%)',
      },
      animation: {
        'fade-in':  'fadeIn 0.4s ease-out both',
        'slide-up': 'slideUp 0.45s cubic-bezier(0.16,1,0.3,1) both',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.16,1,0.3,1) both',
        'float':    'float 6s ease-in-out infinite',
        'shimmer':  'shimmer 1.6s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2.4s ease-in-out infinite',
        'gradient-pan': 'gradientPan 8s ease infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:   { from: { opacity: '0', transform: 'translateY(18px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn:   { from: { opacity: '0', transform: 'scale(0.96)' }, to: { opacity: '1', transform: 'scale(1)' } },
        float:     { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        shimmer:   { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        pulseGlow: { '0%,100%': { boxShadow: '0 0 0 0 rgba(99,102,241,0.35)' }, '50%': { boxShadow: '0 0 0 10px rgba(99,102,241,0)' } },
        gradientPan: { '0%,100%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' } },
      },
    },
  },
  safelist: [
    /* EMI card box — inline-styled but kept here as belt-and-suspenders */
    'rounded-2xl', 'overflow-hidden',
    /* Card body text colors */
    'text-rose-700', 'text-emerald-700', 'text-emerald-800', 'text-amber-700',
    /* Edit button + divider */
    'bg-slate-100', 'border-slate-100', 'border-slate-200', 'text-slate-700',
    /* Desktop row separator */
    'border-b-2',
    /* Pending approval badge */
    'bg-sky-100', 'text-sky-800', 'border-sky-300',
    /* Paid / overdue badges */
    'bg-emerald-100', 'text-emerald-800', 'border-emerald-300',
    'bg-rose-100',   'text-rose-800',    'border-rose-300',
    'bg-amber-100',  'text-amber-800',   'border-amber-300',
    'bg-indigo-100', 'text-indigo-800',  'border-indigo-300',
  ],
  plugins: [],
};
