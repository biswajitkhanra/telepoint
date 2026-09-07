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
  DEVICE_ROLE: '@telepoint_device_role', // 'customer' | 'staff'
  ACTIVE_LOAN: '@telepoint_active_loan_id',
};

export const THEME = {
  bg: {
    darkest: '#F8FAFC', // Clean Pearl Alabaster Canvas (Light Theme)
    card: '#FFFFFF', // Crisp Pure White Card Surface
    cardElevated: '#FFFFFF', // Elevated Pure White Card
    surface: '#F1F5F9', // Subtle Slate Surface
    glass: 'rgba(255, 255, 255, 0.95)',
    border: 'rgba(15, 23, 42, 0.08)',
    borderHighlight: 'rgba(37, 99, 235, 0.25)',
    borderSubtle: 'rgba(15, 23, 42, 0.04)',
  },
  accent: {
    primary: '#2563EB', // Royal Telepoint Blue
    primaryGlow: '#3B82F6',
    secondary: '#4F46E5', // Electric Indigo
    gold: '#D97706', // Warm Amber
    goldGlow: '#F59E0B',
    success: '#10B981', // Vibrant Emerald
    successGlow: '#34D399',
    warning: '#D97706',
    danger: '#EF4444', // Coral Crimson
    dangerGlow: '#F87171',
  },
  text: {
    primary: '#0F172A', // Deep Slate / Charcoal
    secondary: '#334155', // High-contrast subtitle
    muted: '#64748B', // Label text
    gold: '#B45309',
    success: '#059669',
  },
  gradients: {
    pearl: ['#FFFFFF', '#F8FAFC'],
    titanium: ['#FFFFFF', '#F1F5F9'],
    metallicSheen: ['rgba(255, 255, 255, 0.9)', 'rgba(241, 245, 249, 0.4)'],
    emerald: ['#10B981', '#059669'],
    indigo: ['#2563EB', '#1D4ED8'],
    amber: ['#F59E0B', '#D97706'],
    crimson: ['#EF4444', '#DC2626'],
    obsidian: ['#FFFFFF', '#F8FAFC'], // Compatibility alias
  },
};

export const SPRING_CONFIG = {
  touchDown: {
    tension: 240,
    friction: 18,
    useNativeDriver: true,
  },
  touchUp: {
    tension: 180,
    friction: 12,
    useNativeDriver: true,
  },
  staggerDelay: 45,
};

export const TELEPOINT_BRAND = {
  name: 'Telepoint',
  tagline: 'Bank-Grade Secure EMI Portal',
  colors: {
    navyDark: '#0a1f44',
    navyMid: '#1b3e7d',
    electricBlue: '#2563eb',
    orbitBlue: '#5cc6ff',
    satelliteDot: '#8ad4ff',
  },
};

