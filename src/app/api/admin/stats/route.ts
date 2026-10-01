import { db } from '@/lib/db';
import { handler, ok } from '@/lib/api-response';
import { requireRole } from '@/lib/guards';

/**
 * GET /api/admin/stats — dashboard widgets.
 *
 * All queries run concurrently via Promise.all. Daily activity uses raw SQL
 * with date_trunc because grouping a timestamp by day is not expressible in
 * Prisma's groupBy.
 */
export const GET = handler(async () => {
  await requireRole('MODERATOR');

  const since = new Date(Date.now() - 29 * 86400000); // last 30 days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(today.getTime() - 6 * 86400000);

  const [
    totalStudents,
    pendingUsers,
    approvedStudents,
    blockedUsers,
    activeToday,
    totalPosts,
    totalComments,
    openReports,
    totalChannels,
    totalMessages,
    totalChallenges,
    openAssignments,
    storageBytes,
    dailyRows,
    topContributors,
    recentUsers,
  ] = await Promise.all([
    db.user.count({ where: { role: 'STUDENT' } }),
    db.user.count({ where: { status: 'PENDING' } }),
    db.user.count({ where: { status: 'APPROVED' } }),
    db.user.count({ where: { status: 'BLOCKED' } }),
    db.user.count({ where: { lastLoginAt: { gte: today } } }),
    db.post.count({ where: { status: 'PUBLISHED' } }),
    db.comment.count({ where: { status: 'PUBLISHED' } }),
    db.report.count({ where: { status: 'OPEN' } }),
    db.channel.count(),
    db.message.count(),
    db.ctfChallenge.count(),
    db.assignment.count({ where: { status: { not: 'DONE' } } }),
    db.fileAsset.aggregate({ _sum: { sizeBytes: true } }),
    // Daily counts for the activity chart.
    db.$queryRaw<
      { day: Date; posts: bigint; comments: bigint; messages: bigint }[]
    >`
      SELECT
        day,
        COALESCE(SUM(posts), 0)::bigint    AS posts,
        COALESCE(SUM(comments), 0)::bigint AS comments,
        COALESCE(SUM(messages), 0)::bigint AS messages
      FROM (
        SELECT date_trunc('day', "createdAt") AS day, 1 AS posts, 0 AS comments, 0 AS messages
        FROM "Post" WHERE "createdAt" >= ${since}
        UNION ALL
        SELECT date_trunc('day', "createdAt"), 0, 1, 0
        FROM "Comment" WHERE "createdAt" >= ${since}
        UNION ALL
        SELECT date_trunc('day', "createdAt"), 0, 0, 1
        FROM "Message" WHERE "createdAt" >= ${since}
      ) AS events
      GROUP BY day
      ORDER BY day ASC
    `,
    db.user.findMany({
      where: { status: 'APPROVED' },
      orderBy: { posts: { _count: 'desc' } },
      take: 5,
      select: {
        id: true,
        name: true,
        avatarSeed: true,
        role: true,
        _count: { select: { posts: true, comments: true } },
      },
    }),
    db.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, name: true, email: true, status: true, role: true, createdAt: true, avatarSeed: true },
    }),
  ]);

  // Fill gaps so the chart always shows 30 continuous days.
  const byDay = new Map<string, { posts: number; comments: number; messages: number }>();
  for (const row of dailyRows) {
    const key = new Date(row.day).toISOString().slice(0, 10);
    byDay.set(key, {
      posts: Number(row.posts),
      comments: Number(row.comments),
      messages: Number(row.messages),
    });
  }

  const dailyActivity = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today.getTime() - (29 - i) * 86400000);
    const key = d.toISOString().slice(0, 10);
    const entry = byDay.get(key) ?? { posts: 0, comments: 0, messages: 0 };
    return { date: key, ...entry, total: entry.posts + entry.comments + entry.messages };
  });

  const sinceWeek = new Date(Date.now() - 7 * 86400000);
  const [postsThisWeek, messagesThisWeek, signupsThisWeek] = await Promise.all([
    db.post.count({ where: { createdAt: { gte: sinceWeek } } }),
    db.message.count({ where: { createdAt: { gte: sinceWeek } } }),
    db.user.count({ where: { createdAt: { gte: sinceWeek } } }),
  ]);

  return ok({
    totals: {
      students: totalStudents,
      pending: pendingUsers,
      approved: approvedStudents,
      blocked: blockedUsers,
      activeToday,
      posts: totalPosts,
      comments: totalComments,
      messages: totalMessages,
      channels: totalChannels,
      challenges: totalChallenges,
      openAssignments,
      openReports,
      storageBytes: storageBytes._sum.sizeBytes ?? 0,
      fileCount: await db.fileAsset.count(),
    },
    thisWeek: { posts: postsThisWeek, messages: messagesThisWeek, signups: signupsThisWeek },
    dailyActivity,
    topContributors,
    recentUsers,
  });
});