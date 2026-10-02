import type { MetadataRoute } from 'next';
import { DEFAULT_SITE_NAME, SITE_TAGLINE } from '@/lib/brand';

/**
 * Web app manifest. This is what makes the site installable on both platforms:
 * Chrome/Edge require it plus a service worker, iOS reads it for the home-screen
 * name and icon but is driven by the `apple-*` meta tags in the root layout.
 */
export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${DEFAULT_SITE_NAME} — ${SITE_TAGLINE}`,
    short_name: DEFAULT_SITE_NAME,
    description:
      'Discussion, resources, CTF practice and assignment tracking for the 2019 Cyber Security student group.',
    start_url: '/dashboard',
    // `/dashboard` is behind auth and the middleware bounces anonymous users to
    // /login, which is the correct starting point for an installed app: the user
    // lands on the app and authenticates there, rather than on a marketing page.
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#0b1120',
    theme_color: '#0b1120',
    categories: ['education', 'productivity', 'social'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      // The maskable pair carries the same mark on an opaque plate, inset to
      // survive the launcher's circular crop.
      {
        src: '/icons/icon-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
