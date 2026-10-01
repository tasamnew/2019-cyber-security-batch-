import { clsx, type ClassValue } from 'clsx';

/** Tailwind-aware className joiner. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** URL-safe slug with a short random suffix to avoid collisions. */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const suffix = Math.random().toString(36).slice(2, 7);
  return base ? `${base}-${suffix}` : `post-${suffix}`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "3h ago" style relative time. */
export function timeAgo(date: Date | string): string {
  const then = new Date(date).getTime();
  const seconds = Math.floor((Date.now() - then) / 1000);

  if (seconds < 60) return 'just now';
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'minute'],
    [3600, 'hour'],
    [86400, 'day'],
    [604800, 'week'],
    [2592000, 'month'],
    [31536000, 'year'],
  ];

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  let divisor = 1;
  let unit: Intl.RelativeTimeFormatUnit = 'second';
  for (const [threshold, u] of units) {
    if (seconds >= threshold) {
      divisor = threshold;
      unit = u;
    }
  }
  return rtf.format(-Math.floor(seconds / divisor), unit);
}

/** "in 3 days" / "2 days overdue" for assignment due dates. */
export function dueLabel(date: Date | string): { text: string; tone: 'ok' | 'soon' | 'late' } {
  const target = new Date(date).getTime();
  const diffMs = target - Date.now();
  const days = Math.ceil(diffMs / 86400000);

  if (diffMs < 0) {
    const overdue = Math.abs(days);
    return { text: `${overdue <= 1 ? 'Overdue' : `${overdue} days overdue`}`, tone: 'late' };
  }
  if (days <= 3) return { text: days <= 1 ? 'Due today' : `Due in ${days} days`, tone: 'soon' };
  return { text: `Due ${formatDate(date)}`, tone: 'ok' };
}

const AVATAR_COLORS = [
  '#3df5a3', '#3dd6ff', '#34d1b2', '#f5b301',
  '#a78bfa', '#f472b6', '#4ade80', '#fb923c',
];

export function avatarColor(seed: string | null | undefined): string {
  if (!seed) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Deterministic accent colour for category chips. */
export function categoryTone(color: string): string {
  return `border-[${color}]/40 bg-[${color}]/10 text-[${color}]`;
}

export const ROLE_RANK: Record<string, number> = {
  GUEST: 0,
  STUDENT: 1,
  MODERATOR: 2,
  ADMIN: 3,
};

export const STATUS_TONE: Record<string, string> = {
  PENDING: 'border-accent-amber/40 bg-accent-amber/10 text-accent-amber',
  APPROVED: 'border-accent-green/40 bg-accent-green/10 text-accent-green',
  BLOCKED: 'border-accent-rose/40 bg-accent-rose/10 text-accent-rose',
};