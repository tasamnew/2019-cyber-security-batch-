import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireMember, requirePermission } from '@/lib/guards';
import { channelCreateSchema } from '@/lib/validation';
import { slugify } from '@/lib/utils';

/** GET /api/channels — public channels plus channels the user has joined. */
export const GET = handler(async () => {
  const actor = await requireMember();

  const channels = await db.channel.findMany({
    where: {
      OR: [{ kind: 'PUBLIC' }, { members: { some: { userId: actor.id } } }],
    },
    orderBy: { slug: 'asc' },
    include: {
      _count: { select: { messages: true, members: true } },
      members: {
        where: { userId: actor.id },
        select: { id: true },
      },
    },
  });

  return ok({
    channels: channels.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      topic: c.topic,
      kind: c.kind,
      memberCount: c._count.members,
      messageCount: c._count.messages,
      joined: c.members.length > 0,
    })),
  });
});

/** POST /api/channels — moderator+ only. */
export const POST = handler(async (req: Request) => {
  const actor = await requirePermission('channel:create');

  const body = await req.json().catch(() => {
    throw ApiError.badRequest('Send a JSON body.');
  });
  const input = channelCreateSchema.parse(body);

  // Derive the slug when the client only supplied a display name.
  const slug = input.slug ?? slugify(input.name);

  const existing = await db.channel.findUnique({ where: { slug } });
  if (existing) throw ApiError.conflict('A channel with that slug already exists.');

  const channel = await db.channel.create({
    data: {
      name: input.name,
      slug,
      topic: input.topic ?? null,
      kind: input.kind,
      createdById: actor.id,
      // Creator joins automatically so they can post straight away.
      members: { create: { userId: actor.id } },
    },
  });

  return ok({ channel }, 201);
});