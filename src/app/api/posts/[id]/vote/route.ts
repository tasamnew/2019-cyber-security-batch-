import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireMember } from '@/lib/guards';
import { enforceRateLimit, limitKey } from '@/lib/rate-limit';
import { voteSchema } from '@/lib/validation';
import { castVote } from '@/lib/votes';

/**
 * POST /api/posts/[id]/vote  { value: 1 | -1 | 0 }
 * Toggle semantics: sending the value you already hold clears the vote.
 */
export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireMember();
    const { id } = await ctx.params;

    enforceRateLimit(limitKey(req, 'vote', actor.id), 60, 5 * 60 * 1000);

    const body = await req.json().catch(() => {
      throw ApiError.badRequest('Send a JSON body.');
    });
    const { value } = voteSchema.parse(body);

    const post = await db.post.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!post || post.status === 'HIDDEN') throw ApiError.notFound('That post does not exist.');

    const existing = await db.vote.findUnique({
      where: { userId_targetType_targetId: { userId: actor.id, targetType: 'POST', targetId: id } },
      select: { value: true },
    });

    // Same value again => toggle off.
    const next = existing?.value === value ? 0 : value;
    const result = await castVote(actor.id, 'POST', id, next);

    return ok({ ...result, myVote: next });
  },
);