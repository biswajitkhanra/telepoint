/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  poweredByHeader: false,
  images: {
    // The app never uses the /_next/image optimizer (photos render
    // unoptimized). Turning it off makes Next answer 404 there, which removes
    // the image-optimizer CVEs only patched in Next 15.5 (AVIF RCE, DoS,
    // cache poisoning) from the attack surface on 14.2.x.
    unoptimized: true,
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
