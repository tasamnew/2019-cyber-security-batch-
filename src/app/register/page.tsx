import Link from 'next/link';
import { LogoLockup } from '@/components/logo';
import { DEFAULT_SITE_NAME } from '@/lib/brand';
import type { Metadata } from 'next';
import { AuthForm } from '../auth/auth-form';

export const metadata: Metadata = { title: 'Register' };

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 font-mono text-lg font-bold">
          <LogoLockup siteName={DEFAULT_SITE_NAME} />
        </Link>

        <div className="card">
          <h1 className="text-xl font-semibold text-text-primary">Request access</h1>
          <p className="mb-6 mt-1 text-sm text-text-tertiary">
            Register with your student email. An administrator will review and approve your account.
          </p>

          <AuthForm mode="register" />
        </div>

        <p className="mt-6 text-center text-xs text-text-tertiary">
          This site is restricted to verified members of the 2019 Cyber Security student group.
        </p>
      </div>
    </main>
  );
}