'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/hooks/use-socket';
import { Avatar, RoleBadge, Spinner, EmptyState } from '@/components/ui';
import { cn } from '@/lib/utils';

type Status = 'PENDING' | 'APPROVED' | 'BLOCKED';
type Role = 'GUEST' | 'STUDENT' | 'MODERATOR' | 'ADMIN';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: Status;
  bio: string | null;
  avatarSeed: string;
  createdAt: string;
  lastLoginAt: string | null;
  _count: { posts: number; comments: number; messages: number };
}

const STATUS_TONE: Record<Status, string> = {
  PENDING: 'border-accent-amber/40 bg-accent-amber/10 text-accent-amber',
  APPROVED: 'border-accent-green/40 bg-accent-green/10 text-accent-green',
  BLOCKED: 'border-accent-rose/40 bg-accent-rose/10 text-accent-rose',
};

export function UsersClient({
  initialUsers,
  initialCounts,
  canChangeRoles,
  currentUserId,
}: {
  initialUsers: AdminUser[];
  initialCounts: Record<string, number>;
  canChangeRoles: boolean;
  currentUserId: string;
}) {
  const { push } = useToast();

  const [users, setUsers] = useState(initialUsers);
  const [filter, setFilter] = useState<'' | Status>('');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = users
    .filter((u) => (filter ? u.status === filter : true))
    .filter((u) =>
      query
        ? u.name.toLowerCase().includes(query.toLowerCase()) ||
          u.email.toLowerCase().includes(query.toLowerCase())
        : true,
    );

  async function patch(id: string, json: Record<string, unknown>, message: string) {
    setBusyId(id);
    try {
      const data = await apiFetch<{ user: AdminUser }>(`/api/admin/users/${id}`, {
        method: 'PATCH',
        json,
      });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...data.user } : u)));
      push(message, 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Update failed.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  function setStatus(user: AdminUser, status: Status) {
    const verb =
      status === 'APPROVED' ? 'approve' : status === 'BLOCKED' ? 'block' : 'move back to pending';
    if (!confirm(`${verb} ${user.name}?`)) return;
    void patch(user.id, { status }, `${user.name} is now ${status.toLowerCase()}.`);
  }

  function setRole(user: AdminUser, role: Role) {
    if (!confirm(`Change ${user.name}'s role to ${role.toLowerCase()}?`)) return;
    void patch(user.id, { role }, `${user.name} is now a ${role.toLowerCase()}.`);
  }

  const tabs: { value: '' | Status; label: string; count: number }[] = [
    { value: '', label: 'All', count: users.length },
    { value: 'PENDING', label: 'Pending', count: initialCounts.PENDING ?? 0 },
    { value: 'APPROVED', label: 'Approved', count: initialCounts.APPROVED ?? 0 },
    { value: 'BLOCKED', label: 'Blocked', count: initialCounts.BLOCKED ?? 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="scrollbar-thin flex gap-2 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.value || 'all'}
              onClick={() => setFilter(tab.value)}
              className={cn(
                'shrink-0 rounded-lg border px-3 py-1.5 text-xs transition',
                filter === tab.value
                  ? 'border-accent-cyan bg-accent-cyan/10 text-accent-cyan'
                  : 'border-border text-text-tertiary hover:text-text-primary',
              )}
            >
              {tab.label} <span className="font-mono">{tab.count}</span>
            </button>
          ))}
        </div>
        <input
          className="input sm:ml-auto sm:max-w-xs"
          placeholder="Search name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search members"
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState icon="◉" title="No members match" description="Try another filter or search term." />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[0.65rem] uppercase tracking-wide text-text-tertiary">
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Activity</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((user) => {
                const self = user.id === currentUserId;
                const busy = busyId === user.id;

                return (
                  <tr key={user.id} className="border-b border-border/60 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={user.name} seed={user.avatarSeed} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-text-primary">
                            {user.name}
                            {self && <span className="ml-1 text-xs text-text-tertiary">(you)</span>}
                          </span>
                          <span className="block truncate text-xs text-text-tertiary">{user.email}</span>
                        </span>
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      {canChangeRoles ? (
                        <select
                          value={user.role}
                          disabled={busy || self}
                          onChange={(e) => setRole(user, e.target.value as Role)}
                          aria-label={`Role for ${user.name}`}
                          className="input py-1 text-xs disabled:opacity-50"
                          title={self ? 'You cannot change your own role.' : undefined}
                        >
                          <option value="GUEST">Guest</option>
                          <option value="STUDENT">Student</option>
                          <option value="MODERATOR">Moderator</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                      ) : (
                        <RoleBadge role={user.role} />
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase',
                          STATUS_TONE[user.status],
                        )}
                      >
                        {user.status.toLowerCase()}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-xs text-text-tertiary">
                      {user._count.posts}p · {user._count.comments}c · {user._count.messages}m
                    </td>

                    <td className="px-4 py-3 text-xs text-text-tertiary">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {busy ? (
                          <Spinner />
                        ) : user.status !== 'APPROVED' ? (
                          <button
                            onClick={() => setStatus(user, 'APPROVED')}
                            className="text-xs text-accent-green hover:underline"
                          >
                            approve
                          </button>
                        ) : (
                          <button
                            onClick={() => setStatus(user, 'BLOCKED')}
                            className="text-xs text-accent-rose hover:underline"
                          >
                            block
                          </button>
                        )}

                        {user.status === 'BLOCKED' && (
                          <button
                            onClick={() => setStatus(user, 'PENDING')}
                            className="text-xs text-text-tertiary hover:underline"
                          >
                            unblock
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-text-tertiary">
        Blocking a member revokes their sessions immediately and prevents new sign-ins.
      </p>
    </div>
  );
}