'use client';

import { Fragment, useMemo, useState } from 'react';
import { Avatar, RoleBadge, EmptyState } from '@/components/ui';
import { cn } from '@/lib/utils';

interface Entry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  metadata: unknown;
  createdAt: string;
  actor: { id: string; name: string; role: string; avatarSeed: string } | null;
}

export function AuditClient({
  initialEntries,
  totalEntries,
}: {
  initialEntries: Entry[];
  totalEntries: number;
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const visible = useMemo(() => {
    if (!query) return initialEntries;
    const q = query.toLowerCase();
    return initialEntries.filter(
      (entry) =>
        entry.action.toLowerCase().includes(q) ||
        entry.actor?.name.toLowerCase().includes(q) ||
        entry.entityType?.toLowerCase().includes(q) ||
        entry.ip?.toLowerCase().includes(q),
    );
  }, [initialEntries, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input max-w-sm"
          placeholder="Filter by action, actor, entity or IP…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter audit entries"
        />
        <span className="text-xs text-text-tertiary">
          showing {visible.length} of {totalEntries} entries
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon="≡" title="No matching entries" description="Try a different filter term." />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[42rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[0.65rem] uppercase tracking-wide text-text-tertiary">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3 text-right">Detail</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => (
                <Fragment key={entry.id}>
                  <tr className="border-b border-border/60 last:border-0 hover:bg-white/[0.03]">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-text-tertiary">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">
                      {entry.actor ? (
                        <span className="flex items-center gap-1.5">
                          <Avatar name={entry.actor.name} seed={entry.actor.avatarSeed} size="xs" />
                          <span className="truncate text-text-secondary">{entry.actor.name}</span>
                          <RoleBadge role={entry.actor.role} />
                        </span>
                      ) : (
                        <span className="text-xs text-text-tertiary">system</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          'font-mono text-xs',
                          entry.action.includes('delete') || entry.action.includes('block')
                            ? 'text-accent-rose'
                            : entry.action.includes('password') || entry.action.includes('login')
                              ? 'text-accent-amber'
                              : 'text-accent-cyan',
                        )}
                      >
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-text-tertiary">
                      {entry.entityType ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-text-tertiary">
                      {entry.ip ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {entry.metadata && typeof entry.metadata === 'object' ? (
                        <button
                          onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                          className="text-xs text-text-tertiary hover:text-accent-cyan"
                        >
                          {expanded === entry.id ? 'hide' : 'show'}
                        </button>
                      ) : (
                        <span className="text-xs text-text-tertiary">—</span>
                      )}
                    </td>
                  </tr>

                  {expanded === entry.id && (
                    <tr className="border-b border-border/60 bg-bg-secondary/40">
                      <td colSpan={6} className="px-4 py-3">
                        <pre className="scrollbar-thin overflow-x-auto whitespace-pre-wrap break-all font-mono text-[0.7rem] text-text-secondary">
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-text-tertiary">
        Entries are append-only. Newest 100 records are loaded; use the API with pagination for a full
        export.
      </p>
    </div>
  );
}