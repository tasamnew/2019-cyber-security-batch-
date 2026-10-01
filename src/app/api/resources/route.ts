import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requirePermission } from '@/lib/guards';
import { enforceRateLimit, limitKey } from '@/lib/rate-limit';
import { resourceCreateSchema, resourceListQuerySchema } from '@/lib/validation';
import { Prisma } from '@prisma/client';

/** GET /api/resources — browse/search the shared repository. */
export const GET = handler(async (req: Request) => {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const query = resourceListQuerySchema.parse(params);

  const where: Prisma.ResourceWhereInput = {
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.tag ? { tags: { has: query.tag } } : {}),
    ...(query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: 'insensitive' } },
            { description: { contains: query.q, mode: 'insensitive' } },
            { tags: { has: query.q.toLowerCase() } },
          ],
        }
      : {}),
  };

  const [resources, total, allTags] = await Promise.all([
    db.resource.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.perPage,
      skip: (query.page - 1) * query.perPage,
      include: {
        uploadedBy: { select: { id: true, name: true, role: true, avatarSeed: true } },
        file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, downloadCount: true } },
      },
    }),
    db.resource.count({ where }),
    // Distinct tags for the filter chips, derived from the full set.
    db.resource.findMany({ select: { tags: true } }),
  ]);

  const tagSet = new Set<string>();
  for (const r of allTags) for (const t of r.tags) tagSet.add(t);

  return ok({
    resources,
    tags: [...tagSet].sort(),
    pagination: {
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.perPage)),
    },
  });
});

/** POST /api/resources — share a link or an uploaded file. */
export const POST = handler(async (req: Request) => {
  const actor = await requirePermission('resource:upload');
  enforceRateLimit(limitKey(req, 'resource:create', actor.id), 20, 60 * 60 * 1000);

  const body = await req.json().catch(() => {
    throw ApiError.badRequest('Send a JSON body.');
  });
  const input = resourceCreateSchema.parse(body);

  // Validate the kind-specific requirement so a row can never be half-built.
  if (input.kind === 'LINK' && !input.url) {
    throw ApiError.badRequest('Provide a URL for a link resource.');
  }
  if (input.kind === 'FILE') {
    if (!input.fileId) throw ApiError.badRequest('Upload a file first.');
    const file = await db.fileAsset.findUnique({ where: { id: input.fileId } });
    if (!file) throw ApiError.badRequest('That upload no longer exists.');
    if (file.uploadedById !== actor.id && actor.role !== 'ADMIN') {
      throw ApiError.forbidden('You can only publish files you uploaded.');
    }
  }

  const resource = await db.resource.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      kind: input.kind,
      url: input.url ?? null,
      fileId: input.fileId ?? null,
      tags: input.tags,
      uploadedById: actor.id,
    },
    include: { file: true, uploadedBy: { select: { id: true, name: true, role: true, avatarSeed: true } } },
  });

  return ok({ resource }, 201);
});