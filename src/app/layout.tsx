import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/hooks/use-auth';
import { ToastProvider } from '@/hooks/use-toast';

export const metadata: Metadata = {
  title: {
    default: 'CS Hub — 2019 Cyber Security Student Group',
    template: '%s · CS Hub',
  },
  description:
    'Discussion, resources, CTF practice and assignment tracking for the 2019 Cyber Security student group.',
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
  robots: {
    // This is a private student hub: keep it out of search indexes entirely.
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
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