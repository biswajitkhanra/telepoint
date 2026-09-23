/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.ibb.co' },
      { protocol: 'https', hostname: 'i.ibb.co' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Clickjacking: this portal never needs to be framed by anyone.
          { key: 'X-Frame-Options', value: 'DENY' },
          // Stop browsers guessing content-type on our JSON/CSV/XLSX API responses.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Nothing on this site uses the camera, mic or geolocation.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Force HTTPS on every return visit (portal handles PII + payments).
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          // Belt-and-braces with X-Frame-Options, plus no plugins / base-tag hijack.
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
