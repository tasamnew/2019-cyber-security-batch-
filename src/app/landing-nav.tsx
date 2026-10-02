'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { LogoLockup } from '@/components/logo';
import { ShareButton } from '@/components/share-button';

export function LandingNav({ siteName }: { siteName: string }) {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg-primary/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-mono text-lg font-bold">
          <LogoLockup siteName={siteName} />
        </Link>

        <div className="flex items-center gap-3">
          {/*
            No `url` prop: the location is read at click time instead. Computing
            it during render would give the server `undefined` and the browser
            the origin, which is a hydration mismatch on the very first paint.
          */}
          <ShareButton
            title={`${siteName} — 2019 Cyber Security Student Group`}
            text="Discussion, resources, CTF practice and assignment tracking."
            label="Share"
          />
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