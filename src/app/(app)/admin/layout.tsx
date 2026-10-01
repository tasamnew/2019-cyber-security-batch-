import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Admin' };
export const dynamic = 'force-dynamic';

const LINKS = [
  { href: '/admin', label: 'Overview', icon: '◈', badge: 0 },
  { href: '/admin/users', label: 'Members', icon: '◉', badge: 'pending' },
  { href: '/admin/moderation', label: 'Moderation', icon: '⚑', badge: 'reports' },
  { href: '/admin/announcements', label: 'Announcements', icon: '✦', badge: 0 },
  { href: '/admin/settings', label: 'Settings', icon: '⚙', badge: 0 },
  { href: '/admin/audit', label: 'Audit log', icon: '≡', badge: 0 },
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'MODERATOR') redirect('/dashboard');

  // Counts are cheap and shared by every admin tab.
  const [pending, openReports] = await Promise.all([
    db.user.count({ where: { status: 'PENDING' } }),
    db.report.count({ where: { status: 'OPEN' } }),
  ]);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-text-primary">Administration</h1>

      <nav className="scrollbar-thin mb-6 flex gap-2 overflow-x-auto pb-1">
        {LINKS.map((link) => {
          const count =
            link.badge === 'pending' ? pending : link.badge === 'reports' ? openReports : 0;

          return (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-text-secondary transition hover:border-accent-cyan/50 hover:text-accent-cyan"
            >
              <span aria-hidden className="text-xs">
                {link.icon}
              </span>
              {link.label}
              {count > 0 && (
                <span className="rounded-full bg-accent-amber px-1.5 text-[0.6rem] font-bold text-slate-950">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}