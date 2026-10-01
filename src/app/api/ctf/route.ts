import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireMember, requirePermission } from '@/lib/guards';
import { enforceRateLimit, limitKey } from '@/lib/rate-limit';
import { ctfCreateSchema } from '@/lib/validation';
import { hashFlag } from '@/lib/flags';
import { Prisma, type CtfDifficulty } from '@prisma/client';

/**
 * GET /api/ctf — challenges + filter facets.
 * `?reveal=1` includes hints and write-ups; requires moderator.
 */
export const GET = handler(async (req: Request) => {
  const actor = await requireMember();
  const params = Object.fromEntries(new URL(req.url).searchParams);

  const difficulty = params.difficulty;
  const category = params.category;
  const q = params.q?.trim();

  const where: Prisma.CtfChallengeWhereInput = {
    ...(difficulty && ['EASY', 'MEDIUM', 'HARD', 'INSANE'].includes(difficulty)
      ? { difficulty: difficulty as CtfDifficulty }
      : {}),
    ...(category ? { category: { equals: category, mode: 'insensitive' } } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const isModerator = actor.role === 'ADMIN' || actor.role === 'MODERATOR';

  const [challenges, categories] = await Promise.all([
    db.ctfChallenge.findMany({
      where,
      orderBy: [{ difficulty: 'desc' }, { createdAt: 'desc' }],
      include: { createdBy: { select: { id: true, name: true, role: true, avatarSeed: true } } },
    }),
    db.ctfChallenge.findMany({ select: { category: true }, distinct: ['category'] }),
  ]);

  return ok({
    challenges: challenges.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      url: c.url,
      category: c.category,
      difficulty: c.difficulty,
      points: c.points,
      // Hints are spoilers: only reveal to moderators until solved.
      hints: isModerator ? c.hints : [],
      hintCount: c.hints.length,
      writeUpUrl: isModerator ? c.writeUpUrl : null,
      createdAt: c.createdAt,
      createdBy: c.createdBy,
      canEdit: isModerator || c.createdBy.id === actor.id,
    })),
    categories: categories.map((c) => c.category).sort(),
  });
});

/** POST /api/ctf */
export const POST = handler(async (req: Request) => {
  const actor = await requirePermission('ctf:create');
  enforceRateLimit(limitKey(req, 'ctf:create', actor.id), 15, 60 * 60 * 1000);

  const body = await req.json().catch(() => {
    throw ApiError.badRequest('Send a JSON body.');
  });
  const input = ctfCreateSchema.parse(body);

  const challenge = await db.ctfChallenge.create({
    data: {
      title: input.title,
      description: input.description,
      url: input.url ?? null,
      category: input.category,
      difficulty: input.difficulty,
      points: input.points,
      hints: input.hints,
      writeUpUrl: input.writeUpUrl ?? null,
      flagHash: input.flag ? hashFlag(input.flag) : null,
      createdById: actor.id,
    },
    include: { createdBy: { select: { id: true, name: true, role: true, avatarSeed: true } } },
  });

  // Never echo the flag hash back to the client.
  const { flagHash: _flagHash, ...safe } = challenge;
  return ok({ challenge: safe }, 201);
});