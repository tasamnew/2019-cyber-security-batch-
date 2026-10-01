import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireMember } from '@/lib/guards';
import { enforceRateLimit, limitKey } from '@/lib/rate-limit';
import { ctfFlagSubmissionSchema } from '@/lib/validation';
import { verifyFlag } from '@/lib/flags';

/**
 * POST /api/ctf/[id]/solve — verify a submitted flag.
 *
 * Rate limited per user so a flag cannot be dictionary-attacked through this
 * endpoint. Wrong answers are counted but never reveal which part was wrong.
 */
export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireMember();
    const { id } = await ctx.params;
    enforceRateLimit(limitKey(req, 'ctf:solve', actor.id), 20, 10 * 60 * 1000);

    const body = await req.json().catch(() => {
      throw ApiError.badRequest('Send a JSON body.');
    });
    const input = ctfFlagSubmissionSchema.parse(body);

    const challenge = await db.ctfChallenge.findUnique({
      where: { id },
      select: { id: true, points: true, flagHash: true },
    });
    if (!challenge) throw ApiError.notFound('That challenge does not exist.');
    if (!challenge.flagHash) {
      throw ApiError.badRequest('This challenge has no flag set — ask its author to add one.');
    }

    const existing = await db.ctfSolve.findUnique({
      where: { challengeId_userId: { challengeId: id, userId: actor.id } },
    });
    if (existing) throw ApiError.badRequest('You already solved this challenge.');

    if (!verifyFlag(input.flag, challenge.flagHash)) {
      throw ApiError.badRequest('That flag is not correct.');
    }

    const solve = await db.ctfSolve.create({
      data: { challengeId: id, userId: actor.id, points: challenge.points },
    });

    return ok({ solve }, 201);
  },
);