import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireMember } from '@/lib/guards';
import { enforceRateLimit, limitKey } from '@/lib/rate-limit';
import { reportCreateSchema } from '@/lib/validation';

/**
 * POST /api/reports — flag a post, comment, resource, file, message or user.
 *
 * One open report per user per target: repeating just updates the existing row,
 * which stops the moderation queue being flooded by a single account.
 */
export const POST = handler(async (req: Request) => {
  const actor = await requireMember();
  enforceRateLimit(limitKey(req, 'report:create', actor.id), 20, 60 * 60 * 1000);

  const body = await req.json().catch(() => {
    throw ApiError.badRequest('Send a JSON body.');
  });
  const input = reportCreateSchema.parse(body);

  // Confirm the target actually exists before accepting a report against it.
  const exists = await targetExists(input.targetType, input.targetId);
  if (!exists) throw ApiError.notFound('The thing you reported could not be found.');

  const existing = await db.report.findFirst({
    where: {
      targetType: input.targetType,
      targetId: input.targetId,
      reporterId: actor.id,
      status: 'OPEN',
    },
    select: { id: true },
  });

  if (existing) {
    return ok({ reportId: existing.id, message: 'You already reported this. A moderator will review it.' });
  }

  const report = await db.report.create({
    data: {
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      details: input.details ?? null,
      reporterId: actor.id,
    },
  });

  return ok({ reportId: report.id, message: 'Thanks. A moderator will take a look.' }, 201);
});

async function targetExists(type: string, id: string): Promise<boolean> {
  switch (type) {
    case 'POST':
      return (await db.post.count({ where: { id } })) > 0;
    case 'COMMENT':
      return (await db.comment.count({ where: { id } })) > 0;
    case 'RESOURCE':
      return (await db.resource.count({ where: { id } })) > 0;
    case 'FILE':
      return (await db.fileAsset.count({ where: { id } })) > 0;
    case 'MESSAGE':
      return (await db.message.count({ where: { id } })) > 0;
    case 'USER':
      return (await db.user.count({ where: { id } })) > 0;
    default:
      return false;
  }
}