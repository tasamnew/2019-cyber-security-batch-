import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { Avatar, RoleBadge, EmptyState } from '@/components/ui';
import { Markdown } from '@/components/markdown';
import { timeAgo, formatBytes, dueLabel, cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

/**
 * Member home: pinned announcements, what's happening now, and what is due soon.
 * Everything is read-only server-side — mutations happen on the feature pages.
 */
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 86400000);

  const [
    announcements,
    pinnedPosts,
    recentPosts,
    upcomingAssignments,
    myAssignments,
    openReports,
    unreadAnnouncements,
    stats,
  ] = await Promise.all([
    db.announcement.findMany({
      where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: 3,
      include: { author: { select: { id: true, name: true, role: true } } },
    }),
    db.post.findMany({
      where: { status: 'PUBLISHED', isPinned: true },
      orderBy: { updatedAt: 'desc' },
      take: 3,
      include: {
        author: { select: { id: true, name: true, avatarSeed: true } },
        category: { select: { name: true, slug: true, color: true } },
        _count: { select: { comments: { where: { status: 'PUBLISHED' } } } },
      },
    }),
    db.post.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
      take: 6,
      include: {
        author: { select: { id: true, name: true, avatarSeed: true } },
        category: { select: { name: true, slug: true, color: true } },
        _count: { select: { comments: { where: { status: 'PUBLISHED' } } } },
      },
    }),
    db.assignment.findMany({
      where: { dueAt: { gte: now, lte: weekAhead } },
      orderBy: { dueAt: 'asc' },
      take: 5,
      include: { owner: { select: { id: true, name: true, avatarSeed: true } } },
    }),
    db.assignment.findMany({
      where: { ownerId: user.id, status: { not: 'DONE' } },
      orderBy: { dueAt: { sort: 'asc', nulls: 'last' } },
      take: 5,
      include: { owner: { select: { id: true, name: true } } },
    }),
    // Only surface the count for admins/moderators; students do not see the queue.
    user.role === 'ADMIN' || user.role === 'MODERATOR'
      ? db.report.count({ where: { status: 'OPEN' } })
      : Promise.resolve(0),
    db.announcement.count({
      where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    }),
    db.$transaction([
      db.post.count({ where: { status: 'PUBLISHED' } }),
      db.resource.count(),
      db.ctfChallenge.count(),
      db.user.count({ where: { status: 'APPROVED' } }),
    ]),
  ]);

  return (
    <div className="w-full max-w-none space-y-6 sm:max-w-6xl sm:mx-auto sm:space-y-8">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-bold text-text-primary">
          Welcome back, {user.name.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-text-tertiary">
          {stats[3]} approved member{stats[3] === 1 ? '' : 's'} · {stats[0]} discussion
          {stats[0] === 1 ? '' : 's'} · {stats[1]} resource{stats[1] === 1 ? '' : 's'} · {stats[2]}{' '}
          CTF challenge{stats[2] === 1 ? '' : 's'}
        </p>
      </header>

      {/* Announcements — pinned to the top of every member's dashboard */}
      {announcements.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-text-secondary">
            <span className="text-accent-amber">◈</span> Announcements
          </h2>
          {announcements.map((a) => (
            <article
              key={a.id}
              className={cn(
                'card border-accent-amber/30',
                a.pinned && 'bg-accent-amber/[0.04]',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                {a.pinned && (
                  <span className="badge border-accent-amber/40 bg-accent-amber/10 text-accent-amber">
                    pinned
                  </span>
                )}
                <h3 className="font-semibold text-text-primary">{a.title}</h3>
              </div>
              <Markdown content={a.body} className="mt-2" />
              <p className="mt-3 text-xs text-text-tertiary">
                {a.author.name} · <RoleBadge role={a.author.role} /> · {timeAgo(a.createdAt)}
              </p>
            </article>
          ))}
          {unreadAnnouncements > announcements.length && (
            <Link href="/dashboard#announcements" className="text-xs text-text-tertiary hover:text-accent-cyan">
              {unreadAnnouncements - announcements.length} more active announcement
              {unreadAnnouncements - announcements.length === 1 ? '' : 's'}
            </Link>
          )}
        </section>
      )}

      {/* Admin nudge */}
      {(user.role === 'ADMIN' || user.role === 'MODERATOR') && (
        <Link
          href="/admin"
          className={cn(
            'flex items-center justify-between rounded-xl border px-5 py-4 transition',
            openReports > 0
              ? 'border-accent-amber/40 bg-accent-amber/5 hover:bg-accent-amber/10'
              : 'border-border bg-surface hover:border-accent-cyan/40',
          )}
        >
          <span className="text-sm text-text-secondary">
            <span className="font-medium text-text-primary">Admin dashboard</span>
            {openReports > 0 && (
              <span className="ml-2 text-accent-amber">
                {openReports} open report{openReports === 1 ? '' : 's'} waiting for review
              </span>
            )}
            {openReports === 0 && <span className="ml-2">No reports waiting.</span>}
          </span>
          <span aria-hidden className="text-text-tertiary">
            →
          </span>
        </Link>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Pinned */}
        <section className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
              Pinned discussions
            </h2>
            <Link href="/forum" className="text-xs text-accent-cyan hover:underline">
              View all →
            </Link>
          </div>

          {pinnedPosts.length === 0 ? (
            <EmptyState
              icon="◈"
              title="Nothing pinned right now"
              description="Pinned posts appear here. Moderators can pin important threads."
            />
          ) : (
            <ul className="space-y-3">
              {pinnedPosts.map((post) => (
                <li key={post.id}>
                  <PostRow post={post} pinned />
                </li>
              ))}
            </ul>
          )}

          {/* Latest activity */}
          <div className="mb-3 mt-8 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
              Latest activity
            </h2>
            <Link href="/forum?sort=active" className="text-xs text-accent-cyan hover:underline">
              Recent first →
            </Link>
          </div>

          {recentPosts.length === 0 ? (
            <EmptyState
              icon="✦"
              title="No discussions yet"
              description="Be the first to start a thread."
              action={
                <Link href="/forum/new" className="btn-primary">
                  Start a discussion
                </Link>
              }
            />
          ) : (
            <ul className="space-y-2">
              {recentPosts.map((post) => (
                <li key={post.id}>
                  <PostRow post={post} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Sidebar */}
        <aside className="space-y-6">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">
              My open work
            </h2>
            {myAssignments.length === 0 ? (
              <EmptyState
                icon="✓"
                title="Nothing assigned"
                description="You have no open assignments."
              />
            ) : (
              <ul className="space-y-2">
                {myAssignments.map((a) => {
                  const due = a.dueAt ? dueLabel(a.dueAt) : null;
                  return (
                    <li key={a.id} className="card p-4">
                      <Link
                        href="/assignments"
                        className="text-sm font-medium text-text-primary hover:text-accent-cyan"
                      >
                        {a.title}
                      </Link>
                      {due && (
                        <p
                          className={cn(
                            'mt-1 text-xs',
                            due.tone === 'late' && 'text-accent-rose',
                            due.tone === 'soon' && 'text-accent-amber',
                            due.tone === 'ok' && 'text-text-tertiary',
                          )}
                        >
                          {due.text}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">
              Group deadlines
            </h2>
            {upcomingAssignments.length === 0 ? (
              <EmptyState icon="▦" title="Nothing due this week" />
            ) : (
              <ul className="space-y-2">
                {upcomingAssignments.map((a) => {
                  const due = a.dueAt ? dueLabel(a.dueAt) : null;
                  return (
                    <li key={a.id} className="card p-4">
                      <div className="flex items-start gap-2">
                        <span className="badge shrink-0">{a.type.toLowerCase()}</span>
                        <div className="min-w-0">
                          <p className="truncate text-sm text-text-primary">{a.title}</p>
                          {a.owner && (
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-text-tertiary">
                              <Avatar name={a.owner.name} seed={a.owner.avatarSeed} size="xs" />
                              {a.owner.name}
                            </p>
                          )}
                          {due && (
                            <p
                              className={cn(
                                'mt-1 text-xs',
                                due.tone === 'late' && 'text-accent-rose',
                                due.tone === 'soon' && 'text-accent-amber',
                                due.tone === 'ok' && 'text-text-tertiary',
                              )}
                            >
                              {due.text}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">
              Shortcuts
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { href: '/chat', label: 'Open chat' },
                { href: '/resources', label: 'Share a file' },
                { href: '/ctf', label: 'CTF corner' },
                { href: '/forum/new', label: 'New post' },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-lg border border-border bg-surface px-3 py-2.5 text-center text-xs text-text-secondary transition hover:border-accent-green/40 hover:text-accent-green"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

type PostRowData = {
  id: string;
  slug: string;
  title: string;
  createdAt: Date;
  viewCount: number;
  author: { id: string; name: string; avatarSeed: string };
  category: { name: string; slug: string; color: string };
  _count: { comments: number };
};

function PostRow({ post, pinned }: { post: PostRowData; pinned?: boolean }) {
  return (
    <Link
      href={`/forum/${post.slug}`}
      className="block rounded-xl border border-border bg-surface p-4 transition hover:border-accent-green/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {pinned && <span className="text-accent-amber" title="Pinned">◆</span>}
            <span
              className="badge"
              style={{ borderColor: `${post.category.color}55`, color: post.category.color }}
            >
              {post.category.name}
            </span>
          </div>

          <h3 className="mt-2 truncate font-medium text-text-primary">{post.title}</h3>

          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-tertiary">
            <span className="flex items-center gap-1.5">
              <Avatar name={post.author.name} seed={post.author.avatarSeed} size="xs" />
              {post.author.name}
            </span>
            <span>{timeAgo(post.createdAt)}</span>
            <span>{post._count.comments} comments</span>
            <span>{post.viewCount} views</span>
          </p>
        </div>
      </div>
    </Link>
  );
}