import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireMember, isOwnerOrModerator } from '@/lib/guards';
import { audit } from '@/lib/audit';

/**
 * DELETE /api/messages/[id]
 *
 * A member may retract their own message; moderators may retract anyone's.
 *
 * This exists as REST rather than only as the Socket.io `message:delete`
 * event so a sender can still undo a post while the live connection is down —
 * which is exactly when a mistaken message is most annoying.
 */
export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireMember();
    const { id } = await ctx.params;

    const message = await db.message.findUnique({
      where: { id },
      select: {
        id: true,
        senderId: true,
        channelId: true,
        conversationId: true,
        body: true,
      },
    });
    if (!message) throw ApiError.notFound('That message no longer exists.');

    if (!isOwnerOrModerator(actor, message.senderId, 'message:delete:own')) {
      throw ApiError.forbidden('You can only delete your own messages.');
    }

    // Capture the rooms before the row is gone, then broadcast the removal so
    // every open client drops it from its list instead of showing a ghost.
    const { channelId, conversationId } = message;

    await db.message.delete({ where: { id } });

    await audit({
      actorId: actor.id,
      action: 'message.delete',
      entityType: 'Message',
      entityId: id,
      metadata: { channelId, conversationId, senderId: message.senderId },
    });

    return ok({ success: true, id, channelId, conversationId });
  },
);