import { ApiError } from '@/lib/api-response';
import type { CurrentUser } from '@/lib/auth';
import { can, roleAtLeast, type Permission } from '@/lib/rbac';
import type { Role, UserStatus } from '@prisma/client';

/** Throws 401 unless there is an active session. */
export async function requireUser(): Promise<CurrentUser> {
  const { getCurrentUser } = await import('@/lib/auth');
  const user = await getCurrentUser();
  if (!user) throw ApiError.unauthorized();
  return user;
}

/** Throws 401/403 unless the session belongs to an approved member. */
export async function requireMember(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.status !== 'APPROVED') {
    throw ApiError.forbidden('Your account is not approved yet.');
  }
  return user;
}

/** Throws 403 unless the role is at least the required level. */
export async function requireRole(minimum: Role): Promise<CurrentUser> {
  const user = await requireMember();
  if (!roleAtLeast(user.role, minimum)) {
    throw ApiError.forbidden(`This action requires ${minimum.toLowerCase()} access.`);
  }
  return user;
}

export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireMember();
  if (!can(user.role, permission)) {
    throw ApiError.forbidden(`Your role cannot perform "${permission}".`);
  }
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  return requireRole('ADMIN');
}

/** True when the actor owns the row or outranks it — used for edit/delete. */
export function isOwnerOrModerator(
  actor: Pick<CurrentUser, 'id' | 'role'>,
  ownerId: string,
  ownPermission: Permission,
): boolean {
  if (actor.id === ownerId && can(actor.role, ownPermission)) return true;
  return can(actor.role, 'post:edit:any');
}

export type { CurrentUser };