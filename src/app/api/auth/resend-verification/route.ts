import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { handler, ok } from '@/lib/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { emailSchema } from '@/lib/validation';

/**
 * POST /api/auth/resend-verification
 * Always returns 200 so the response cannot be used to test whether an email is
 * registered.
 */
export const POST = handler(async (req: Request) => {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  enforceRateLimit(`resend-verify:${ip}`, 5, 60 * 60 * 1000);

  const body = await req.json().catch(() => ({ email: '' }));
  const parsed = emailSchema.safeParse(body?.email);
  if (!parsed.success) {
    return ok({ message: 'If that account exists, a new link has been sent.' });
  }

  const user = await db.user.findUnique({
    where: { email: parsed.data },
    select: { id: true, email: true },
  });

  if (user) {
    const token = randomBytes(32).toString('hex');
    await db.verificationToken.create({
      data: { email: user.email, token, expiresAt: new Date(Date.now() + 86400000) },
    });
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[auth] new verification link for ${user.email}: /api/auth/verify-email?token=${token}`);
    }
  }

  return ok({ message: 'If that account exists, a new link has been sent.' });
});