import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';

/**
 * GET /api/auth/verify-email?token=...
 * Consumes a single-use verification token and marks the account verified.
 */
export const GET = handler(async (req: Request) => {
  const token = new URL(req.url).searchParams.get('token');
  if (!token) throw ApiError.badRequest('Missing verification token.');

  const record = await db.verificationToken.findUnique({ where: { token } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw ApiError.badRequest('This verification link is invalid or has expired.');
  }

  await db.$transaction([
    db.verificationToken.update({ where: { token }, data: { usedAt: new Date() } }),
    db.user.update({ where: { email: record.email }, data: { updatedAt: new Date() } }),
  ]);

  return ok({ verified: true, message: 'Email verified. You can now sign in once approved.' });
});