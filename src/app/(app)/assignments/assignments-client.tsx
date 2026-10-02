'use client';

import { useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/hooks/use-socket';
import { Avatar, Spinner, EmptyState } from '@/components/ui';
import { cn } from '@/lib/utils';

type Status = 'TODO' | 'IN_PROGRESS' | 'SUBMITTED' | 'DONE';
type Type = 'ASSIGNMENT' | 'LAB' | 'PROJECT' | 'EXAM' | 'DEADLINE';

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  courseCode: string | null;
  type: Type;
  status: Status;
  dueAt: string | null;
  ownerId: string | null;
  owner: { id: string; name: string; avatarSeed: string } | null;
  createdBy: { id: string; name: string };
  canEdit: boolean;
  canDelete: boolean;
}

const COLUMN_META: Record<Status, { label: string; accent: string; dot: string }> = {
  TODO: { label: 'To do', accent: 'text-text-tertiary', dot: 'bg-slate-500' },
  IN_PROGRESS: { label: 'In progress', accent: 'text-accent-cyan', dot: 'bg-accent-cyan' },
  SUBMITTED: { label: 'Submitted', accent: 'text-accent-amber', dot: 'bg-accent-amber' },
  DONE: { label: 'Done', accent: 'text-accent-green', dot: 'bg-accent-green' },
};

const TYPE_LABEL: Record<Type, string> = {
  ASSIGNMENT: 'assignment',
  LAB: 'lab',
  PROJECT: 'project',
  EXAM: 'exam',
  DEADLINE: 'deadline',
};

