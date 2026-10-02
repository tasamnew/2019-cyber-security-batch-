'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/hooks/use-socket';
import { Spinner, EmptyState } from '@/components/ui';
import { slugify } from '@/lib/utils';

interface Channel {
  id: string;
  slug: string;
  name: string;
  topic: string | null;
  kind: 'PUBLIC' | 'PRIVATE';
  messageCount: number;
  memberCount: number;
}

interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color: string;
  sortOrder: number;
  postCount: number;
}

/**
 * Admin screen for the two course taxonomies:
 *  - chat channels, which decide where members talk
 *  - forum categories, which decide where threads are filed
 *
 * Adding a course normally means adding to both, so they sit on one page.
 * Writes reuse the existing moderator-guarded API routes, so the rules live in
 * exactly one place.
 */
export function TaxonomyClient({
  channels: initialChannels,
  categories: initialCategories,
}: {
  channels: Channel[];
  categories: Category[];
}) {
  const { push } = useToast();

  const [channels, setChannels] = useState(initialChannels);
  const [categories, setCategories] = useState(initialCategories);
  const [busy, setBusy] = useState(false);
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);

  const [channelForm, setChannelForm] = useState({ name: '', topic: '', kind: 'PUBLIC' as 'PUBLIC' | 'PRIVATE' });
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    color: '#0e7490',
    sortOrder: '0',
  });

  /** Preview of the slug the server will derive from the name. */
  function previewSlug(name: string): string {
    return slugify(name);
  }

  async function createChannel(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await apiFetch<{ channel: Channel }>('/api/channels', {
        method: 'POST',
        json: { name: channelForm.name, topic: channelForm.topic || undefined, kind: channelForm.kind },
      });
      setChannels((prev) =>
        [...prev, { ...data.channel, messageCount: 0, memberCount: 1 }].sort((a, b) =>
          a.slug.localeCompare(b.slug),
        ),
      );
      setChannelForm({ name: '', topic: '', kind: 'PUBLIC' });
      push(`Channel "#${data.channel.name}" created.`, 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not create the channel.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function renameChannel(channel: Channel, name: string, topic: string) {
    try {
      const data = await apiFetch<{ channel: Channel }>(`/api/channels/${channel.id}`, {
        method: 'PATCH',
        json: { name, topic: topic || undefined },
      });
      setChannels((prev) =>
        prev
          .map((c) =>
            c.id === channel.id
              ? { ...c, name: data.channel.name, topic: data.channel.topic, slug: data.channel.slug }
              : c,
          )
          .sort((a, b) => a.slug.localeCompare(b.slug)),
      );
      setEditingChannel(null);
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not update the channel.', 'error');
    }
  }

  async function removeChannel(channel: Channel) {
    if (!confirm(`Delete the channel "#${channel.name}"?`)) return;
    try {
      await apiFetch(`/api/channels/${channel.id}`, { method: 'DELETE' });
      setChannels((prev) => prev.filter((c) => c.id !== channel.id));
      push('Channel deleted.', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not delete the channel.', 'error');
    }
  }

  async function createCategory(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await apiFetch<{ category: Category }>('/api/categories', {
        method: 'POST',
        json: {
          name: categoryForm.name,
          description: categoryForm.description || undefined,
          color: categoryForm.color,
          sortOrder: Number(categoryForm.sortOrder) || 0,
        },
      });
      const created = data.category;
      setCategories((prev) => [
        ...prev,
        {
          id: created.id,
          slug: created.slug,
          name: created.name,
          description: created.description,
          color: created.color,
          sortOrder: created.sortOrder,
          postCount: 0,
        },
      ].sort((a, b) => a.sortOrder - b.sortOrder));
      setCategoryForm({ name: '', description: '', color: '#0e7490', sortOrder: '0' });
      push(`Category "${created.name}" created.`, 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not create the category.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function updateCategory(category: Category, patch: Partial<Category>) {
    try {
      await apiFetch(`/api/categories/${category.id}`, { method: 'PATCH', json: patch });
      setCategories((prev) =>
        prev.map((c) => (c.id === category.id ? { ...c, ...patch } : c)),
      );
      setEditingCategory(null);
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not update the category.', 'error');
    }
  }

  async function removeCategory(category: Category) {
    if (!confirm(`Delete the category "${category.name}"?`)) return;
    try {
      await apiFetch(`/api/categories/${category.id}`, { method: 'DELETE' });
      setCategories((prev) => prev.filter((c) => c.id !== category.id));
      push('Category deleted.', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not delete the category.', 'error');
    }
  }

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-text-primary">Chat channels</h2>
          <p className="text-xs text-text-tertiary">
            Add one per course so members have somewhere to ask questions. The slug is derived
            from the name.
          </p>
        </div>

        <form onSubmit={createChannel} className="card space-y-3 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="ch-name" className="label">
                Title
              </label>
              <input
                id="ch-name"
                required
                minLength={2}
                maxLength={40}
                placeholder="Cryptography"
                className="input"
                value={channelForm.name}
                onChange={(e) => setChannelForm({ ...channelForm, name: e.target.value })}
              />
              {channelForm.name && (
                <p className="mt-1 font-mono text-[0.65rem] text-text-tertiary">
                  #{previewSlug(channelForm.name)}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="ch-topic" className="label">
                Topic <span className="normal-case text-text-tertiary">(optional)</span>
              </label>
              <input
                id="ch-topic"
                maxLength={200}
                placeholder="Cipher attacks, key exchange, write-ups"
                className="input"
                value={channelForm.topic}
                onChange={(e) => setChannelForm({ ...channelForm, topic: e.target.value })}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="radio"
                name="ch-kind"
                checked={channelForm.kind === 'PUBLIC'}
                onChange={() => setChannelForm({ ...channelForm, kind: 'PUBLIC' })}
              />
              Public — anyone can read
            </label>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="radio"
                name="ch-kind"
                checked={channelForm.kind === 'PRIVATE'}
                onChange={() => setChannelForm({ ...channelForm, kind: 'PRIVATE' })}
              />
              Private — members only
            </label>

            <button type="submit" className="btn-primary ml-auto" disabled={busy}>
              {busy ? <Spinner /> : '+ Add channel'}
            </button>
          </div>
        </form>

        {channels.length === 0 ? (
          <EmptyState icon="▶" title="No channels yet" description="Add the first one above." />
        ) : (
          <ul className="space-y-2">
            {channels.map((channel) => (
              <li key={channel.id} className="card flex flex-wrap items-center gap-3 p-4">
                {editingChannel === channel.id ? (
                  <ChannelEditor
                    channel={channel}
                    onCancel={() => setEditingChannel(null)}
                    onSave={(name, topic) => renameChannel(channel, name, topic)}
                  />
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-medium text-text-primary">
                        #{channel.name}
                        <span className="font-mono text-[0.65rem] text-text-tertiary">
                          {channel.slug}
                        </span>
                        {channel.kind === 'PRIVATE' && (
                          <span className="rounded bg-black/5 px-1.5 py-0.5 text-[0.6rem] text-text-tertiary">
                            private
                          </span>
                        )}
                      </p>
                      {channel.topic && (
                        <p className="truncate text-xs text-text-tertiary">{channel.topic}</p>
                      )}
                    </div>
                    <span className="text-xs text-text-tertiary">
                      {channel.messageCount} msg · {channel.memberCount} members
                    </span>
                    <button
                      className="text-xs text-text-tertiary hover:text-accent-cyan"
                      onClick={() => setEditingChannel(channel.id)}
                    >
                      edit
                    </button>
                    <button
                      className="text-xs text-text-tertiary hover:text-accent-rose"
                      onClick={() => removeChannel(channel)}
                    >
                      delete
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-text-primary">Forum categories</h2>
          <p className="text-xs text-text-tertiary">
            Threads and write-ups are filed under these. A category holding posts cannot be
            deleted until they are moved.
          </p>
        </div>

        <form onSubmit={createCategory} className="card space-y-3 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="cat-name" className="label">
                Title
              </label>
              <input
                id="cat-name"
                required
                minLength={2}
                maxLength={60}
                placeholder="Network Security"
                className="input"
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
              />
              {categoryForm.name && (
                <p className="mt-1 font-mono text-[0.65rem] text-text-tertiary">
                  {previewSlug(categoryForm.name)}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="cat-desc" className="label">
                Description <span className="normal-case text-text-tertiary">(optional)</span>
              </label>
              <input
                id="cat-desc"
                maxLength={300}
                placeholder="Scanning, protocols and hardening"
                className="input"
                value={categoryForm.description}
                onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="cat-color" className="label">
                Colour
              </label>
              <input
                id="cat-color"
                type="color"
                className="h-9 w-16 cursor-pointer rounded border border-border bg-transparent"
                value={categoryForm.color}
                onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="cat-order" className="label">
                Order
              </label>
              <input
                id="cat-order"
                type="number"
                min={0}
                max={999}
                className="input w-24"
                value={categoryForm.sortOrder}
                onChange={(e) => setCategoryForm({ ...categoryForm, sortOrder: e.target.value })}
              />
            </div>

            <button type="submit" className="btn-primary ml-auto" disabled={busy}>
              {busy ? <Spinner /> : '+ Add category'}
            </button>
          </div>
        </form>

        {categories.length === 0 ? (
          <EmptyState icon="✦" title="No categories yet" description="Add the first one above." />
        ) : (
          <ul className="space-y-2">
            {categories.map((category) => (
              <li key={category.id} className="card flex flex-wrap items-center gap-3 p-4">
                {editingCategory === category.id ? (
                  <CategoryEditor
                    category={category}
                    onCancel={() => setEditingCategory(null)}
                    onSave={(patch) => updateCategory(category, patch)}
                  />
                ) : (
                  <>
                    <span
                      aria-hidden
                      className="h-8 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-text-primary">
                        {category.name}{' '}
                        <span className="font-mono text-[0.65rem] text-text-tertiary">
                          {category.slug}
                        </span>
                      </p>
                      {category.description && (
                        <p className="truncate text-xs text-text-tertiary">{category.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-text-tertiary">
                      {category.postCount} posts · order {category.sortOrder}
                    </span>
                    <button
                      className="text-xs text-text-tertiary hover:text-accent-cyan"
                      onClick={() => setEditingCategory(category.id)}
                    >
                      edit
                    </button>
                    <button
                      className="text-xs text-text-tertiary hover:text-accent-rose"
                      disabled={category.postCount > 0}
                      title={
                        category.postCount > 0
                          ? 'Move or delete its posts first'
                          : 'Delete this category'
                      }
                      onClick={() => removeCategory(category)}
                    >
                      delete
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ChannelEditor({
  channel,
  onSave,
  onCancel,
}: {
  channel: Channel;
  onSave: (name: string, topic: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic ?? '');

  return (
    <form
      className="flex w-full flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name, topic);
      }}
    >
      <div>
        <label className="label" htmlFor={`ch-edit-${channel.id}`}>
          Title
        </label>
        <input
          id={`ch-edit-${channel.id}`}
          required
          minLength={2}
          maxLength={40}
          className="input w-48"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="min-w-48 flex-1">
        <label className="label" htmlFor={`ch-topic-edit-${channel.id}`}>
          Topic
        </label>
        <input
          id={`ch-topic-edit-${channel.id}`}
          maxLength={200}
          className="input"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
      </div>
      <button type="submit" className="btn-primary">
        Save
      </button>
      <button type="button" className="btn-ghost" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

function CategoryEditor({
  category,
  onSave,
  onCancel,
}: {
  category: Category;
  onSave: (patch: Partial<Category>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description ?? '');
  const [color, setColor] = useState(category.color);
  const [sortOrder, setSortOrder] = useState(String(category.sortOrder));

  return (
    <form
      className="flex w-full flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name,
          description: description || undefined,
          color,
          sortOrder: Number(sortOrder) || 0,
        } as Partial<Category>);
      }}
    >
      <div>
        <label className="label" htmlFor={`cat-edit-${category.id}`}>
          Title
        </label>
        <input
          id={`cat-edit-${category.id}`}
          required
          minLength={2}
          maxLength={60}
          className="input w-48"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="min-w-48 flex-1">
        <label className="label" htmlFor={`cat-desc-edit-${category.id}`}>
          Description
        </label>
        <input
          id={`cat-desc-edit-${category.id}`}
          maxLength={300}
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div>
        <label className="label" htmlFor={`cat-color-edit-${category.id}`}>
          Colour
        </label>
        <input
          id={`cat-color-edit-${category.id}`}
          type="color"
          className="h-9 w-16 cursor-pointer rounded border border-border bg-transparent"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
      </div>
      <div>
        <label className="label" htmlFor={`cat-order-edit-${category.id}`}>
          Order
        </label>
        <input
          id={`cat-order-edit-${category.id}`}
          type="number"
          min={0}
          max={999}
          className="input w-24"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
      </div>
      <button type="submit" className="btn-primary">
        Save
      </button>
      <button type="button" className="btn-ghost" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}