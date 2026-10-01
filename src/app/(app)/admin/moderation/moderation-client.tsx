'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/hooks/use-socket';
import { Avatar, Spinner, EmptyState } from '@/components/ui';
import { cn, timeAgo } from '@/lib/utils';

type Status = 'OPEN' | 'RESOLVED' | 'DISMISSED';

interface Report {
  id: string;
  reason: string;
  details: string | null;
  targetType: string;
  createdAt: string;
  reporter: { id: string; name: string; avatarSeed: string };
  target: {
    exists: boolean;
    title: string;
    snippet: string;
    author?: { id: string; name: string } | null;
    href?: string;
    status?: string;
  };
}

/** Actions a moderator can apply while closing a report. */
const ACTIONS: Record<string, string[]> = {
  POST: ['hide_post'],
  COMMENT: ['hide_comment'],
  RESOURCE: ['remove_resource'],
  FILE: ['remove_file'],
  MESSAGE: [],
  USER: ['block_user'],
};

const ACTION_LABEL: Record<string, string> = {
  hide_post: 'Hide post + replies',
  hide_comment: 'Hide comment',
  remove_resource: 'Delete resource',
  remove_file: 'Delete file',
  block_user: 'Block account',
};

export function ModerationClient({
  initialReports,
  counts,
  isAdmin,
}: {
  initialReports: Report[];
  counts: Record<string, number>;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const { push } = useToast();

  const [reports, setReports] = useState(initialReports);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resolution, setResolution] = useState<Record<string, string>>({});
  const [action, setAction] = useState<Record<string, string>>({});

  async function resolve(report: Report, status: 'RESOLVED' | 'DISMISSED') {
    setBusyId(report.id);
    try {
      await apiFetch(`/api/admin/reports/${report.id}`, {
        method: 'PATCH',
        json: {
          status,
          resolution: resolution[report.id] || undefined,
          action: action[report.id] || undefined,
        },
      });

      setReports((prev) => prev.filter((r) => r.id !== report.id));
      push(status === 'RESOLVED' ? 'Report resolved.' : 'Report dismissed.', 'success');
      router.refresh();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not close the report.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  if (reports.length === 0) {
    return (
      <div className="space-y-4">
        <Summary counts={counts} />
        <EmptyState icon="✓" title="Queue is clear" description="No open reports right now." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Summary counts={counts} />

      {reports.map((report) => {
        const available = (ACTIONS[report.targetType] ?? []).filter(
          (a) => a !== 'block_user' || isAdmin,
        );
        const busy = busyId === report.id;

        return (
          <section key={report.id} className="card p-5">
            <header className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-accent-amber/40 bg-accent-amber/10 px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase text-accent-amber">
                {report.reason.replace(/_/g, ' ')}
              </span>
              <span className="text-xs uppercase text-text-tertiary">
                {report.targetType.toLowerCase()}
              </span>
              <span className="ml-auto flex items-center gap-1.5 text-xs text-text-tertiary">
                <Avatar name={report.reporter.name} seed={report.reporter.avatarSeed} size="xs" />
                {report.reporter.name} · {timeAgo(report.createdAt)}
              </span>
            </header>

            {report.details && (
              <p className="mt-3 rounded-lg border border-border bg-bg-secondary/50 p-3 text-sm text-text-secondary">
                {report.details}
              </p>
            )}

            <div className="mt-3 rounded-lg border border-border p-3">
              <p className="text-xs uppercase tracking-wide text-text-tertiary">Reported content</p>
              {report.target.exists ? (
                <>
                  <p className="mt-1 font-medium text-text-primary">
                    {report.target.href ? (
                      <Link href={report.target.href} className="hover:text-accent-cyan">
                        {report.target.title} ↗
                      </Link>
                    ) : (
                      report.target.title
                    )}
                  </p>
                  {report.target.snippet && (
                    <p className="mt-1 text-xs text-text-secondary">{report.target.snippet}</p>
                  )}
                  <p className="mt-1 text-[0.65rem] text-text-tertiary">
                    by {report.target.author?.name ?? 'unknown'}
                    {report.target.status ? ` · ${report.target.status.toLowerCase()}` : ''}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-text-tertiary">{report.target.title}</p>
              )}
            </div>

            {available.length > 0 && (
              <div className="mt-3">
                <label htmlFor={`action-${report.id}`} className="label">
                  Apply action <span className="normal-case text-text-tertiary">(optional)</span>
                </label>
                <select
                  id={`action-${report.id}`}
                  className="input"
                  disabled={busy}
                  value={action[report.id] ?? ''}
                  onChange={(e) => setAction((prev) => ({ ...prev, [report.id]: e.target.value }))}
                >
                  <option value="">No action, just close the report</option>
                  {available.map((a) => (
                    <option key={a} value={a}>
                      {ACTION_LABEL[a]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="mt-3">
              <label htmlFor={`res-${report.id}`} className="label">
                Moderator note <span className="normal-case text-text-tertiary">(optional)</span>
              </label>
              <input
                id={`res-${report.id}`}
                className="input"
                maxLength={500}
                disabled={busy}
                placeholder="What action was taken?"
                value={resolution[report.id] ?? ''}
                onChange={(e) => setResolution((prev) => ({ ...prev, [report.id]: e.target.value }))}
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => resolve(report, 'RESOLVED')}
                disabled={busy}
                className="btn-primary"
              >
                {busy ? <Spinner /> : 'Resolve'}
              </button>
              <button
                onClick={() => resolve(report, 'DISMISSED')}
                disabled={busy}
                className="btn-secondary"
              >
                Dismiss
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Summary({ counts }: { counts: Record<string, number> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {(['OPEN', 'RESOLVED', 'DISMISSED'] as Status[]).map((status) => (
        <div key={status} className="card p-4">
          <p className="text-[0.65rem] uppercase tracking-wide text-text-tertiary">{status.toLowerCase()}</p>
          <p
            className={cn(
              'mt-1 font-mono text-2xl font-bold',
              status === 'OPEN'
                ? 'text-accent-amber'
                : status === 'RESOLVED'
                  ? 'text-accent-green'
                  : 'text-text-tertiary',
            )}
          >
            {counts[status] ?? 0}
          </p>
        </div>
      ))}
    </div>
  );
}