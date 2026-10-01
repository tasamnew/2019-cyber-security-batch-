import Link from 'next/link';
import { LogoLockup } from '@/components/logo';
import { DEFAULT_SITE_NAME } from '@/lib/brand';
import type { Metadata } from 'next';
import { ForgotPasswordForm } from '../auth/forgot-password-form';

export const metadata: Metadata = { title: 'Reset password' };

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 font-mono text-lg font-bold">
          <LogoLockup siteName={DEFAULT_SITE_NAME} />
        </Link>

        <div className="card">
          <h1 className="text-xl font-semibold text-text-primary">Forgot your password?</h1>
          <p className="mb-6 mt-1 text-sm text-text-tertiary">
            Enter your email and we&apos;ll send a reset link if the account exists.
          </p>

          <ForgotPasswordForm />
        </div>
      </div>
    </main>
  );
}