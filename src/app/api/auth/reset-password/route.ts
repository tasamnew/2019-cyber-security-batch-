import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resetPasswordSchema } from '@/lib/validation';
import { hashPassword } from '@/lib/password';
import { audit } from '@/lib/audit';

/**
 * POST /api/auth/reset-password
 *
 * On success the token is burned and **every existing session is deleted**, so a
 * password reset immediately locks out anyone holding a stolen cookie.
 */
export const POST = handler(async (req: Request) => {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  enforceRateLimit(`reset:${ip}`, 10, 60 * 60 * 1000);

  const body = await req.json().catch(() => {
    throw ApiError.badRequest('Send a JSON body.');
  });
  const input = resetPasswordSchema.parse(body);

  const record = await db.verificationToken.findUnique({ where: { token: input.token } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw ApiError.badRequest('This reset link is invalid or has expired.');
  }

  const user = await db.user.findUnique({ where: { email: record.email } });
  if (!user) throw ApiError.badRequest('This reset link is invalid or has expired.');

  const passwordHash = await hashPassword(input.password);

  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    }),
    db.verificationToken.update({ where: { token: input.token }, data: { usedAt: new Date() } }),
    // Revoke all sessions, including the user's current one.
    db.session.deleteMany({ where: { userId: user.id } }),
  ]);

  await audit({
    actorId: user.id,
    action: 'auth.password_reset',
    entityType: 'User',
    entityId: user.id,
    ip,
  });

  return ok({ message: 'Password updated. Sign in with your new password.' });
});