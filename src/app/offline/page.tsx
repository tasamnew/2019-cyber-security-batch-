import type { Metadata } from 'next';
import Link from 'next/link';
import { DEFAULT_SITE_NAME } from '@/lib/brand';

export const metadata: Metadata = { title: 'Offline' };

/**
 * Shown by the service worker when a navigation cannot reach the network.
 *
 * Deliberately a server component with no client JS: a page rendered while
 * offline cannot be trusted to boot, and a dependency on the framework runtime
 * is exactly what fails first when the network is gone.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="card max-w-sm p-8">
        <p aria-hidden className="mb-4 text-3xl">
          📡
        </p>
        <h1 className="text-xl font-bold text-text-primary">You are offline</h1>
        <p className="mt-2 text-sm text-text-secondary">
          {DEFAULT_SITE_NAME} needs a connection to load your messages and coursework. It will
          reconnect on its own.
        </p>
        <Link href="/dashboard" className="btn-primary mt-6 inline-block">
          Try again
        </Link>
      </div>
    </div>
  );
}
