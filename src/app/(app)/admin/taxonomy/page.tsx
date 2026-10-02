import { db } from '@/lib/db';
import { requireAdminPage } from '../require-admin';
import { TaxonomyClient } from './taxonomy-client';

export const metadata = { title: 'Channels & categories' };
export const dynamic = 'force-dynamic';

/**
 * Lets moderators add the course titles without touching the API by hand.
 * Both lists are managed here because a course usually needs a place to talk
 * (chat channel) and a place to post write-ups (forum category).
 */
export default async function AdminTaxonomyPage() {
  await requireAdminPage();

  const [channels, categories] = await Promise.all([
    db.channel.findMany({
      orderBy: { slug: 'asc' },
      include: { _count: { select: { messages: true, members: true } } },
    }),
    db.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { posts: true } } },
    }),
  ]);

  return (
    <TaxonomyClient
      channels={channels.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        topic: c.topic,
        kind: c.kind,
        messageCount: c._count.messages,
        memberCount: c._count.members,
      }))}
      categories={categories.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        description: c.description,
        color: c.color,
        sortOrder: c.sortOrder,
        postCount: c._count.posts,
      }))}
    />
  );
}