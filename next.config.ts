import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Body size limits are enforced explicitly on the upload route (see
  // `maxUploadMb` in src/lib/storage.ts) so a stricter value can be applied
  // there without requiring a full server restart for framework defaults.
  experimental: {
    serverActions: {
      // Server Actions are not used for mutations in this project; all writes go
      // through route handlers so they can share the auth/rate-limit middleware.
      bodySizeLimit: '1mb',
    },
  },

  // Uploaded files are never served from `public/`. They are streamed through an
  // authenticated route handler so access control cannot be bypassed by guessing
  // a static path. This is why no static asset config is required.
  images: {
    remotePatterns: [],
  },

  eslint: {
    // Linting is a separate `npm run lint` step so that a lint warning can never
    // block a production deploy. `npm run typecheck` is the hard gate.
    ignoreDuringBuilds: true,
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
          // Only the app's own origin may be framed/embedded, and downloads are
          // forced to be treated as untrusted attachments.
          { key: 'X-Download-Options', value: 'noopen' },
          {
            key: 'Strict-Transport-Security',
            value: isDev ? '' : 'max-age=63072000; includeSubDomains; preload',
          },
        ].filter((h) => h.value !== ''),
      },
      {
        // Uploaded resources are user-supplied binaries: never let the browser
        // sniff or render them inline from our origin.
        //
        // The negative lookahead keeps this off /api/files/upload. A bare
        // `/api/files/:path*` matches that too, and the `sandbox` directive
        // there put the upload's JSON reply in an opaque origin, so the client
        // received a 201 it could not parse.
        source: '/api/files/:path((?!upload$).*)',
        headers: [
          { key: 'Content-Security-Policy', value: "default-src 'none'; sandbox" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default nextConfig;