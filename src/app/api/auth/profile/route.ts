import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireUser } from '@/lib/guards';
import { updateProfileSchema } from '@/lib/validation';
import { hashPassword, verifyPassword } from '@/lib/password';
import { createSession, setSessionCookie, getRequestMeta } from '@/lib/auth';
import { audit } from '@/lib/audit';

/**
 * PATCH /api/auth/profile — update name, bio, avatar colour, or password.
 *
 * Changing the password drops every session, then re-issues the caller's so they
 * stay signed in while anyone holding a stolen cookie is locked out.
 */
export const PATCH = handler(async (req: Request) => {
  const actor = await requireUser();

  const body = await req.json().catch(() => {
    throw ApiError.badRequest('Send a JSON body.');
  });
  const input = updateProfileSchema.parse(body);

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.bio !== undefined) data.bio = input.bio || null;
  if (input.avatarSeed !== undefined) data.avatarSeed = input.avatarSeed;

  let passwordChanged = false;

  if (input.newPassword) {
    if (!input.currentPassword) {
      throw ApiError.badRequest('Enter your current password to set a new one.');
    }

    const record = await db.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: { passwordHash: true },
    });

    if (!(await verifyPassword(input.currentPassword, record.passwordHash))) {
      throw ApiError.unauthorized('Your current password is incorrect.');
    }

    data.passwordHash = await hashPassword(input.newPassword);
    passwordChanged = true;

    // Revoke all sessions including this one.
    await db.session.deleteMany({ where: { userId: actor.id } });
  }

  const updated = await db.user.update({
    where: { id: actor.id },
    data: data as never,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      bio: true,
      avatarSeed: true,
    },
  });

  if (passwordChanged) {
    const meta = await getRequestMeta();
    const { token, expiresAt } = await createSession(
      {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        status: updated.status,
      },
      { ip: meta.ip, userAgent: meta.userAgent },
    );
    await setSessionCookie(token, expiresAt);
  }

  await audit({
    actorId: actor.id,
    action: passwordChanged ? 'user.password_changed' : 'user.profile_updated',
    entityType: 'User',
    entityId: actor.id,
    metadata: { fields: Object.keys(data).filter((k) => k !== 'passwordHash') },
  });

  return ok({ user: updated });
});