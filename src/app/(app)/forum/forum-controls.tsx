'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

export function NewPostButton() {
  return (
    <Link href="/forum/new" className="btn-primary">
      <span aria-hidden>+</span> New post
    </Link>
  );
}

interface Category {
  slug: string;
  name: string;
  color: string;
  postCount: number;
}

const SORTS = [
  { value: 'new', label: 'Newest' },
  { value: 'top', label: 'Top' },
  { value: 'active', label: 'Active' },
  { value: 'unanswered', label: 'Unanswered' },
];

/** Category chips + sort selector + search box, all URL-driven so filters are shareable. */
export function ForumFilters({
  categories,
  activeCategory,
  sort,
  query,
}: {
  categories: Category[];
  activeCategory?: string;
  sort: string;
  query: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigate(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`/forum?${params.toString()}`);
  }

  return (
    <div className="space-y-3">
      <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
        <FilterChip active={!activeCategory} onClick={() => navigate({ category: undefined })}>
          All
        </FilterChip>
        {categories.map((c) => (
          <FilterChip
            key={c.slug}
            active={activeCategory === c.slug}
            color={c.color}
            onClick={() => navigate({ category: c.slug })}
          >
            {c.name}
            <span className="ml-1.5 text-[0.65rem] opacity-70">{c.postCount}</span>
          </FilterChip>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const value = new FormData(e.currentTarget).get('q');
            navigate({ q: typeof value === 'string' && value ? value : undefined });
          }}
          className="flex flex-1 gap-2"
        >
          <input
            name="q"
            defaultValue={query}
            placeholder="Search discussions…"
            className="input"
            aria-label="Search discussions"
          />
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </form>

        <select
          value={sort}
          onChange={(e) => navigate({ sort: e.target.value })}
          aria-label="Sort discussions"
          className="input sm:w-48"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function FilterChip({
  children,
  active,
  color,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 rounded-full border px-3 py-1.5 text-sm transition',
        active
          ? 'border-accent-green bg-accent-green/10 text-accent-green'
          : 'border-border bg-white/5 text-text-secondary hover:border-accent-green/40 hover:text-text-primary',
      )}
      style={active && color ? { borderColor: color, color } : undefined}
    >
      {children}
    </button>
  );
}