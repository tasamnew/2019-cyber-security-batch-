import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireMember } from '@/lib/guards';
import { resolveStoredPath, contentDisposition } from '@/lib/storage';
import { can } from '@/lib/rbac';
import { deleteStoredFile } from '@/lib/storage';
import { logModeration, audit } from '@/lib/audit';

/**
 * A file id is a capability only if the rooms it was shared into are checked.
 * Uploading used to be the only gate, so every signed-in member could fetch
 * every file. A resource published in /resources is public by definition, but
 * a file sitting in a DM or a private channel must stay inside that room.
 */
async function assertFileVisibleTo(fileId: string, actor: { id: string }): Promise<void> {
  const published = await db.resource.findFirst({
    where: { fileId },
    select: { id: true },
  });
  if (published) return;

  const uses = await db.message.findMany({
    where: { attachmentId: fileId },
    select: {
      conversation: { select: { senderId: true, recipientId: true } },
      channel: { select: { id: true, kind: true } },
    },
  });
  if (uses.length === 0) return;

  for (const use of uses) {
    if (use.conversation) {
      const { senderId, recipientId } = use.conversation;
      if (senderId !== actor.id && recipientId !== actor.id) {
        throw ApiError.notFound('That file is no longer available.');
      }
      continue;
    }

    const channel = use.channel;
    if (!channel || channel.kind !== 'PRIVATE') continue;

    const member = await db.channelMember.findUnique({
      where: { userId_channelId: { userId: actor.id, channelId: channel.id } },
    });
    if (!member) throw ApiError.notFound('That file is no longer available.');
  }
}

/**
 * GET /api/files/[id] — authenticated download.
 *
 * Files are never statically served, so this handler is the single choke point
 * for access control. It re-checks the session every time rather than trusting
 * a signed URL that could be shared around.
 *
 * `?meta=1` returns metadata instead of bytes (used to render a file card).
 */
export const GET = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireMember();
    const { id } = await ctx.params;

    const asset = await db.fileAsset.findUnique({
      where: { id },
      include: { uploadedBy: { select: { name: true } } },
    });
    if (!asset) throw ApiError.notFound('That file does not exist.');

    await assertFileVisibleTo(asset.id, actor);

    if (new URL(req.url).searchParams.get('meta') === '1') {
      return ok({ file: asset });
    }

    const path = resolveStoredPath(asset.storedName);

    let size: number;
    try {
      const info = await stat(path);
      if (!info.isFile()) throw new Error('not a file');
      size = info.size;
    } catch {
      // DB row exists but the blob is gone (manual deletion, bad deploy).
      throw ApiError.notFound('That file is no longer available. Ask the uploader to re-share it.');
    }

    // Only images may render inline; everything else is forced to download so a
    // malicious HTML/SVG payload can never execute on our origin.
    const isImage = asset.mimeType.startsWith('image/');
    const stream = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;

    await db.fileAsset
      .update({ where: { id }, data: { downloadCount: { increment: 1 } } })
      .catch(() => undefined);

    return new Response(stream, {
      headers: {
        'Content-Type': asset.mimeType,
        'Content-Length': String(size),
        'Content-Disposition': contentDisposition(asset.originalName, isImage),
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  },
);

/**
 * DELETE /api/files/[id] — owner, or a moderator removing an inappropriate
 * upload. Removes the blob from disk and the metadata row in that order, so a
 * crash mid-way leaves an orphan file rather than a dangling pointer.
 */
export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireMember();
    const { id } = await ctx.params;

    const asset = await db.fileAsset.findUnique({
      where: { id },
      select: { id: true, uploadedById: true, originalName: true, storedName: true },
    });
    if (!asset) throw ApiError.notFound('That file does not exist.');

    const isOwner = asset.uploadedById === actor.id;
    if (!isOwner && !can(actor.role, 'resource:delete:any')) {
      throw ApiError.forbidden('You can only delete files you uploaded.');
    }

    await deleteStoredFile(asset.storedName);
    // `onDelete: SetNull` on Resource.fileId detaches any published resources.
    await db.fileAsset.delete({ where: { id } });

    await logModeration({
      actorId: actor.id,
      action: 'file.delete',
      entityType: 'FILE',
      entityId: id,
      metadata: { originalName: asset.originalName, byOwner: isOwner },
    });
    await audit({
      actorId: actor.id,
      action: 'file.delete',
      entityType: 'FILE',
      entityId: id,
      metadata: { originalName: asset.originalName },
    });

    return ok({ success: true });
  },
);