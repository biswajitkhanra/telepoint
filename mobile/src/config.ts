import Constants from 'expo-constants';
export * from './constants/colors';
export * from './constants/typography';
export * from './constants/design';
export * from './constants/animations';

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
  'https://telepoint-topaz.vercel.app';

/**
 * Supabase project URL + ANON (publishable) key. The anon key is safe to ship
 * in the client — RLS enforces access. The service-role key must NEVER appear
 * here. Configure via EAS/EXPO_PUBLIC env or app.config `extra`.
 */
export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  Constants.expoConfig?.extra?.supabaseUrl ||
  '';

export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  Constants.expoConfig?.extra?.supabaseAnonKey ||
  '';

/**
 * Which single-purpose build this is:
 *   'customer' → only the customer login is shown (com.telepoint.customer)
 *   'retailer' → only the staff (admin/retailer) login is shown (com.telepoint.retailer)
 *   'combined' → both, via the role-selection screen (dev / one-binary default)
 * Set by app.config.ts from TELEPOINT_APP_VARIANT.
 */
export const APP_VARIANT: 'customer' | 'retailer' | 'combined' =
  ((process.env.EXPO_PUBLIC_APP_VARIANT as string) ||
    (Constants.expoConfig?.extra?.appVariant as string) ||
    'combined') as 'customer' | 'retailer' | 'combined';

/**
 * Account identifier(s) that may unlock a financed device after a factory reset
 * (Factory Reset Protection). Configured by the company/retailer — NEVER a
 * hard-coded personal address in code. Supplied via EXPO_PUBLIC_FRP_ACCOUNTS
 * (comma-separated) or app.config `extra.frpAccounts`. Empty by default.
 *
 * FORMAT CAVEAT (verified — see docs/frp-and-sms-provisioning-research.md §2.2):
 * the identifier must be the account's NUMERIC Google id ("Gaia" userId), NOT the
 * plain email. Setting the raw email is unreliable and on some OEMs locks the
 * device to an UNKNOWN account after reset — do not use the email. For TelePoint's
 * target account (biswajit.khanra82@gmail.com), obtain its numeric id (People API
 * people/me → metadata.sources[].id, while signed in as that account) and set
 * EXPO_PUBLIC_FRP_ACCOUNTS to that number. Only takes effect on Device Owner +
 * Android 11+ (API 30) devices that implement FactoryResetProtectionPolicy.
 */
/**
 * Authorised phone numbers that may LOCK/UNLOCK a financed device by SMS
 * (matched on the last 10 digits, so +91 / 91 / bare all work). Configured by
 * the company/retailer via EXPO_PUBLIC_SMS_ALLOWED_SENDERS (comma-separated) or
 * app.config `extra.smsAllowedSenders`. Defaults to the two TelePoint numbers.
 * The device also checks the customer code in the message, but this allowlist is
 * the real gate — keep these numbers private.
 */
export const SMS_ALLOWED_SENDERS: string = (
  (process.env.EXPO_PUBLIC_SMS_ALLOWED_SENDERS as string) ||
  (Constants.expoConfig?.extra?.smsAllowedSenders as string) ||
  '7003617029,7003617074'
);

// FAIL-SAFE: no default account. FRP locks a reset phone to the configured
// account, so a wrong id is worse than none — the device must NOT ship with a
// baked-in Gaia id. Set EXPO_PUBLIC_FRP_ACCOUNTS (numeric Gaia userId, verified
// via People API people/me → metadata.sources[].id) or app.config
// extra.frpAccounts before enabling FRP on a Device Owner + Android 11+ phone.
// Until then FinancingProtection reports frp_accounts_missing (policy_not_applied).
export const FRP_PROTECTION_ACCOUNTS: string[] = (
  (process.env.EXPO_PUBLIC_FRP_ACCOUNTS as string) ||
  (Constants.expoConfig?.extra?.frpAccounts as string) ||
  ''
)
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

export const STORAGE_KEYS = {
  SESSION: '@telepoint_customer_session',
  TOKEN: '@telepoint_push_token_meta',
  SETTINGS: '@telepoint_settings',
  DEVICE_ROLE: '@telepoint_device_role', // 'customer' | 'staff'
  ACTIVE_LOAN: '@telepoint_active_loan_id',
  STAFF_ROLE: '@telepoint_staff_role', // 'admin' | 'retailer'
  STAFF_USER: '@telepoint_staff_user',
  // Signed proof of the Aadhaar/mobile login; sent with customer_id lookups.
  CUSTOMER_SESSION_TOKEN: '@telepoint_customer_session_token',
  // Locally-cached reminder configuration (synced from reminder_settings) that
  // drives the OFFLINE reminder engine. See services/reminderService.ts.
  REMINDER_CONFIG: '@telepoint_reminder_config',
  // { url, path } of the locally-cached customer photo for offline reminders.
  REMINDER_PHOTO_META: '@telepoint_reminder_photo_meta',
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

