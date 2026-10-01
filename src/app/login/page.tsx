import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthForm } from '../auth/auth-form';
import { LogoLockup } from '@/components/logo';
import { DEFAULT_SITE_NAME } from '@/lib/brand';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 font-mono text-lg font-bold">
          <LogoLockup siteName={DEFAULT_SITE_NAME} />
        </Link>

        <div className="card">
          <h1 className="text-xl font-semibold text-text-primary">Sign in</h1>
          <p className="mb-6 mt-1 text-sm text-text-tertiary">
            Members of the 2019 Cyber Security student group only.
          </p>

          <AuthForm mode="login" />
        </div>

        <p className="mt-6 text-center text-xs text-text-tertiary">
          Private site. Access is granted by an administrator after registration is approved.
        </p>
      </div>
    </main>
  );
}