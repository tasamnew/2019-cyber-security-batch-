import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requirePermission } from '@/lib/guards';
import { categorySchema } from '@/lib/validation';
import { slugify } from '@/lib/utils';
import { audit } from '@/lib/audit';

/** GET /api/categories — list forum categories with published post counts. */
export const GET = handler(async () => {
  const categories = await db.category.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { posts: { where: { status: 'PUBLISHED' } } } } },
  });

  return ok({
    categories: categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      color: c.color,
      sortOrder: c.sortOrder,
      postCount: c._count.posts,
    })),
  });
});

/** POST /api/categories — moderator+ only. */
export const POST = handler(async (req: Request) => {
  const actor = await requirePermission('channel:create');

  const body = await req.json().catch(() => {
    throw ApiError.badRequest('Send a JSON body.');
  });
  const input = categorySchema.parse(body);

  // Derive the slug when the client only supplied a display name.
  const slug = input.slug ?? slugify(input.name);

  const existing = await db.category.findUnique({ where: { slug } });
  if (existing) throw ApiError.conflict('A category with that slug already exists.');

  const category = await db.category.create({ data: { ...input, slug } });

  await audit({
    actorId: actor.id,
    action: 'category.create',
    entityType: 'Category',
    entityId: category.id,
    metadata: { slug: category.slug },
  });

  return ok({ category }, 201);
});