'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/hooks/use-socket';
import { Spinner, EmptyState, RoleBadge } from '@/components/ui';
import { Markdown } from '@/components/markdown';
import { cn, timeAgo } from '@/lib/utils';

interface Announcement {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  expiresAt: string | null;
  createdAt: string;
  author: { id: string; name: string; role: string };
}

export function AnnouncementsClient({
  active,
  expired,
}: {
  active: Announcement[];
  expired: { id: string; title: string; expiresAt: string | null; author: string }[];
}) {
  const { push } = useToast();

  const [items, setItems] = useState(active);
  const [composing, setComposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', pinned: true, expiresAt: '' });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await apiFetch<{ announcement: Announcement }>('/api/announcements', {
        method: 'POST',
        json: {
          title: form.title,
          body: form.body,
          pinned: form.pinned,
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        },
      });
      setItems((prev) => [data.announcement, ...prev]);
      setForm({ title: '', body: '', pinned: true, expiresAt: '' });
      setComposing(false);
      push('Announcement published.', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not publish the announcement.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function togglePin(item: Announcement) {
    try {
      const data = await apiFetch<{ announcement: Announcement }>(`/api/announcements/${item.id}`, {
        method: 'PATCH',
        json: { pinned: !item.pinned },
      });
      setItems((prev) => prev.map((a) => (a.id === item.id ? { ...a, pinned: data.announcement.pinned } : a)));
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not update the announcement.', 'error');
    }
  }

  async function remove(item: Announcement) {
    if (!confirm(`Delete "${item.title}"?`)) return;
    try {
      await apiFetch(`/api/announcements/${item.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((a) => a.id !== item.id));
      push('Announcement deleted.', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setComposing((v) => !v)}>
          {composing ? 'Cancel' : '+ New announcement'}
        </button>
      </div>

      {composing && (
        <form onSubmit={create} className="card space-y-4 p-5">
          <div>
            <label htmlFor="an-title" className="label">
              Title
            </label>
            <input
              id="an-title"
              required
              minLength={3}
              maxLength={120}
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div>
            <label htmlFor="an-body" className="label">
              Body (Markdown)
            </label>
            <textarea
              id="an-body"
              required
              minLength={5}
              rows={5}
              className="input resize-y font-mono text-xs"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="an-exp" className="label">
                Expires <span className="normal-case text-text-tertiary">(blank = never)</span>
              </label>
              <input
                id="an-exp"
                type="datetime-local"
                className="input"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={form.pinned}
                onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
                className="accent-[var(--accent-green)]"
              />
              Pin to the top of the dashboard
            </label>
          </div>

          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? <Spinner /> : 'Publish'}
          </button>
        </form>
      )}

      {items.length === 0 ? (
        <EmptyState icon="✦" title="No announcements" description="Broadcasts you publish show on the dashboard." />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className={cn(
                'card p-5',
                item.pinned && 'border-accent-amber/40 bg-accent-amber/[0.04]',
              )}
            >
              <header className="flex flex-wrap items-center gap-2">
                {item.pinned && <span className="text-xs text-accent-amber">📌 pinned</span>}
                <h2 className="font-semibold text-text-primary">{item.title}</h2>
                <span className="ml-auto flex items-center gap-2 text-xs text-text-tertiary">
                  {item.author.name}
                  <RoleBadge role={item.author.role} />
                  <span>· {timeAgo(item.createdAt)}</span>
                </span>
              </header>

              <Markdown content={item.body} className="mt-3 text-sm" />

              <footer className="mt-4 flex items-center gap-3">
                <button onClick={() => togglePin(item)} className="text-xs text-text-tertiary hover:text-accent-amber">
                  {item.pinned ? 'unpin' : 'pin'}
                </button>
                <button onClick={() => remove(item)} className="text-xs text-text-tertiary hover:text-accent-rose">
                  delete
                </button>
                {item.expiresAt && (
                  <span className="ml-auto text-[0.65rem] text-text-tertiary">
                    expires {new Date(item.expiresAt).toLocaleString()}
                  </span>
                )}
              </footer>
            </li>
          ))}
        </ul>
      )}

      {expired.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-3 font-semibold text-text-primary">Expired</h2>
          <ul className="space-y-1">
            {expired.map((row) => (
              <li key={row.id} className="flex justify-between gap-3 text-xs text-text-tertiary">
                <span className="truncate">{row.title}</span>
                <span className="shrink-0">
                  {row.expiresAt ? new Date(row.expiresAt).toLocaleDateString() : ''} · {row.author}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}