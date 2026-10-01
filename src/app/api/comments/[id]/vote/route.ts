import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireMember } from '@/lib/guards';
import { enforceRateLimit, limitKey } from '@/lib/rate-limit';
import { voteSchema } from '@/lib/validation';
import { castVote } from '@/lib/votes';

/** POST /api/comments/[id]/vote  { value: 1 | -1 | 0 } */
export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireMember();
    const { id } = await ctx.params;

    enforceRateLimit(limitKey(req, 'vote', actor.id), 60, 5 * 60 * 1000);

    const body = await req.json().catch(() => {
      throw ApiError.badRequest('Send a JSON body.');
    });
    const { value } = voteSchema.parse(body);

    const comment = await db.comment.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!comment || comment.status === 'HIDDEN') {
      throw ApiError.notFound('That comment does not exist.');
    }

    const existing = await db.vote.findUnique({
      where: { userId_targetType_targetId: { userId: actor.id, targetType: 'COMMENT', targetId: id } },
      select: { value: true },
    });

    const next = existing?.value === value ? 0 : value;
    const result = await castVote(actor.id, 'COMMENT', id, next);

    return ok({ ...result, myVote: next });
  },
);