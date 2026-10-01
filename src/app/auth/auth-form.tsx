'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/ui';

/**
 * Shared login/register form shell.
 * Errors from the API arrive as { error: { message, fields } } — field errors are
 * surfaced inline, everything else as a banner.
 */
export function AuthForm({
  mode,
}: {
  mode: 'login' | 'register';
}) {
  const router = useRouter();
  const { refresh } = useAuth();
  const { push } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isLogin = mode === 'login';

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      if (isLogin) {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data?.error?.message ?? 'Sign in failed.');
          setFieldErrors(data?.error?.fields ?? {});
          return;
        }

        await refresh();
        push(`Welcome back, ${data.user.name}.`, 'success');
        router.push('/dashboard');
      } else {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password, bio: bio || undefined }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data?.error?.message ?? 'Registration failed.');
          setFieldErrors(data?.error?.fields ?? {});
          return;
        }

        push('Registration submitted. An admin must approve your account.', 'success');
        router.push('/pending');
      }
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-accent-rose/40 bg-accent-rose/10 px-4 py-3 text-sm text-accent-rose"
        >
          {error}
        </div>
      )}

      {!isLogin && (
        <div>
          <label htmlFor="name" className="label">
            Full name
          </label>
          <input
            id="name"
            name="name"
            autoComplete="name"
            required
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={Boolean(fieldErrors.name)}
          />
          {fieldErrors.name && <p className="mt-1 text-xs text-accent-rose">{fieldErrors.name}</p>}
        </div>
      )}

      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(fieldErrors.email)}
        />
        {fieldErrors.email && <p className="mt-1 text-xs text-accent-rose">{fieldErrors.email}</p>}
      </div>

      <div>
        <label htmlFor="password" className="label">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            required
            className="input pr-20"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-text-tertiary hover:text-accent-cyan"
          >
            {showPassword ? 'hide' : 'show'}
          </button>
        </div>
        {fieldErrors.password && <p className="mt-1 text-xs text-accent-rose">{fieldErrors.password}</p>}
        {!isLogin && (
          <p className="mt-1 text-xs text-text-tertiary">
            At least 10 characters with upper case, lower case and a number.
          </p>
        )}
      </div>

      {!isLogin && (
        <div>
          <label htmlFor="bio" className="label">
            About you <span className="normal-case text-text-tertiary">(optional)</span>
          </label>
          <textarea
            id="bio"
            name="bio"
            rows={3}
            maxLength={500}
            className="input resize-y"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Interests, certifications you are working towards…"
          />
        </div>
      )}

      <button type="submit" className="btn-primary w-full py-3" disabled={busy}>
        {busy ? <Spinner /> : isLogin ? 'Sign in' : 'Submit registration'}
      </button>

      <div className="flex items-center justify-between text-sm">
        {isLogin ? (
          <>
            <Link href="/forgot-password" className="link">
              Forgot password?
            </Link>
            <Link href="/register" className="text-text-tertiary hover:text-accent-cyan">
              Create an account
            </Link>
          </>
        ) : (
          <Link href="/login" className="text-text-tertiary hover:text-accent-cyan">
            Already a member? Sign in
          </Link>
        )}
      </div>
    </form>
  );
}