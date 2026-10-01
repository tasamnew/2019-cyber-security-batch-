import { Prisma, type ReportStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { handler, ok } from '@/lib/api-response';
import { requireRole } from '@/lib/guards';
import { paginationSchema } from '@/lib/validation';

/**
 * GET /api/admin/reports — the moderation queue.
 *
 * Each row is hydrated with a preview of whatever was reported so a moderator
 * can judge it without opening five tabs.
 */
export const GET = handler(async (req: Request) => {
  await requireRole('MODERATOR');

  const params = Object.fromEntries(new URL(req.url).searchParams);
  const { page, perPage } = paginationSchema.parse(params);
  const status = params.status;
  const filter: Prisma.ReportWhereInput =
    status && ['OPEN', 'RESOLVED', 'DISMISSED'].includes(status)
      ? { status: status as ReportStatus }
      : { status: 'OPEN' };

  const [reports, total, counts] = await Promise.all([
    db.report.findMany({
      where: filter,
      orderBy: { createdAt: 'desc' },
      take: perPage,
      skip: (page - 1) * perPage,
      include: {
        reporter: { select: { id: true, name: true, avatarSeed: true } },
        resolvedBy: { select: { id: true, name: true } },
      },
    }),
    db.report.count({ where: filter }),
    db.report.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const hydrated = await Promise.all(
    reports.map(async (report) => ({
      ...report,
      target: await describeTarget(report.targetType, report.targetId),
    })),
  );

  const byStatus: Record<string, number> = { OPEN: 0, RESOLVED: 0, DISMISSED: 0 };
  for (const row of counts) byStatus[row.status] = row._count._all;

  return ok({
    reports: hydrated,
    counts: byStatus,
    pagination: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) },
  });
});

interface TargetPreview {
  exists: boolean;
  title: string;
  snippet: string;
  author?: { id: string; name: string } | null;
  href?: string;
  status?: string;
  tone?: string;
}

/** Build a compact preview for the moderation queue. */
async function describeTarget(type: string, id: string): Promise<TargetPreview> {
  const snippet = (text: string, len = 180) =>
    text.replace(/[#*`>\[\]()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, len);

  switch (type) {
    case 'POST': {
      const post = await db.post.findUnique({
        where: { id },
        include: { author: { select: { id: true, name: true } } },
      });
      if (!post) return { exists: false, title: 'Deleted post', snippet: '' };
      return {
        exists: true,
        title: post.title,
        snippet: snippet(post.body),
        author: post.author,
        href: `/forum/${post.slug}`,
        status: post.status,
      };
    }
    case 'COMMENT': {
      const comment = await db.comment.findUnique({
        where: { id },
        include: {
          author: { select: { id: true, name: true } },
          post: { select: { slug: true, title: true } },
        },
      });
      if (!comment) return { exists: false, title: 'Deleted comment', snippet: '' };
      return {
        exists: true,
        title: `Comment on "${comment.post.title}"`,
        snippet: snippet(comment.body),
        author: comment.author,
        href: `/forum/${comment.post.slug}#comment-${comment.id}`,
        status: comment.status,
      };
    }
    case 'RESOURCE': {
      const resource = await db.resource.findUnique({
        where: { id },
        include: { uploadedBy: { select: { id: true, name: true } } },
      });
      if (!resource) return { exists: false, title: 'Deleted resource', snippet: '' };
      return {
        exists: true,
        title: resource.title,
        snippet: snippet(resource.description ?? resource.url ?? ''),
        author: resource.uploadedBy,
        href: '/resources',
      };
    }
    case 'FILE': {
      const file = await db.fileAsset.findUnique({
        where: { id },
        include: { uploadedBy: { select: { id: true, name: true } } },
      });
      if (!file) return { exists: false, title: 'Deleted file', snippet: '' };
      return {
        exists: true,
        title: file.originalName,
        snippet: `${file.mimeType} · ${file.sizeBytes} bytes`,
        author: file.uploadedBy,
      };
    }
    case 'MESSAGE': {
      const message = await db.message.findUnique({
        where: { id },
        include: { sender: { select: { id: true, name: true } } },
      });
      if (!message) return { exists: false, title: 'Deleted message', snippet: '' };
      return {
        exists: true,
        title: 'Chat message',
        snippet: snippet(message.body),
        author: message.sender,
        href: '/chat',
      };
    }
    case 'USER': {
      const user = await db.user.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, status: true, role: true },
      });
      if (!user) return { exists: false, title: 'Deleted user', snippet: '' };
      return {
        exists: true,
        title: user.name,
        snippet: `${user.email} · ${user.role} · ${user.status}`,
        author: { id: user.id, name: user.name },
        status: user.status,
      };
    }
    default:
      return { exists: false, title: 'Unknown target', snippet: '' };
  }
}