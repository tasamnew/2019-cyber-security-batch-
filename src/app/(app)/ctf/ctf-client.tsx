'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/hooks/use-socket';
import { Spinner, EmptyState } from '@/components/ui';
import { Markdown } from '@/components/markdown';
import { cn } from '@/lib/utils';

interface Challenge {
  id: string;
  title: string;
  description: string;
  url: string | null;
  category: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'INSANE';
  points: number;
  hints: string[];
  hintCount: number;
  writeUpUrl: string | null;
  createdAt: string;
  createdBy: { id: string; name: string; role: string; avatarSeed: string };
  canEdit: boolean;
}

const DIFFICULTY_TONE: Record<Challenge['difficulty'], string> = {
  EASY: 'border-accent-green/40 bg-accent-green/10 text-accent-green',
  MEDIUM: 'border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyan',
  HARD: 'border-accent-amber/40 bg-accent-amber/10 text-accent-amber',
  INSANE: 'border-accent-rose/40 bg-accent-rose/10 text-accent-rose',
};

const ORDER: Challenge['difficulty'][] = ['EASY', 'MEDIUM', 'HARD', 'INSANE'];

export function CtfClient({
  initialChallenges,
  categories,
  solvedIds,
  canCreate,
  currentUserId,
}: {
  initialChallenges: Challenge[];
  categories: string[];
  solvedIds: string[];
  canCreate: boolean;
  currentUserId: string;
}) {
  const { push } = useToast();

  const [challenges, setChallenges] = useState(initialChallenges);
  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState<'' | Challenge['difficulty']>('');
  const [category, setCategory] = useState('');
  const [solved, setSolved] = useState(() => new Set(solvedIds));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  // Expanded per-challenge state (hints are spoilers, so reveal on demand).
  const [revealed, setRevealed] = useState<Record<string, number>>({});

  // Composer state
  const [form, setForm] = useState({
    title: '',
    description: '',
    url: '',
    category: '',
    difficulty: 'MEDIUM' as Challenge['difficulty'],
    points: 100,
    hints: '',
    writeUpUrl: '',
  });

  const filter = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (difficulty) params.set('difficulty', difficulty);
      if (category) params.set('category', category);
      const data = await apiFetch<{ challenges: Challenge[] }>(`/api/ctf?${params.toString()}`);
      setChallenges(data.challenges);
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not load challenges.', 'error');
    } finally {
      setLoading(false);
    }
  }, [query, difficulty, category, push]);

  useEffect(() => {
    const timer = setTimeout(filter, 300);
    return () => clearTimeout(timer);
  }, [filter]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await apiFetch<{ challenge: Challenge }>('/api/ctf', {
        method: 'POST',
        json: {
          title: form.title,
          description: form.description,
          url: form.url || undefined,
          category: form.category,
          difficulty: form.difficulty,
          points: form.points,
          hints: form.hints.split('\n').map((h) => h.trim()).filter(Boolean),
          writeUpUrl: form.writeUpUrl || undefined,
        },
      });
      setChallenges((prev) => [data.challenge, ...prev]);
      setForm({ title: '', description: '', url: '', category: '', difficulty: 'MEDIUM', points: 100, hints: '', writeUpUrl: '' });
      setOpen(false);
      push('Challenge published.', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not publish the challenge.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function markSolved(challenge: Challenge) {
    const flag = prompt('Enter the flag to verify your solve:');
    if (!flag) return;
    try {
      const data = await apiFetch<{ solve: { points: number } }>(`/api/ctf/${challenge.id}/solve`, {
        method: 'POST',
        json: { flag: flag.trim() },
      });
      setSolved((prev) => new Set(prev).add(challenge.id));
      push(`Solved! +${data.solve.points} points.`, 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'That flag was not accepted.', 'error');
    }
  }

  async function remove(challenge: Challenge) {
    if (!confirm(`Delete "${challenge.title}"?`)) return;
    try {
      await apiFetch(`/api/ctf/${challenge.id}`, { method: 'DELETE' });
      setChallenges((prev) => prev.filter((c) => c.id !== challenge.id));
      push('Challenge deleted.', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          className="input flex-1"
          placeholder="Search challenges…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search challenges"
        />
        <select
          className="input sm:w-40"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
          aria-label="Filter by difficulty"
        >
          <option value="">All levels</option>
          {ORDER.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          className="input sm:w-40"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {canCreate && (
          <button className="btn-primary" onClick={() => setOpen((v) => !v)}>
            {open ? 'Cancel' : '+ Challenge'}
          </button>
        )}
      </div>

      {open && canCreate && (
        <form onSubmit={create} className="card space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ctf-title" className="label">
                Title
              </label>
              <input
                id="ctf-title"
                required
                minLength={3}
                className="input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="ctf-cat" className="label">
                Category
              </label>
              <input
                id="ctf-cat"
                required
                className="input"
                list="ctf-categories"
                placeholder="web, crypto, pwn, forensics"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
              <datalist id="ctf-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label htmlFor="ctf-diff" className="label">
                Difficulty
              </label>
              <select
                id="ctf-diff"
                className="input"
                value={form.difficulty}
                onChange={(e) => setForm({ ...form, difficulty: e.target.value as Challenge['difficulty'] })}
              >
                {ORDER.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ctf-points" className="label">
                Points
              </label>
              <input
                id="ctf-points"
                type="number"
                min={0}
                className="input"
                value={form.points}
                onChange={(e) => setForm({ ...form, points: Number(e.target.value) })}
              />
            </div>
          </div>

          <div>
            <label htmlFor="ctf-desc" className="label">
              Description (Markdown)
            </label>
            <textarea
              id="ctf-desc"
              required
              rows={4}
              className="input resize-y font-mono text-xs"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ctf-url" className="label">
                Challenge URL <span className="normal-case text-text-tertiary">(optional)</span>
              </label>
              <input
                id="ctf-url"
                type="url"
                className="input"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="ctf-writeup" className="label">
                Write-up URL <span className="normal-case text-text-tertiary">(spoiler)</span>
              </label>
              <input
                id="ctf-writeup"
                type="url"
                className="input"
                value={form.writeUpUrl}
                onChange={(e) => setForm({ ...form, writeUpUrl: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label htmlFor="ctf-hints" className="label">
              Hints <span className="normal-case text-text-tertiary">(one per line, spoiler)</span>
            </label>
            <textarea
              id="ctf-hints"
              rows={3}
              className="input resize-y text-xs"
              value={form.hints}
              onChange={(e) => setForm({ ...form, hints: e.target.value })}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? <Spinner /> : 'Publish challenge'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="text-accent-green" />
        </div>
      ) : challenges.length === 0 ? (
        <EmptyState icon="⚑" title="No challenges found" description="Adjust the filters or publish one." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {challenges.map((challenge) => {
            const isSolved = solved.has(challenge.id);
            const visibleHints = revealed[challenge.id] ?? 0;
            const mine = challenge.createdBy.id === currentUserId;

            return (
              <article
                key={challenge.id}
                className={cn(
                  'card flex flex-col p-5 transition',
                  isSolved && 'border-accent-green/40 bg-accent-green/[0.04]',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase',
                      DIFFICULTY_TONE[challenge.difficulty],
                    )}
                  >
                    {challenge.difficulty}
                  </span>
                  <div className="flex items-center gap-2">
                    {challenge.points > 0 && (
                      <span className="font-mono text-xs text-text-tertiary">{challenge.points} pts</span>
                    )}
                    {isSolved && <span className="text-xs text-accent-green">✓ solved</span>}
                    {challenge.canEdit && (
                      <button
                        onClick={() => remove(challenge)}
                        className="text-xs text-text-tertiary hover:text-accent-rose"
                      >
                        del
                      </button>
                    )}
                  </div>
                </div>

                <h3 className="mt-3 font-semibold text-text-primary">
                  {challenge.title}
                  {mine && <span className="ml-2 text-[0.65rem] font-normal text-text-tertiary">(yours)</span>}
                </h3>
                <p className="mt-0.5 font-mono text-[0.7rem] uppercase text-text-tertiary">
                  {challenge.category}
                </p>

                <Markdown content={challenge.description} className="mt-2 flex-1 text-sm" />

                {challenge.hintCount > 0 && (
                  <div className="mt-3 rounded-lg border border-accent-amber/30 bg-accent-amber/5 p-3">
                    <p className="text-xs font-semibold text-accent-amber">
                      Hints ({visibleHints}/{challenge.hintCount})
                    </p>
                    {challenge.hints.slice(0, visibleHints).map((hint, i) => (
                      <p key={i} className="mt-1 text-xs text-text-secondary">
                        {i + 1}. {hint}
                      </p>
                    ))}
                    {visibleHints < challenge.hintCount && (
                      <button
                        onClick={() =>
                          setRevealed((prev) => ({ ...prev, [challenge.id]: visibleHints + 1 }))
                        }
                        className="mt-2 text-xs text-accent-cyan hover:underline"
                      >
                        Reveal next hint
                      </button>
                    )}
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  {challenge.url && (
                    <a
                      href={challenge.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary flex-1"
                    >
                      Launch ↗
                    </a>
                  )}
                  {challenge.writeUpUrl && (
                    <a
                      href={challenge.writeUpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary flex-1"
                    >
                      Write-up
                    </a>
                  )}
                  {!isSolved && (
                    <button onClick={() => markSolved(challenge)} className="btn-primary flex-1">
                      Submit flag
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}