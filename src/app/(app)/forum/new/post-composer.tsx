'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/ui';

interface Category {
  id: string;
  name: string;
  slug: string;
  color: string;
  description?: string | null;
}

export function PostComposer({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const { push } = useToast();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [tagsInput, setTagsInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const tags = tagsInput
        .split(/[,\s]+/)
        .map((t) => t.trim().toLowerCase().replace(/^#/, ''))
        .filter(Boolean)
        .slice(0, 10);

      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, categoryId, tags }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error?.message ?? 'Could not publish your post.');
        return;
      }

      push('Post published.', 'success');
      router.push(`/forum/${data.post.slug}`);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (categories.length === 0) {
    return (
      <div className="card">
        <p className="text-sm text-text-secondary">
          No forum categories exist yet. Ask a moderator to create one from the admin dashboard.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error && (
        <div role="alert" className="rounded-lg border border-accent-rose/40 bg-accent-rose/10 px-4 py-3 text-sm text-accent-rose">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="title" className="label">
          Title
        </label>
        <input
          id="title"
          required
          minLength={8}
          maxLength={160}
          className="input"
          placeholder="e.g. Understanding Kerberoasting from a packet capture"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <p className="mt-1 text-xs text-text-tertiary">
          {title.length}/160 — be specific so others can find it later.
        </p>
      </div>

      <div>
        <label htmlFor="category" className="label">
          Category
        </label>
        <select
          id="category"
          className="input"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="body" className="label">
          Body
        </label>
        <textarea
          id="body"
          required
          minLength={20}
          rows={16}
          className="input resize-y font-mono text-sm"
          placeholder={'Markdown supported. Fenced code blocks get syntax highlighting:\n\n```python\nfrom scapy.all import sniff\nsniff(filter="tcp port 88")\n```'}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <p className="mt-1 text-xs text-text-tertiary">
          Markdown + GFM tables. Code fences are highlighted automatically.
        </p>
      </div>

      <div>
        <label htmlFor="tags" className="label">
          Tags <span className="normal-case text-text-tertiary">(optional, up to 10)</span>
        </label>
        <input
          id="tags"
          className="input"
          placeholder="kerberos, active-directory, lateral-movement"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
        />
      </div>

      <div className="flex gap-3">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? <Spinner /> : 'Publish post'}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}