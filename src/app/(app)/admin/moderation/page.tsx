import { db } from '@/lib/db';
import { requireAdminPage } from '../require-admin';
import { ModerationClient } from './moderation-client';

export default async function AdminModerationPage() {
  const actor = await requireAdminPage();

  const [reports, counts] = await Promise.all([
    db.report.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        reporter: { select: { id: true, name: true, avatarSeed: true } },
        resolvedBy: { select: { id: true, name: true } },
      },
    }),
    db.report.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const statusCounts: Record<string, number> = { OPEN: 0, RESOLVED: 0, DISMISSED: 0 };
  for (const row of counts) statusCounts[row.status] = row._count._all;

  // Prefill target previews the same way the API does, so the queue renders
  // immediately without waiting on a client round-trip.
  const hydrated = await Promise.all(
    reports.map(async (report) => ({
      id: report.id,
      reason: report.reason,
      details: report.details,
      targetType: report.targetType,
      createdAt: report.createdAt.toISOString(),
      reporter: report.reporter,
      resolvedBy: report.resolvedBy,
      target: await preview(report.targetType, report.targetId),
    })),
  );

  return (
    <ModerationClient
      isAdmin={actor.role === 'ADMIN'}
      counts={statusCounts}
      initialReports={hydrated}
    />
  );
}

async function preview(type: string, id: string) {
  const snippet = (text: string) =>
    text.replace(/[#*`>\[\]()]/g, ' ').replace(/\s+/s, ' ').trim().slice(0, 200);

  switch (type) {
    case 'POST': {
      const post = await db.post.findUnique({
        where: { id },
        select: { title: true, body: true, status: true, slug: true, author: { select: { id: true, name: true } } },
      });
      return post
        ? {
            exists: true,
            title: post.title,
            snippet: snippet(post.body),
            author: post.author,
            href: `/forum/${post.slug}`,
            status: post.status,
          }
        : { exists: false, title: 'Deleted post', snippet: '', author: null };
    }
    case 'COMMENT': {
      const comment = await db.comment.findUnique({
        where: { id },
        select: {
          id: true,
          body: true,
          status: true,
          author: { select: { id: true, name: true } },
          post: { select: { slug: true, title: true } },
        },
      });
      return comment
        ? {
            exists: true,
            title: `Comment on "${comment.post.title}"`,
            snippet: snippet(comment.body),
            author: comment.author,
            href: `/forum/${comment.post.slug}#comment-${comment.id}`,
            status: comment.status,
          }
        : { exists: false, title: 'Deleted comment', snippet: '', author: null };
    }
    case 'RESOURCE': {
      const resource = await db.resource.findUnique({
        where: { id },
        select: { title: true, description: true, url: true, uploadedBy: { select: { id: true, name: true } } },
      });
      return resource
        ? {
            exists: true,
            title: resource.title,
            snippet: snippet(resource.description ?? resource.url ?? ''),
            author: resource.uploadedBy,
            href: '/resources',
          }
        : { exists: false, title: 'Deleted resource', snippet: '', author: null };
    }
    case 'FILE': {
      const file = await db.fileAsset.findUnique({
        where: { id },
        select: { originalName: true, mimeType: true, sizeBytes: true, uploadedBy: { select: { id: true, name: true } } },
      });
      return file
        ? {
            exists: true,
            title: file.originalName,
            snippet: `${file.mimeType} · ${file.sizeBytes} bytes`,
            author: file.uploadedBy,
          }
        : { exists: false, title: 'Deleted file', snippet: '', author: null };
    }
    case 'MESSAGE': {
      const message = await db.message.findUnique({
        where: { id },
        select: { body: true, sender: { select: { id: true, name: true } } },
      });
      return message
        ? { exists: true, title: 'Chat message', snippet: snippet(message.body), author: message.sender, href: '/chat' }
        : { exists: false, title: 'Deleted message', snippet: '', author: null };
    }
    case 'USER': {
      const user = await db.user.findUnique({
        where: { id },
        select: { name: true, email: true, status: true, role: true },
      });
      return user
        ? {
            exists: true,
            title: user.name,
            snippet: `${user.email} · ${user.role} · ${user.status}`,
            author: { id, name: user.name },
            href: '/admin/users',
          }
        : { exists: false, title: 'Deleted user', snippet: '', author: null };
    }
    default:
      return { exists: false, title: 'Unknown target', snippet: '', author: null };
  }
}