import Link from 'next/link';
import { LogoLockup } from '@/components/logo';
import { DEFAULT_SITE_NAME } from '@/lib/brand';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ResetPasswordForm } from '../auth/reset-password-form';
import { Spinner } from '@/components/ui';

export const metadata: Metadata = { title: 'Choose a new password' };

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 font-mono text-lg font-bold">
          <LogoLockup siteName={DEFAULT_SITE_NAME} />
        </Link>

        <div className="card">
          <h1 className="text-xl font-semibold text-text-primary">Choose a new password</h1>
          <p className="mb-6 mt-1 text-sm text-text-tertiary">
            Resetting your password signs you out everywhere.
          </p>

          {/* useSearchParams needs a Suspense boundary during prerender. */}
          <Suspense fallback={<Spinner />}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}