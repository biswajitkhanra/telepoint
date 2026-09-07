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
    darkest: '#080B11', // Deep Obsidian Canvas
    card: '#0E131F', // Titanium Card Surface
    cardElevated: '#131927', // Elevated Neo-Card
    surface: '#1A2234', // Secondary Surface
    glass: 'rgba(14, 19, 31, 0.85)',
    border: 'rgba(255, 255, 255, 0.08)',
    borderHighlight: 'rgba(255, 255, 255, 0.16)',
    borderSubtle: 'rgba(255, 255, 255, 0.05)',
  },
  accent: {
    primary: '#3B82F6', // Electric Sapphire
    primaryGlow: '#60A5FA',
    secondary: '#4F46E5', // Electric Indigo
    gold: '#F59E0B', // Cyber Amber
    goldGlow: '#FBBF24',
    success: '#10B981', // Emerald Mint
    successGlow: '#34D399',
    warning: '#F59E0B',
    danger: '#EF4444', // Crimson Red
    dangerGlow: '#F87171',
  },
  text: {
    primary: '#FFFFFF',
    secondary: '#94A3B8',
    muted: '#64748B',
    gold: '#FDE68A',
    success: '#6EE7B7',
  },
  gradients: {
    obsidian: ['#0E131F', '#080B11'],
    titanium: ['#1A2234', '#0E131F'],
    metallicSheen: ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.02)'],
    emerald: ['#10B981', '#059669'],
    indigo: ['#4F46E5', '#3B82F6'],
    amber: ['#F59E0B', '#D97706'],
    crimson: ['#EF4444', '#DC2626'],
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

