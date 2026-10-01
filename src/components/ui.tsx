'use client';

import { cn, avatarColor, initials } from '@/lib/utils';

type Size = 'xs' | 'sm' | 'md' | 'lg';

const SIZES: Record<Size, string> = {
  xs: 'h-6 w-6 text-[0.6rem]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-lg',
};

export function Avatar({
  name,
  seed,
  size = 'sm',
  showRing = false,
}: {
  name: string;
  seed?: string | null;
  size?: Size;
  showRing?: boolean;
}) {
  const color = avatarColor(seed ?? name);

  return (
    <span
      aria-hidden
      title={name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold text-slate-950',
        SIZES[size],
        showRing && 'ring-2 ring-accent-green/50',
      )}
      style={{ backgroundColor: color }}
    >
      {initials(name)}
    </span>
  );
}

const ROLE_TONE: Record<string, string> = {
  ADMIN: 'border-accent-rose/40 bg-accent-rose/10 text-accent-rose',
  MODERATOR: 'border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyan',
  STUDENT: 'border-accent-green/40 bg-accent-green/10 text-accent-green',
  GUEST: 'border-slate-500/40 bg-slate-500/10 text-slate-400',
};

export function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide',
        ROLE_TONE[role] ?? ROLE_TONE.GUEST,
      )}
    >
      {role.toLowerCase()}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
    />
  );
}

export function EmptyState({
  icon = '⌘',
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-14 text-center">
      <div className="mb-3 text-3xl text-accent-green/70">{icon}</div>
      <p className="font-medium text-text-primary">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-text-tertiary">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Tag({ children, onClick, active }: { children: React.ReactNode; onClick?: () => void; active?: boolean }) {
  const Cmp = onClick ? 'button' : 'span';
  return (
    <Cmp
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-0.5 font-mono text-xs transition',
        active
          ? 'border-accent-cyan bg-accent-cyan/15 text-accent-cyan'
          : 'border-border bg-white/5 text-text-tertiary',
        onClick && 'hover:border-accent-cyan/60 hover:text-accent-cyan',
      )}
    >
      #{children}
    </Cmp>
  );
}