export function AssignmentsClient({
  initialAssignments,
  columns,
  members,
  canCreate,
  currentUserId,
}: {
  initialAssignments: Assignment[];
  columns: readonly Status[];
  members: { id: string; name: string }[];
  canCreate: boolean;
  currentUserId: string;
}) {
  const { push } = useToast();

  const [items, setItems] = useState(initialAssignments);
  const [mineOnly, setMineOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    courseCode: '',
    type: 'ASSIGNMENT' as Type,
    dueAt: '',
    ownerId: '',
  });

  const visible = useMemo(
    () => (mineOnly ? items.filter((a) => a.ownerId === currentUserId) : items),
    [items, mineOnly, currentUserId],
  );

  const grouped = useMemo(() => {
    const map = {} as Record<Status, Assignment[]>;
    for (const column of columns) map[column] = [];
    for (const item of visible) map[item.status]?.push(item);
    return map;
  }, [visible, columns]);

  async function patch(id: string, json: Record<string, unknown>, successMessage: string) {
    try {
      const data = await apiFetch<{ assignment: Assignment }>(`/api/assignments/${id}`, {
        method: 'PATCH',
        json,
      });
      setItems((prev) => prev.map((a) => (a.id === id ? data.assignment : a)));
      push(successMessage, 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Update failed.', 'error');
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await apiFetch<{ assignment: Assignment }>('/api/assignments', {
        method: 'POST',
        json: {
          title: form.title,
          description: form.description || undefined,
          courseCode: form.courseCode || undefined,
          type: form.type,
          // Send ISO when a deadline was chosen, omit entirely when blank.
          dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
          ownerId: form.ownerId || null,
        },
      });
      setItems((prev) => [data.assignment, ...prev]);
      setForm({ title: '', description: '', courseCode: '', type: 'ASSIGNMENT', dueAt: '', ownerId: '' });
      setCreating(false);
      push('Assignment added to the board.', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not add the assignment.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(assignment: Assignment) {
    if (!confirm(`Delete "${assignment.title}"?`)) return;
    try {
      await apiFetch(`/api/assignments/${assignment.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((a) => a.id !== assignment.id));
      push('Assignment deleted.', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  }

  function claim(assignment: Assignment) {
    void patch(
      assignment.id,
      { ownerId: currentUserId, status: assignment.status === 'TODO' ? 'IN_PROGRESS' : assignment.status },
      'You own this card now.',
    );
  }

  function move(assignment: Assignment, status: Status) {
    if (assignment.status === status) return;
    void patch(assignment.id, { status }, `Moved to ${COLUMN_META[status].label.toLowerCase()}.`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(e) => setMineOnly(e.target.checked)}
            className="accent-[var(--accent-green)]"
          />
          Only my assignments
        </label>
        <span className="text-xs text-text-tertiary">{visible.length} item(s)</span>
        {canCreate && (
          <button className="btn-primary ml-auto" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Cancel' : '+ Add'}
          </button>
        )}
      </div>

      {creating && canCreate && (
        <form onSubmit={create} className="card grid gap-4 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="as-title" className="label">
              Title
            </label>
            <input
              id="as-title"
              required
              minLength={3}
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="as-code" className="label">
              Course code
            </label>
            <input
              id="as-code"
              className="input"
              placeholder="CS-401"
              value={form.courseCode}
              onChange={(e) => setForm({ ...form, courseCode: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="as-type" className="label">
              Type
            </label>
            <select
              id="as-type"
              className="input"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as Type })}
            >
              {Object.entries(TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="as-due" className="label">
              Due date
            </label>
            <input
              id="as-due"
              type="datetime-local"
              className="input"
              value={form.dueAt}
              onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="as-owner" className="label">
              Assignee
            </label>
            <select
              id="as-owner"
              className="input"
              value={form.ownerId}
              onChange={(e) => setForm({ ...form, ownerId: e.target.value })}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="as-desc" className="label">
              Notes
            </label>
            <textarea
              id="as-desc"
              rows={2}
              maxLength={2000}
              className="input resize-y"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? <Spinner /> : 'Add to board'}
            </button>
          </div>
        </form>
      )}

      <div className="scrollbar-thin flex gap-4 overflow-x-auto pb-2">
        {columns.map((status) => {
          const meta = COLUMN_META[status];
          const column = grouped[status] ?? [];

          return (
            <section
              key={status}
              className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-bg-secondary/40 p-3"
            >
              <header className="mb-3 flex items-center gap-2">
                <span className={cn('h-2 w-2 rounded-full', meta.dot)} />
                <h2 className={cn('text-sm font-semibold', meta.accent)}>{meta.label}</h2>
                <span className="ml-auto rounded-full bg-black/5 px-2 py-0.5 text-[0.65rem] text-text-tertiary">
                  {column.length}
                </span>
              </header>

              <div className="flex-1 space-y-2">
                {column.length === 0 ? (
                  <p className="py-6 text-center text-xs text-text-tertiary">Nothing here yet.</p>
                ) : (
                  column.map((assignment) => {
                    const overdue =
                      assignment.dueAt !== null &&
                      assignment.status !== 'DONE' &&
                      new Date(assignment.dueAt) < new Date();
                    const canMove = assignment.canEdit;

                    return (
                      <article key={assignment.id} className="card p-3">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-mono text-[0.65rem] uppercase text-text-tertiary">
                            {TYPE_LABEL[assignment.type]}
                          </span>
                          {assignment.canDelete && (
                            <button
                              onClick={() => remove(assignment)}
                              className="text-[0.65rem] text-text-tertiary hover:text-accent-rose"
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        <h3 className="mt-1 text-sm font-medium text-text-primary">{assignment.title}</h3>

                        {assignment.description && (
                          <p className="mt-1 line-clamp-3 text-xs text-text-tertiary">
                            {assignment.description}
                          </p>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.65rem]">
                          {assignment.courseCode && (
                            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-text-tertiary">
                              {assignment.courseCode}
                            </span>
                          )}
                          {assignment.dueAt && (
                            <span className={cn(overdue && 'font-semibold text-accent-rose')}>
                              due {new Date(assignment.dueAt).toLocaleDateString()}
                              {overdue ? ' · overdue' : ''}
                            </span>
                          )}
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          {assignment.owner ? (
                            <span className="flex items-center gap-1.5 text-[0.7rem] text-text-secondary">
                              <Avatar name={assignment.owner.name} seed={assignment.owner.avatarSeed} size="xs" />
                              <span className="truncate">{assignment.owner.name}</span>
                            </span>
                          ) : (
                            <span className="text-[0.7rem] text-text-tertiary">Unassigned</span>
                          )}

                          {!assignment.ownerId && (
                            <button onClick={() => claim(assignment)} className="text-[0.7rem] text-accent-cyan hover:underline">
                              claim
                            </button>
                          )}
                        </div>

                        {canMove && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {columns
                              .filter((c) => c !== status)
                              .map((target) => (
                                <button
                                  key={target}
                                  onClick={() => move(assignment, target)}
                                  className="rounded border border-border px-1.5 py-0.5 text-[0.6rem] text-text-tertiary hover:border-accent-green/50 hover:text-accent-green"
                                >
                                  → {COLUMN_META[target].label}
                                </button>
                              ))}
                          </div>
                        )}
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>

      {visible.length === 0 && !creating && (
        <EmptyState
          icon="◫"
          title={mineOnly ? 'Nothing assigned to you' : 'The board is empty'}
          description={mineOnly ? 'Claim an unassigned card to get started.' : 'Add the first item to track progress.'}
        />
      )}
    </div>
  );
}