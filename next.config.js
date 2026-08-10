/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.ibb.co' },
      { protocol: 'https', hostname: 'i.ibb.co' },
    ],
  },
  // SECURITY: Add security headers to all responses
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        // SECURITY: a deliberately conservative CSP.
        //
        // Only directives that cannot break this app are set:
        //   frame-ancestors 'none' — clickjacking protection, and unlike
        //                            X-Frame-Options it is honoured by every
        //                            modern browser.
        //   object-src 'none'      — kills <object>/<embed> plugin payloads.
        //   base-uri 'self'        — stops an injected <base> from redirecting
        //                            every relative URL to an attacker host.
        //   form-action 'self'     — stops an injected form posting session
        //                            data (or the retailer PIN) off-site.
        //
        // script-src / style-src are intentionally NOT restricted here. The
        // app ships an inline theme-boot script (app/layout.tsx) and relies on
        // inline styles throughout (framer-motion, the HTML receipt/statement
        // documents). Locking those down needs per-request nonces — a larger
        // change than this security pass should make, and one that would break
        // rendering if it were wrong. Tracked as a follow-up in the audit
        // report rather than applied blind.
        {
          key: 'Content-Security-Policy',
          value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
        },
      ],
    }];
  },
};
module.exports = nextConfig;

