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
const VARIANT = (process.env.TELEPOINT_APP_VARIANT || 'customer').toLowerCase();

const VARIANTS: Record<string, { name: string; package: string; scheme: string }> = {
  customer: { name: 'TelePoint', package: 'com.telepoint.customer', scheme: 'telepoint' },
  retailer: { name: 'TelePoint Retailer', package: 'com.telepoint.retailer', scheme: 'telepointretailer' },
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
    },
    extra: {
      ...config.extra,
      appVariant: VARIANT,
      portalUrl: process.env.EXPO_PUBLIC_PORTAL_URL || config.extra?.portalUrl,
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || config.extra?.supabaseUrl || '',
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || config.extra?.supabaseAnonKey || '',
    },
  };
};
