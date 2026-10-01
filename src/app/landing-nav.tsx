'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';

export function LandingNav({ siteName }: { siteName: string }) {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg-primary/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 font-mono text-lg font-bold">
          <span className="text-accent-green">&gt;_</span>
          <span className="text-text-primary">{siteName}</span>
        </Link>

        <div className="flex items-center gap-3">
          {user ? (
            <Link href="/dashboard" className="btn-primary">
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn-ghost">
                Sign in
              </Link>
              <Link href="/register" className="btn-primary">
                Register
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}