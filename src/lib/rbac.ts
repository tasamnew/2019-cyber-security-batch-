import type { Role } from '@prisma/client';

/**
 * Central role/permission table.
 *
 * Roles are ordered; `roleAtLeast` is the single place that decides whether an
 * actor may perform an action. Never sprinkle role string comparisons across
 * route handlers — use `can` / `roleAtLeast` so the ladder stays in one file.
 */

const RANK: Record<Role, number> = {
  GUEST: 0,
  STUDENT: 1,
  MODERATOR: 2,
  ADMIN: 3,
};

export function roleAtLeast(actual: Role, required: Role): boolean {
  return RANK[actual] >= RANK[required];
}

export type Permission =
  | 'post:create'
  | 'post:edit:own'
  | 'post:edit:any'
  | 'post:delete:own'
  | 'post:delete:any'
  | 'post:pin'
  | 'comment:create'
  | 'comment:edit:own'
  | 'comment:delete:own'
  | 'comment:delete:any'
  | 'channel:create'
  | 'channel:manage'
  | 'message:delete:own'
  | 'message:delete:any'
  | 'resource:upload'
  | 'resource:delete:own'
  | 'resource:delete:any'
  | 'ctf:create'
  | 'ctf:manage:any'
  | 'assignment:create'
  | 'assignment:update:own'
  | 'assignment:update:any'
  | 'assignment:delete:own'
  | 'assignment:delete:any'
  | 'announcement:create'
  | 'announcement:manage'
  | 'report:create'
  | 'report:resolve'
  | 'user:view'
  | 'user:manage:status'
  | 'user:manage:role'
  | 'settings:manage'
  | 'audit:view';

const PERMISSIONS: Record<Permission, Role> = {
  'post:create': 'STUDENT',
  'post:edit:own': 'STUDENT',
  'post:delete:own': 'STUDENT',

  'comment:create': 'STUDENT',
  'comment:edit:own': 'STUDENT',
  'comment:delete:own': 'STUDENT',

  'resource:upload': 'STUDENT',
  'resource:delete:own': 'STUDENT',
  'message:delete:own': 'STUDENT',

  'assignment:create': 'STUDENT',
  'assignment:update:own': 'STUDENT',
  'assignment:delete:own': 'STUDENT',

  'ctf:create': 'STUDENT',
  'report:create': 'STUDENT',

  // Everything below requires moderator or above.
  'post:edit:any': 'MODERATOR',
  'post:delete:any': 'MODERATOR',
  'post:pin': 'MODERATOR',
  'comment:delete:any': 'MODERATOR',
  'channel:create': 'MODERATOR',
  'channel:manage': 'MODERATOR',
  'message:delete:any': 'MODERATOR',
  'resource:delete:any': 'MODERATOR',
  'ctf:manage:any': 'MODERATOR',
  'report:resolve': 'MODERATOR',
  'user:view': 'MODERATOR',

  // Admin-only.
  'assignment:update:any': 'ADMIN',
  'assignment:delete:any': 'ADMIN',
  'announcement:create': 'ADMIN',
  'announcement:manage': 'ADMIN',
  'user:manage:status': 'ADMIN',
  'user:manage:role': 'ADMIN',
  'settings:manage': 'ADMIN',
  'audit:view': 'ADMIN',
};

export function can(role: Role, permission: Permission): boolean {
  return roleAtLeast(role, PERMISSIONS[permission]);
}

/** Roles a given actor is allowed to grant. Admins cannot mint other admins. */
export function assignableRoles(actorRole: Role): Role[] {
  if (actorRole !== 'ADMIN') return [];
  return ['GUEST', 'STUDENT', 'MODERATOR'];
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  MODERATOR: 'Moderator',
  STUDENT: 'Student',
  GUEST: 'Guest',
};