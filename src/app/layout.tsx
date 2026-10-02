import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/hooks/use-auth';
import { ToastProvider } from '@/hooks/use-toast';
import { DEFAULT_SITE_NAME, SITE_TAGLINE } from '@/lib/brand';

const title = `${DEFAULT_SITE_NAME} — ${SITE_TAGLINE}`;
const description =
  'Discussion, resources, CTF practice and assignment tracking for the 2019 Cyber Security student group.';

export const metadata: Metadata = {
  title: {
    default: title,
    template: `%s · ${DEFAULT_SITE_NAME}`,
  },
  description,
  // No web app manifest and no service worker: this is reached as a link in a
  // browser, not installed. `apple-touch-icon` is still set so that anyone who
  // bookmarks to the home screen gets a real icon rather than a screenshot.
  icons: {
    icon: '/logo.svg',
    apple: '/logo.svg',
  },
  // Link previews for when the URL is shared, e.g. on Telegram. Relative paths
  // are correct here: these are resolved against the deployment origin.
  openGraph: {
    type: 'website',
    siteName: title,
    title,
    description,
    images: [{ url: '/social-card.png', width: 1200, height: 630, alt: title }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/social-card.png'],
  },
  robots: {
    // This is a private student hub: keep it out of search indexes entirely.
    // `noimageindex` matters specifically for sharing, so a posted link does
    // not get archived and re-surfaced by an image search months later.
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export const viewport: Viewport = {
  // Tints the browser chrome on Android. Harmless without an install path, and
  // it stops the address bar flashing white on a dark page.
  themeColor: '#0b1120',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Stops iOS turning numeric strings in posts into dialable phone links. */}
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body className="min-h-screen antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded focus:bg-accent-green focus:px-4 focus:py-2 focus:text-slate-950"
        >
          Skip to content
        </a>
        <ToastProvider>
          <AuthProvider initialUser={null}>{children}</AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
