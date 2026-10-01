import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { handler, ok } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { emailSchema } from '@/lib/validation';

/**
 * POST /api/auth/forgot-password
 *
 * Responds identically whether or not the address exists — no enumeration.
 * Password reset tokens live in VerificationToken with a short TTL and are
 * single-use; the token is only returned in non-production for local testing.
 */
export const POST = handler(async (req: Request) => {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  enforceRateLimit(`forgot:${ip}`, 5, 60 * 60 * 1000);

  const body = await req.json().catch(() => ({ email: '' }));
  const parsed = emailSchema.safeParse(body?.email);

  const generic = ok({
    message: 'If that account exists, a reset link has been sent.',
  });
  if (!parsed.success) return generic;

  const user = await db.user.findUnique({
    where: { email: parsed.data },
    select: { id: true, email: true, status: true },
  });

  // Only offer resets for usable accounts, but do not reveal that.
  if (!user || user.status === 'BLOCKED') return generic;

  const token = randomBytes(32).toString('hex');
  await db.verificationToken.create({
    data: {
      email: user.email,
      token,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    },
  });

  if (process.env.NODE_ENV !== 'production') {
    console.info(`[auth] password reset for ${user.email}: /reset-password?token=${token}`);
  }

  return process.env.NODE_ENV !== 'production'
    ? ok({ message: 'Reset link generated (dev mode).', devResetToken: token })
    : generic;
});