/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        brand: {
          50:  '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
          400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
        },
        secondary: {
          50:  '#faf5ff', 100: '#f3e8ff', 200: '#e9d5ff', 300: '#d8b4fe',
          400: '#c084fc', 500: '#a855f7', 600: '#9333ea', 700: '#7e22ce',
        },
        accent: {
          50:  '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4',
          400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e',
        },
        // Semantic tokens are CSS-variable driven so the whole app re-skins
        // for dark mode by swapping variables on <html class="dark">.
        ink:  {
          DEFAULT: 'rgb(var(--tp-ink) / <alpha-value>)',
          light: 'rgb(var(--tp-ink-light) / <alpha-value>)',
          muted: 'rgb(var(--tp-ink-muted) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'rgb(var(--tp-surface) / <alpha-value>)',
          2: 'rgb(var(--tp-surface-2) / <alpha-value>)',
          3: 'rgb(var(--tp-surface-3) / <alpha-value>)',
          4: 'rgb(var(--tp-surface-4) / <alpha-value>)',
        },
        success: { DEFAULT: '#16a34a', light: '#f0fdf4', border: '#86efac' },
        warning: { DEFAULT: '#d97706', light: '#fffbeb', border: '#fcd34d' },
        danger:  { DEFAULT: '#dc2626', light: '#fef2f2', border: '#fca5a5' },
        info:    { DEFAULT: '#2563eb', light: '#eff6ff', border: '#93c5fd' },
        // Legacy — kept for backward-compat with direct amber/gold refs in templates
        gold: { 300: '#fcd97a', 400: '#f5c842', 500: '#e8b800', 600: '#c99b00' },
        jade: { 400: '#34d399', 500: '#10b981' },
        crimson: { 300: '#fca5a5', 400: '#f87171', 500: '#ef4444' },
        sapphire: { 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6' },
        obsidian: { 600: '#1e2847', 700: '#161d35', 800: '#0f1425', 900: '#0a0d1a', 950: '#060810' },
        slate: { 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155' },
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)',
        'card-hover': '0 8px 24px rgba(59,130,246,0.10), 0 2px 8px rgba(0,0,0,0.06)',
        'modal': '0 16px 48px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.06)',
        'float': '0 8px 24px rgba(0,0,0,0.12)',
        'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.5)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      animation: {
        'fade-in':   'fadeIn 0.25s ease-out both',
        'slide-up':  'slideUp 0.3s cubic-bezier(0.16,1,0.3,1) both',
        'scale-in':  'scaleIn 0.25s ease-out both',
        'pulse-gold': 'pulseGold 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:   { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn:   { from: { opacity: '0', transform: 'scale(0.95)' }, to: { opacity: '1', transform: 'scale(1)' } },
        pulseGold: { '0%,100%': { boxShadow: '0 0 0 0 rgba(59,130,246,0.4)' }, '50%': { boxShadow: '0 0 0 8px rgba(59,130,246,0)' } },
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
    /* Brand new secondary / accent safelist */
    'bg-secondary-50', 'text-secondary-600', 'border-secondary-200',
    'bg-accent-50',    'text-accent-600',    'border-accent-200',
  ],
  plugins: [],
};
