'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/hooks/use-socket';
import { Avatar, RoleBadge, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';

interface Profile {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  bio: string | null;
  avatarSeed: string;
  createdAt: string;
  lastLoginAt: string | null;
}

const AVATAR_CHOICES = ['0f172a', '22c55e', '06b6d4', 'a855f7', 'f43f5e', 'f59e0b', '3b82f6', '14b8a6'];

export function ProfileClient({
  profile,
  stats,
  sessions,
  solves,
}: {
  profile: Profile;
  stats: { postCount: number; commentCount: number; solveCount: number; totalPoints: number };
  sessions: { id: string; userAgent: string | null; ip: string | null; createdAt: string }[];
  solves: { id: string; title: string; difficulty: string; points: number; solvedAt: string }[];
}) {
  const router = useRouter();
  const { refresh } = useAuth();
  const { push } = useToast();

  const [name, setName] = useState(profile.name);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [avatarSeed, setAvatarSeed] = useState(profile.avatarSeed);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState({ current: '', next: '' });
  const [changing, setChanging] = useState(false);

  const dirty =
    name !== profile.name || bio !== (profile.bio ?? '') || avatarSeed !== profile.avatarSeed;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        json: { name, bio: bio || null, avatarSeed },
      });
      await refresh();
      push('Profile updated.', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not save your profile.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setChanging(true);
    try {
      await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        json: { currentPassword: password.current, newPassword: password.next },
      });
      setPassword({ current: '', next: '' });
      push('Password changed. Other sessions were signed out.', 'success');
      router.refresh();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not change your password.', 'error');
    } finally {
      setChanging(false);
    }
  }

  async function revokeSession(id: string) {
    try {
      await apiFetch(`/api/auth/sessions/${id}`, { method: 'DELETE' });
      push('Session revoked.', 'success');
      router.refresh();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not revoke that session.', 'error');
    }
  }

  return (
    <div className="space-y-6">
      {/* Identity card */}
      <section className="card flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
        <Avatar name={profile.name} seed={avatarSeed} size="lg" showRing />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-text-primary">{profile.name}</h2>
            <RoleBadge role={profile.role} />
            <span
              className={cn(
                'rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase',
                profile.status === 'APPROVED'
                  ? 'border-accent-green/40 bg-accent-green/10 text-accent-green'
                  : 'border-accent-amber/40 bg-accent-amber/10 text-accent-amber',
              )}
            >
              {profile.status.toLowerCase()}
            </span>
          </div>
          <p className="mt-1 text-sm text-text-tertiary">{profile.email}</p>
          <p className="mt-1 text-xs text-text-tertiary">
            Member since {new Date(profile.createdAt).toLocaleDateString()}
            {profile.lastLoginAt &&
              ` · last login ${new Date(profile.lastLoginAt).toLocaleString()}`}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Posts" value={stats.postCount} />
          <Stat label="Replies" value={stats.commentCount} />
          <Stat label="Solves" value={stats.solveCount} />
          <Stat label="Points" value={stats.totalPoints} />
        </div>
      </section>

      {/* Edit form */}
      <form onSubmit={save} className="card space-y-4 p-6">
        <h3 className="font-semibold text-text-primary">Edit details</h3>

        <div>
          <label htmlFor="pf-name" className="label">
            Display name
          </label>
          <input
            id="pf-name"
            className="input"
            minLength={2}
            maxLength={60}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <span className="label">Avatar colour</span>
          <div className="flex flex-wrap gap-2">
            {AVATAR_CHOICES.map((seed) => (
              <button
                key={seed}
                type="button"
                aria-label={`Avatar colour ${seed}`}
                onClick={() => setAvatarSeed(seed)}
                className={cn(
                  'rounded-full p-0.5 transition',
                  avatarSeed === seed && 'ring-2 ring-accent-green',
                )}
              >
                <Avatar name={profile.name} seed={seed} size="md" />
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="pf-bio" className="label">
            Bio <span className="normal-case text-text-tertiary">(Markdown, 280 chars)</span>
          </label>
          <textarea
            id="pf-bio"
            rows={3}
            maxLength={280}
            className="input resize-y"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
        </div>

        <button type="submit" className="btn-primary" disabled={saving || !dirty}>
          {saving ? <Spinner /> : 'Save changes'}
        </button>
      </form>

      {/* Password */}
      <form onSubmit={changePassword} className="card space-y-4 p-6">
        <h3 className="font-semibold text-text-primary">Change password</h3>
        <p className="-mt-2 text-xs text-text-tertiary">
          Changing your password signs out every other active session.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pf-current" className="label">
              Current password
            </label>
            <input
              id="pf-current"
              type="password"
              autoComplete="current-password"
              required
              className="input"
              value={password.current}
              onChange={(e) => setPassword({ ...password, current: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="pf-next" className="label">
              New password
            </label>
            <input
              id="pf-next"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              className="input"
              value={password.next}
              onChange={(e) => setPassword({ ...password, next: e.target.value })}
            />
          </div>
        </div>
        <button
          type="submit"
          className="btn-secondary"
          disabled={changing || !password.current || password.next.length < 10}
        >
          {changing ? <Spinner /> : 'Update password'}
        </button>
      </form>

      {/* Sessions */}
      <section className="card p-6">
        <h3 className="mb-4 font-semibold text-text-primary">Active sessions</h3>
        {sessions.length === 0 ? (
          <p className="text-sm text-text-tertiary">No other active sessions.</p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-text-primary">
                    {session.userAgent ?? 'Unknown device'}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {session.ip ?? 'unknown IP'} · started{' '}
                    {new Date(session.createdAt).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => revokeSession(session.id)}
                  className="text-xs text-accent-rose hover:underline"
                >
                  revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Solves */}
      {solves.length > 0 && (
        <section className="card p-6">
          <h3 className="mb-4 font-semibold text-text-primary">Recent CTF solves</h3>
          <ul className="space-y-2">
            {solves.map((solve) => (
              <li key={solve.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-text-primary">{solve.title}</span>
                <span className="shrink-0 font-mono text-xs text-text-tertiary">
                  {solve.difficulty.toLowerCase()} · +{solve.points} pts
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border px-4 py-2 text-center">
      <p className="font-mono text-xl font-bold text-accent-green">{value}</p>
      <p className="text-[0.65rem] uppercase tracking-wide text-text-tertiary">{label}</p>
    </div>
  );
}