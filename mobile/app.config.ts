import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * TelePoint Expo config. Reads the static app.json as a base and applies a
 * per-role variant so the two Android experiences can ship as separate installs
 * when desired, while the single binary still supports both roles via in-app
 * role selection (existing behaviour, reused).
 *
 *   TELEPOINT_APP_VARIANT=customer  → com.telepoint.customer  (default)
 *   TELEPOINT_APP_VARIANT=retailer  → com.telepoint.retailer
 *
 * SUPABASE_URL + ANON key (publishable) are injected into `extra` from env so
 * the app no longer hard-codes them. The service-role key is never referenced.
 */
const rawVariant = (process.env.TELEPOINT_APP_VARIANT || 'customer').toLowerCase();
const VARIANT = rawVariant === 'admin' ? 'admin' : rawVariant === 'retailer' ? 'retailer' : 'customer';

const DEFAULT_PORTAL_URL = 'https://telepoint-topaz.vercel.app';
const DEFAULT_SUPABASE_URL = 'https://tjqigwdivmcyikurpepe.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqcWlnd2Rpdm1jeWlrdXJwZXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MTUzMDAsImV4cCI6MjA5NTI5MTMwMH0.c9P4e1c1o73ZmZ_wK1uEHUK_y5a3HS04oYCKKSoJScA';

const VARIANTS: Record<string, { name: string; package: string; scheme: string; appVariant: 'customer' | 'retailer' }> = {
  customer: { name: 'TelePoint', package: 'com.telepoint.customer', scheme: 'telepoint', appVariant: 'customer' },
  retailer: { name: 'TelePoint Retailer', package: 'com.telepoint.retailer', scheme: 'telepointretailer', appVariant: 'retailer' },
  admin: { name: 'TelePoint Admin', package: 'com.telepoint.retailer', scheme: 'telepointretailer', appVariant: 'retailer' },
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const v = VARIANTS[VARIANT] ?? VARIANTS.customer;
  return {
    ...config,
    name: v.name,
    slug: config.slug ?? 'telepoint',
    scheme: v.scheme,
    android: {
      ...config.android,
      package: v.package,
      // The retailer/admin app is only a WebView of the portal — it needs none of
      // the customer app's device-management / SMS / location permissions. Trim to
      // just network so its manifest doesn't over-declare.
      ...(v.appVariant === 'retailer' ? { permissions: ['INTERNET', 'ACCESS_NETWORK_STATE'] } : {}),
    },
    extra: {
      ...config.extra,
      appVariant: v.appVariant,
      portalUrl: process.env.EXPO_PUBLIC_PORTAL_URL || config.extra?.portalUrl || DEFAULT_PORTAL_URL,
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || config.extra?.supabaseUrl || DEFAULT_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || config.extra?.supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY,
      // Comma-separated Factory Reset Protection account identifier(s). Set per
      // company/retailer via EAS env EXPO_PUBLIC_FRP_ACCOUNTS. Empty by default —
      // never hard-code a personal account here. See src/config.ts for the format
      // caveat and the Device-Owner / Android 11+ requirement.
      frpAccounts: process.env.EXPO_PUBLIC_FRP_ACCOUNTS || config.extra?.frpAccounts || '',
    },
  };
};
