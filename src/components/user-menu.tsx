'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { Avatar, RoleBadge } from '@/components/ui';
import { cn } from '@/lib/utils';

export function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;

    function onClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg p-1 transition hover:bg-white/5"
      >
        <Avatar name={user.name} seed={user.avatarSeed} size="sm" showRing />
        <span className="hidden text-sm text-text-primary xl:block">{user.name}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-medium text-text-primary">{user.name}</p>
            <p className="truncate text-xs text-text-tertiary">{user.email}</p>
            <div className="mt-2">
              <RoleBadge role={user.role} />
            </div>
          </div>

          <nav className="p-1">
            <MenuLink href="/profile" onClick={() => setOpen(false)}>
              Profile &amp; password
            </MenuLink>
            {(user.role === 'ADMIN' || user.role === 'MODERATOR') && (
              <MenuLink href="/admin" onClick={() => setOpen(false)}>
                Admin dashboard
              </MenuLink>
            )}
            <button
              role="menuitem"
              onClick={logout}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-4 py-2 text-left text-sm',
                'text-accent-rose transition hover:bg-accent-rose/10',
              )}
            >
              Sign out
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className="block rounded-lg px-4 py-2 text-sm text-text-secondary transition hover:bg-white/5 hover:text-text-primary"
    >
      {children}
    </Link>
  );
}