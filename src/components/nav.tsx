'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Avatar, RoleBadge } from '@/components/ui';
import { LogoLockup } from '@/components/logo';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Minimum role required to see this entry. */
  minRole?: 'STUDENT' | 'MODERATOR' | 'ADMIN';
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: '◈' },
  { href: '/forum', label: 'Forum', icon: '✦', minRole: 'STUDENT' },
  { href: '/chat', label: 'Chat', icon: '▶', minRole: 'STUDENT' },
  { href: '/resources', label: 'Resources', icon: '⬢', minRole: 'STUDENT' },
  { href: '/ctf', label: 'CTF Corner', icon: '⚑', minRole: 'STUDENT' },
  { href: '/assignments', label: 'Assignments', icon: '▦', minRole: 'STUDENT' },
  { href: '/admin', label: 'Admin', icon: '⚙', minRole: 'MODERATOR' },
];

const RANK: Record<string, number> = { GUEST: 0, STUDENT: 1, MODERATOR: 2, ADMIN: 3 };

export function Sidebar({ siteName }: { siteName: string }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setOpen(false), [pathname]);

  const rank = user ? RANK[user.role] : 0;
  const visible = NAV.filter((item) => !item.minRole || rank >= RANK[item.minRole]);

  return (
    <>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-border bg-bg-primary/95 px-3 py-2.5 backdrop-blur lg:hidden">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Toggle navigation"
          className="rounded-lg border border-border p-2 text-text-secondary"
        >
          <span aria-hidden>{open ? '✕' : '☰'}</span>
        </button>

        <Link href="/dashboard" className="font-mono font-bold">
          <LogoLockup siteName={siteName} />
        </Link>

        {user && <Avatar name={user.name} seed={user.avatarSeed} size="xs" />}
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/70"
            onClick={() => setOpen(false)}
          />
          <nav className="relative h-full w-64 border-r border-border bg-bg-secondary p-4">
            <p className="px-3 pb-3 font-mono text-lg font-bold">
              <LogoLockup siteName={siteName} />
            </p>
            <NavList items={visible} pathname={pathname} />
          </nav>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-bg-secondary/60 lg:flex">
        <div className="border-b border-border px-5 py-5">
          <Link href="/dashboard" className="font-mono text-lg font-bold">
            <LogoLockup siteName={siteName} />
          </Link>
          <p className="mt-0.5 font-mono text-[0.65rem] uppercase tracking-widest text-text-tertiary">
            2019 cohort
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 scrollbar-thin">
          <NavList items={visible} pathname={pathname} />
        </nav>

        {user && (
          <div className="border-t border-border p-3">
            <Link
              href="/profile"
              className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-black/5"
            >
              <Avatar name={user.name} seed={user.avatarSeed} size="sm" showRing />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text-primary">
                  {user.name}
                </span>
                <RoleBadge role={user.role} />
              </span>
            </Link>
          </div>
        )}
      </aside>
    </>
  );
}

function NavList({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition',
                active
                  ? 'bg-accent-green/10 font-medium text-accent-green'
                  : 'text-text-secondary hover:bg-black/5 hover:text-text-primary',
              )}
            >
              <span aria-hidden className="w-4 text-center text-xs">
                {item.icon}
              </span>
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}