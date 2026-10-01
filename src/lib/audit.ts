import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

/**
 * Append-only audit trail for administrative actions. Stored separately from
 * ModerationLog because it is never deleted and has no cascade: if an admin
 * account is removed, the record of what that admin did survives.
 */
export interface AuditInput {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: input.metadata ?? undefined,
        ip: input.ip ?? null,
        userAgent: input.userAgent?.slice(0, 255) ?? null,
      },
    });
  } catch (err) {
    // Auditing must never break the primary request; log and continue.
    console.error('[audit] failed to record entry', err);
  }
}

/** Moderation actions are also written to the moderation log for the admin UI. */
export async function logModeration(input: AuditInput): Promise<void> {
  if (!input.actorId) return;
  try {
    await db.moderationLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        targetType: input.entityType,
        targetId: input.entityId ?? '',
        metadata: input.metadata ?? undefined,
      },
    });
  } catch (err) {
    console.error('[audit] failed to record moderation entry', err);
  }
}

export type { Prisma };