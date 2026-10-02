import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireMember, isOwnerOrModerator } from '@/lib/guards';
import { deleteStoredFile } from '@/lib/storage';
import { audit } from '@/lib/audit';
import { broadcastDeletion } from '@/lib/realtime';

/**
 * Drop a file that nothing references any more. Blob first, then the row, so a
 * crash mid-way leaves a dangling pointer the download route reports honestly
 * rather than a row that claims a file nobody can fetch.
 */
async function discardOrphanedFile(fileId: string): Promise<void> {
  const [messages, resources] = await Promise.all([
    db.message.count({ where: { attachmentId: fileId } }),
    db.resource.count({ where: { fileId } }),
  ]);
  if (messages > 0 || resources > 0) return;

  const file = await db.fileAsset.findUnique({
    where: { id: fileId },
    select: { storedName: true },
  });
  if (!file) return;

  await deleteStoredFile(file.storedName);
  await db.fileAsset.delete({ where: { id: fileId } }).catch(() => undefined);
}

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
        attachmentId: true,
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

    // `onDelete: SetNull` leaves the FileAsset row behind, which would keep the
    // blob on disk and — because nothing references it any more — readable by
    // any member holding the id. Reclaim it unless something still points at it.
    if (message.attachmentId) {
      await discardOrphanedFile(message.attachmentId);
    }

    // Tell every open client to drop it, not just the sender's tab.
    broadcastDeletion({ messageId: id, channelId, conversationId });

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