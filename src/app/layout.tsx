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
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    // iOS ignores the manifest and reads this one instead. It must be opaque:
    // iOS composites a transparent icon on black.
    apple: '/icons/apple-touch-icon.png',
  },
  // Link previews. Absolute URLs are required — crawlers resolve these against
  // the requesting page, and a relative path produces a broken card.
  openGraph: {
    type: 'website',
    siteName: title,
    title,
    description,
    images: [
      {
        url: '/icons/social-card.png',
        width: 1200,
        height: 630,
        alt: `${DEFAULT_SITE_NAME} — ${SITE_TAGLINE}`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/icons/social-card.png'],
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
  themeColor: '#0b1120',
  width: 'device-width',
  initialScale: 1,
  // Needed for the standalone window to sit below the notch and home
  // indicator on iOS rather than under them.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        {/*
          iOS install support. Safari ignores the manifest for these, and
          `apple-mobile-web-app-capable` is what removes the Safari chrome when
          the app is launched from the home screen. A `<meta name="mobile-web-app-capable">`
          is included for Chrome on Android, which reads that instead.
        */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={DEFAULT_SITE_NAME} />
        <meta name="application-name" content={DEFAULT_SITE_NAME} />
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
