import Link from 'next/link';
import { db } from '@/lib/db';
import { requireAdminPage } from './require-admin';

export default async function AdminOverviewPage() {
  const user = await requireAdminPage();
  const isAdmin = user.role === 'ADMIN';

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [members, pending, openReports, newThisWeek, posts, comments, resources, files] =
    await Promise.all([
      db.user.count({ where: { status: 'APPROVED' } }),
      db.user.count({ where: { status: 'PENDING' } }),
      db.report.count({ where: { status: 'OPEN' } }),
      db.user.count({ where: { createdAt: { gte: weekAgo } } }),
      db.post.count({ where: { status: 'PUBLISHED' } }),
      db.comment.count({ where: { status: 'PUBLISHED' } }),
      db.resource.count(),
      db.fileAsset.count(),
    ]);

  const [recentUsers, recentReports, topPosters, auditTail] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, name: true, email: true, role: true, status: true, createdAt: true, avatarSeed: true },
    }),
    db.report.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        reason: true,
        targetType: true,
        targetId: true,
        details: true,
        createdAt: true,
        reporter: { select: { name: true } },
      },
    }),
    db.user.findMany({
      take: 6,
      select: {
        id: true,
        name: true,
        avatarSeed: true,
        role: true,
        _count: { select: { posts: true, comments: true } },
      },
      orderBy: { posts: { _count: 'desc' } },
    }),
    isAdmin
      ? db.auditLog.findMany({
          orderBy: { createdAt: 'desc' },
          take: 6,
          select: { id: true, action: true, entityType: true, createdAt: true, actor: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Approved members" value={members} href="/admin/users" />
        <Tile label="Awaiting approval" value={pending} tone={pending > 0 ? 'amber' : 'plain'} href="/admin/users" />
        <Tile label="Open reports" value={openReports} tone={openReports > 0 ? 'rose' : 'plain'} href="/admin/moderation" />
        <Tile label="New this week" value={newThisWeek} />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Published posts" value={posts} />
        <Tile label="Published replies" value={comments} />
        <Tile label="Resources" value={resources} />
        <Tile label="Stored files" value={files} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Newest accounts */}
        <section className="card p-5">
          <h2 className="mb-4 font-semibold text-text-primary">Newest accounts</h2>
          <ul className="space-y-2">
            {recentUsers.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-text-primary">{row.name}</span>
                  <span className="block truncate text-xs text-text-tertiary">{row.email}</span>
                </span>
                <span className="shrink-0 text-xs uppercase text-text-tertiary">
                  {row.status.toLowerCase()} · {row.role.toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
          <Link href="/admin/users" className="mt-4 inline-block text-xs text-accent-cyan hover:underline">
            Manage members →
          </Link>
        </section>

        {/* Open reports */}
        <section className="card p-5">
          <h2 className="mb-4 font-semibold text-text-primary">Open reports</h2>
          {recentReports.length === 0 ? (
            <p className="text-sm text-text-tertiary">Nothing reported. Nice and quiet.</p>
          ) : (
            <ul className="space-y-3">
              {recentReports.map((report) => (
                <li key={report.id} className="rounded-lg border border-border p-3">
                  <p className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold uppercase text-accent-amber">{report.reason.replace(/_/g, ' ')}</span>
                    <span className="text-text-tertiary">{report.targetType.toLowerCase()}</span>
                  </p>
                  {report.details && (
                    <p className="mt-1 line-clamp-2 text-xs text-text-secondary">{report.details}</p>
                  )}
                  <p className="mt-1 text-[0.65rem] text-text-tertiary">by {report.reporter.name}</p>
                </li>
              ))}
            </ul>
          )}
          <Link href="/admin/moderation" className="mt-4 inline-block text-xs text-accent-cyan hover:underline">
            Review reports →
          </Link>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top posters */}
        <section className="card p-5">
          <h2 className="mb-4 font-semibold text-text-primary">Most active members</h2>
          <ul className="space-y-2">
            {topPosters.map((row, index) => (
              <li key={row.id} className="flex items-center gap-3 text-sm">
                <span className="w-5 font-mono text-xs text-text-tertiary">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-text-primary">{row.name}</span>
                <span className="shrink-0 text-xs text-text-tertiary">
                  {row._count.posts} posts · {row._count.comments} replies
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Audit tail (admin only) */}
        <section className="card p-5">
          <h2 className="mb-4 font-semibold text-text-primary">Recent admin activity</h2>
          {!isAdmin ? (
            <p className="text-sm text-text-tertiary">Administrators only.</p>
          ) : auditTail.length === 0 ? (
            <p className="text-sm text-text-tertiary">No entries yet.</p>
          ) : (
            <ul className="space-y-2">
              {auditTail.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate font-mono text-text-secondary">{entry.action}</span>
                  <span className="shrink-0 text-text-tertiary">{entry.actor?.name ?? 'system'}</span>
                </li>
              ))}
            </ul>
          )}
          {isAdmin && (
            <Link href="/admin/audit" className="mt-4 inline-block text-xs text-accent-cyan hover:underline">
              Full audit log →
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  tone = 'plain',
  href,
}: {
  label: string;
  value: number;
  tone?: 'plain' | 'amber' | 'rose';
  href?: string;
}) {
  const color =
    tone === 'amber' ? 'text-accent-amber' : tone === 'rose' ? 'text-accent-rose' : 'text-accent-green';

  const body = (
    <div className="card p-5 transition hover:border-accent-cyan/40">
      <p className="text-[0.65rem] uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className={`mt-1 font-mono text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );

  return href ? <Link href={href}>{body}</Link> : body;
}