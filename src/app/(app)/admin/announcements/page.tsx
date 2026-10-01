import { db } from '@/lib/db';
import { requireAdminOnlyPage } from '../require-admin';
import { AnnouncementsClient } from './announcements-client';

export default async function AdminAnnouncementsPage() {
  await requireAdminOnlyPage();

  const now = new Date();

  const [announcements, expired] = await Promise.all([
    db.announcement.findMany({
      where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      include: { author: { select: { id: true, name: true, role: true } } },
    }),
    db.announcement.findMany({
      where: { expiresAt: { lte: now } },
      orderBy: { expiresAt: 'desc' },
      include: { author: { select: { id: true, name: true } } },
    }),
  ]);

  return (
    <AnnouncementsClient
      active={announcements.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        pinned: a.pinned,
        expiresAt: a.expiresAt ? a.expiresAt.toISOString() : null,
        createdAt: a.createdAt.toISOString(),
        author: a.author,
      }))}
      expired={expired.map((a) => ({
        id: a.id,
        title: a.title,
        expiresAt: a.expiresAt ? a.expiresAt.toISOString() : null,
        author: a.author.name,
      }))}
    />
  );
}