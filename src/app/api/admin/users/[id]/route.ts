import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireAdmin } from '@/lib/guards';
import { adminUserUpdateSchema } from '@/lib/validation';
import { assignableRoles } from '@/lib/rbac';
import { isSuperadminEmail } from '@/lib/superadmin';
import { audit, logModeration } from '@/lib/audit';

/**
 * PATCH /api/admin/users/[id] — approve, block, or change a role.
 *
 * Guardrails, all deliberate:
 *  - Only ADMIN may change roles or approval status.
 *  - An admin cannot demote, block, or delete themselves — this prevents an
 *    accidental lockout of the last administrator.
 *  - Promoting to ADMIN is not offered via this route (see assignableRoles).
 *  - Blocking a user also revokes their sessions immediately.
 */
export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireAdmin();
    const { id } = await ctx.params;

    const body = await req.json().catch(() => {
      throw ApiError.badRequest('Send a JSON body.');
    });
    const input = adminUserUpdateSchema.parse(body);

    if (id === actor.id) {
      if (input.status && input.status !== 'APPROVED') {
        throw ApiError.badRequest('You cannot block your own account.');
      }
      if (input.role && input.role !== actor.role) {
        throw ApiError.badRequest('You cannot change your own role.');
      }
    }

    const target = await db.user.findUnique({
      where: { id },
      select: { id: true, role: true, status: true, name: true, email: true },
    });
    if (!target) throw ApiError.notFound('That user does not exist.');

    // Protected super-admins can never be demoted or blocked — not even by
    // another admin, and not by themselves.
    if (
      isSuperadminEmail(target.email) &&
      ((input.role && input.role !== 'ADMIN') ||
        (input.status && input.status !== 'APPROVED'))
    ) {
      throw ApiError.forbidden('This account is a protected super-admin.');
    }

    // Only ever grant roles the acting admin is allowed to grant.
    if (input.role && !assignableRoles(actor.role).includes(input.role)) {
      throw ApiError.forbidden('You cannot grant that role.');
    }

    // Never allow the last remaining admin to be demoted or blocked.
    if (
      target.role === 'ADMIN' &&
      ((input.role && input.role !== 'ADMIN') ||
        (input.status && input.status !== 'APPROVED'))
    ) {
      const adminCount = await db.user.count({
        where: { role: 'ADMIN', status: 'APPROVED' },
      });
      if (adminCount <= 1) {
        throw ApiError.badRequest('This is the last active admin. Promote someone else first.');
      }
    }

    const user = await db.user.update({
      where: { id },
      data: {
        ...(input.role ? { role: input.role } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      select: { id: true, email: true, name: true, role: true, status: true, avatarSeed: true },
    });

    // Blocking must take effect now, not when the token expires.
    if (input.status === 'BLOCKED') {
      await db.session.deleteMany({ where: { userId: id } });
    }

    if (input.status && input.status !== target.status) {
      await logModeration({
        actorId: actor.id,
        action: `user.status.${input.status.toLowerCase()}`,
        entityType: 'USER',
        entityId: id,
        metadata: { from: target.status, to: input.status, name: target.name },
      });
    }
    if (input.role && input.role !== target.role) {
      await logModeration({
        actorId: actor.id,
        action: 'user.role.change',
        entityType: 'USER',
        entityId: id,
        metadata: { from: target.role, to: input.role, name: target.name },
      });
    }

    await audit({
      actorId: actor.id,
      action: 'admin.user.update',
      entityType: 'USER',
      entityId: id,
      metadata: { before: { role: target.role, status: target.status }, patch: input },
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    });

    return ok({ user });
  },
);

/** DELETE /api/admin/users/[id] — hard delete, admin only, with guardrails. */
export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireAdmin();
    const { id } = await ctx.params;

    if (id === actor.id) {
      throw ApiError.badRequest('You cannot delete your own account.');
    }

    const target = await db.user.findUnique({
      where: { id },
      select: { id: true, role: true, name: true, email: true },
    });
    if (!target) throw ApiError.notFound('That user does not exist.');

    if (isSuperadminEmail(target.email)) {
      throw ApiError.forbidden('This account is a protected super-admin.');
    }

    if (target.role === 'ADMIN') {
      const adminCount = await db.user.count({
        where: { role: 'ADMIN', status: 'APPROVED' },
      });
      if (adminCount <= 1) {
        throw ApiError.badRequest('This is the last active admin.');
      }
    }

    // Cascades remove their posts, comments, votes, messages and sessions.
    await db.user.delete({ where: { id } });

    await logModeration({
      actorId: actor.id,
      action: 'user.delete',
      entityType: 'USER',
      entityId: id,
      metadata: { name: target.name, role: target.role },
    });

    return ok({ success: true });
  },
);