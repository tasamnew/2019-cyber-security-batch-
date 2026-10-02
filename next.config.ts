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
        // The service worker must be served from the origin root or its scope
        // cannot cover the whole app. Next.js serves `public/sw.js` at `/sw.js`
        // already, and no extra header is required for the scope itself.
        //
        // `no-store` matters though: a cached worker is a worker that cannot be
        // replaced, so a user would be pinned to a stale copy indefinitely after
        // a deploy. `Service-Worker-Allowed` is set defensively so the scope
        // survives even if the file is ever moved into a subdirectory.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        // Icons are content-stable but the filenames are not hashed, so a
        // redeploy that redraws the mark would otherwise be invisible to anyone
        // who already has the app installed.
        source: '/icons/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
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