import Constants from 'expo-constants';

/**
 * Mobile configuration.
 *
 * During development, configure EXPO_PUBLIC_PORTAL_URL in .env
 * or EAS secret (e.g. https://your-portal.vercel.app).
 * If running on Android Emulator against local Next.js dev server,
 * default is http://10.0.2.2:3000.
 */
export const PORTAL_BASE_URL =
  process.env.EXPO_PUBLIC_PORTAL_URL ||
  Constants.expoConfig?.extra?.portalUrl ||
  'https://telepoint.vercel.app';

export const STORAGE_KEYS = {
  SESSION: '@telepoint_customer_session',
  TOKEN: '@telepoint_push_token_meta',
  SETTINGS: '@telepoint_settings',
};

export const THEME = {
  bg: {
    darkest: '#070B14',
    card: '#0F172A',
    cardElevated: '#17223B',
    surface: '#1E293B',
    border: '#334155',
    borderSubtle: 'rgba(255,255,255,0.08)',
  },
  accent: {
    primary: '#2563EB',
    primaryGlow: '#3B82F6',
    secondary: '#6366F1',
    gold: '#F59E0B',
    goldGlow: '#FCD34D',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
  },
  text: {
    primary: '#F8FAFC',
    secondary: '#94A3B8',
    muted: '#64748B',
    gold: '#FDE68A',
  },
};
