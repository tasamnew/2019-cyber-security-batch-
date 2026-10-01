'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/hooks/use-socket';
import { Avatar, RoleBadge, Spinner, Tag, EmptyState } from '@/components/ui';
import { Markdown } from '@/components/markdown';
import { formatBytes, timeAgo, cn } from '@/lib/utils';

interface FileAsset {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  downloadCount: number;
}

interface Resource {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  kind: 'LINK' | 'FILE';
  url: string | null;
  createdAt: string;
  uploadedBy: { id: string; name: string; role: string; avatarSeed: string };
  file: FileAsset | null;
}

export function ResourcesClient({
  initialResources,
  initialTags,
  maxUploadMb,
  currentUserId,
}: {
  initialResources: Resource[];
  initialTags: string[];
  maxUploadMb: number;
  currentUserId: string;
}) {
  const { push } = useToast();

  const [resources, setResources] = useState(initialResources);
  const [tags, setTags] = useState(initialTags);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'LINK' | 'FILE' | ''>('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Composer state
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [mode, setMode] = useState<'LINK' | 'FILE'>('LINK');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const search = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (kind) params.set('kind', kind);
      if (activeTag) params.set('tag', activeTag);

      const data = await apiFetch<{ resources: Resource[]; tags: string[] }>(
        `/api/resources?${params.toString()}`,
      );
      setResources(data.resources);
      setTags(data.tags);
    } catch (err) {
      push(err instanceof Error ? err.message : 'Search failed.', 'error');
    } finally {
      setLoading(false);
    }
  }, [query, kind, activeTag, push]);

  // Debounce search so each keystroke does not hit the API.
  useEffect(() => {
    const timer = setTimeout(search, 300);
    return () => clearTimeout(timer);
  }, [search]);

  async function upload() {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);

      const res = await fetch('/api/files/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Upload failed.');

      // Immediately publish as a resource so the file is discoverable.
      const created = await apiFetch<{ resource: Resource }>('/api/resources', {
        method: 'POST',
        json: {
          title: title || file.name,
          description: description || undefined,
          kind: 'FILE',
          fileId: data.file.id,
          tags: parseTags(tagsInput),
        },
      });

      setResources((prev) => [created.resource, ...prev]);
      resetComposer();
      push('Resource shared.', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Upload failed.', 'error');
    } finally {
      setUploading(false);
      setBusy(false);
    }
  }

  async function shareLink() {
    setBusy(true);
    try {
      const created = await apiFetch<{ resource: Resource }>('/api/resources', {
        method: 'POST',
        json: {
          title,
          description: description || undefined,
          kind: 'LINK',
          url,
          tags: parseTags(tagsInput),
        },
      });
      setResources((prev) => [created.resource, ...prev]);
      resetComposer();
      push('Link shared.', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not share the link.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function resetComposer() {
    setTitle('');
    setDescription('');
    setTagsInput('');
    setUrl('');
    setFile(null);
    setOpen(false);
  }

  async function remove(resource: Resource) {
    if (!confirm(`Delete "${resource.title}"?`)) return;
    try {
      await apiFetch(`/api/resources/${resource.id}`, { method: 'DELETE' });
      setResources((prev) => prev.filter((r) => r.id !== resource.id));
      push('Resource deleted.', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title, description or tag…"
          className="input flex-1"
          aria-label="Search resources"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          aria-label="Filter by type"
          className="input sm:w-40"
        >
          <option value="">All types</option>
          <option value="FILE">Files</option>
          <option value="LINK">Links</option>
        </select>
        <button onClick={() => setOpen((v) => !v)} className="btn-primary">
          {open ? 'Cancel' : '+ Share'}
        </button>
      </div>

      {tags.length > 0 && (
        <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveTag(null)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-xs transition',
              !activeTag
                ? 'border-accent-cyan bg-accent-cyan/10 text-accent-cyan'
                : 'border-border text-text-tertiary hover:text-text-primary',
            )}
          >
            all tags
          </button>
          {tags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 font-mono text-xs transition',
                activeTag === tag
                  ? 'border-accent-cyan bg-accent-cyan/10 text-accent-cyan'
                  : 'border-border text-text-tertiary hover:text-text-primary',
              )}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === 'FILE') void upload();
            else void shareLink();
          }}
          className="card space-y-4"
        >
          <div className="flex gap-2">
            <ModeTab active={mode === 'LINK'} onClick={() => setMode('LINK')} label="Link" />
            <ModeTab active={mode === 'FILE'} onClick={() => setMode('FILE')} label="File upload" />
          </div>

          <div>
            <label htmlFor="res-title" className="label">
              Title
            </label>
            <input
              id="res-title"
              required
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Nmap cheat sheet"
            />
          </div>

          {mode === 'LINK' ? (
            <div>
              <label htmlFor="res-url" className="label">
                URL
              </label>
              <input
                id="res-url"
                type="url"
                required
                className="input"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          ) : (
            <div>
              <label htmlFor="res-file" className="label">
                File
              </label>
              <input
                id="res-file"
                type="file"
                required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="input file:mr-3 file:rounded file:border-0 file:bg-accent-green file:px-3 file:py-1 file:text-slate-950"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.tar,.gz,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.gif"
              />
              <p className="mt-1 text-xs text-text-tertiary">
                PDF, Office docs, archives, text, CSV and images. Max {maxUploadMb} MB.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="res-desc" className="label">
              Description <span className="normal-case text-text-tertiary">(optional)</span>
            </label>
            <textarea
              id="res-desc"
              rows={3}
              maxLength={1000}
              className="input resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="res-tags" className="label">
              Tags
            </label>
            <input
              id="res-tags"
              className="input"
              placeholder="networking, nmap, recon"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={busy || uploading}>
            {uploading ? <Spinner /> : mode === 'FILE' ? 'Upload & share' : 'Share link'}
          </button>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="text-accent-green" />
        </div>
      ) : resources.length === 0 ? (
        <EmptyState
          icon="⬢"
          title="No resources yet"
          description="Share the first lab guide, cheat sheet or reference link."
          action={
            <button onClick={() => setOpen(true)} className="btn-primary">
              Share a resource
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resources.map((resource) => {
            const mine = resource.uploadedBy.id === currentUserId;
            return (
              <article key={resource.id} className="card flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <span className="badge">
                    {resource.kind === 'FILE' ? '⬢ file' : '↗ link'}
                  </span>
                  {mine && (
                    <button
                      onClick={() => remove(resource)}
                      className="text-xs text-text-tertiary hover:text-accent-rose"
                    >
                      delete
                    </button>
                  )}
                </div>

                <h3 className="mt-3 font-semibold text-text-primary">{resource.title}</h3>

                {resource.description && (
                  <Markdown content={resource.description} className="mt-1 text-sm" />
                )}

                {resource.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {resource.tags.map((tag) => (
                      <Tag key={tag} onClick={() => setActiveTag(tag)} active={activeTag === tag}>
                        {tag}
                      </Tag>
                    ))}
                  </div>
                )}

                <div className="mt-auto pt-4">
                  {resource.kind === 'LINK' && resource.url && (
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary w-full"
                    >
                      Open link ↗
                    </a>
                  )}

                  {resource.kind === 'FILE' && resource.file && (
                    <a
                      href={`/api/files/${resource.file.id}`}
                      className="btn-secondary w-full"
                      title={`${formatBytes(resource.file.sizeBytes)} · ${resource.file.mimeType}`}
                    >
                      ↓ Download ({formatBytes(resource.file.sizeBytes)})
                    </a>
                  )}

                  <p className="mt-3 flex items-center gap-1.5 text-xs text-text-tertiary">
                    <Avatar name={resource.uploadedBy.name} seed={resource.uploadedBy.avatarSeed} size="xs" />
                    <span className="truncate">{resource.uploadedBy.name}</span>
                    <RoleBadge role={resource.uploadedBy.role} />
                    <span className="ml-auto shrink-0">{timeAgo(resource.createdAt)}</span>
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg border px-4 py-2 text-sm transition',
        active
          ? 'border-accent-green bg-accent-green/10 text-accent-green'
          : 'border-border text-text-secondary hover:text-text-primary',
      )}
    >
      {label}
    </button>
  );
}

function parseTags(input: string): string[] {
  return input
    .split(/[,\s]+/)
    .map((t) => t.trim().toLowerCase().replace(/^#/, ''))
    .filter(Boolean)
    .slice(0, 10);
}