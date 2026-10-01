import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Email verified' };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  // The token is consumed by the API route; render the result client-side so a
  // reload cannot burn the same single-use token twice.
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="card w-full max-w-md text-center">
        <div className="text-3xl text-accent-green">✓</div>
        <h1 className="mt-4 text-xl font-semibold text-text-primary">Verifying your email</h1>
        <VerifyClient token={token ?? ''} />
      </div>
    </main>
  );
}

async function VerifyClient({ token }: { token: string }) {
  if (!token) {
    return (
      <>
        <p className="mt-2 text-sm text-text-tertiary">
          This link is missing its verification token.
        </p>
        <Link href="/register" className="btn-primary mt-6">
          Back to registration
        </Link>
      </>
    );
  }

  // Server-side consumption: safe because this page runs once per navigation.
  const { db } = await import('@/lib/db');
  const record = await db.verificationToken.findUnique({ where: { token } });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return (
      <>
        <p className="mt-2 text-sm text-text-secondary">
          This verification link is invalid or has already been used.
        </p>
        <Link href="/register" className="btn-primary mt-6">
          Register again
        </Link>
      </>
    );
  }

  await db.verificationToken.update({ where: { token }, data: { usedAt: new Date() } });

  return (
    <>
      <p className="mt-2 text-sm text-text-secondary">
        Your email is verified. Sign in once an admin has approved your account.
      </p>
      <Link href="/login" className="btn-primary mt-6">
        Go to sign in
      </Link>
    </>
  );
}