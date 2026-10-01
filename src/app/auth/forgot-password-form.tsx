'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/ui';

export function ForgotPasswordForm() {
  const router = useRouter();
  const { push } = useToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        push(data?.error?.message ?? 'Something went wrong.', 'error');
        return;
      }

      // In development the API returns the token so you can complete the flow
      // without an email server configured.
      setDevToken(data?.devResetToken ?? null);
      push('If that account exists, a reset link has been sent.', 'success');
    } catch {
      push('Network error. Try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <button type="submit" className="btn-primary w-full py-3" disabled={busy}>
          {busy ? <Spinner /> : 'Send reset link'}
        </button>
      </form>

      {devToken && (
        <div className="rounded-lg border border-accent-amber/40 bg-accent-amber/10 p-4 text-xs text-accent-amber">
          <p className="font-semibold">Development mode</p>
          <p className="mt-1">No mail server configured, so here is your reset link:</p>
          <Link href={`/reset-password?token=${devToken}`} className="mt-2 block font-mono underline break-all">
            /reset-password?token={devToken}
          </Link>
        </div>
      )}

      <Link href="/login" className="block text-center text-sm text-text-tertiary hover:text-accent-cyan">
        Back to sign in
      </Link>
      <button
        type="button"
        onClick={() => router.push('/login')}
        className="sr-only"
      >
        Back
      </button>
    </div>
  );
}