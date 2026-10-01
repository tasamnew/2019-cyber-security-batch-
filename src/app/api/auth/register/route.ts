import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { enforceRateLimit, limitKey } from '@/lib/rate-limit';
import { registerSchema } from '@/lib/validation';
import { hashPassword } from '@/lib/password';
import { getSettings } from '@/lib/settings';
import { avatarColor } from '@/lib/utils';

/**
 * POST /api/auth/register
 *
 * Creates the account in PENDING state. Nothing is granted until an admin
 * approves it — that is what restricts the hub to 2019 group members.
 */
export const POST = handler(async (req: Request) => {
  const settings = await getSettings();

  if (!settings.registrationOpen) {
    throw ApiError.forbidden('Registration is currently closed. Contact an admin.');
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  // 5 registrations per hour per IP: enough for a shared lab PC, low enough to
  // stop scripted signups.
  enforceRateLimit(`register:${ip}`, 5, 60 * 60 * 1000);

  const body = await req.json().catch(() => {
    throw ApiError.badRequest('Send a JSON body.');
  });
  const input = registerSchema.parse(body);

  const existing = await db.user.findUnique({
    where: { email: input.email },
    select: { id: true, status: true },
  });
  if (existing) {
    throw ApiError.conflict('An account with that email already exists.');
  }

  const passwordHash = await hashPassword(input.password);

  const user = await db.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash,
      bio: input.bio ?? null,
      status: 'PENDING',
      role: 'STUDENT',
      avatarSeed: avatarColor(input.email),
    },
    select: { id: true, email: true, name: true, status: true },
  });

  // Issue a verification token. In a real deployment this is emailed; the token
  // is returned only when EMAIL_DELIVERY is not configured so local setup works.
  const token = randomBytes(32).toString('hex');
  await db.verificationToken.create({
    data: {
      email: user.email,
      token,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  if (process.env.NODE_ENV !== 'production') {
    console.info(`[auth] verification link for ${user.email}: /api/auth/verify-email?token=${token}`);
  }

  return ok(
    {
      user,
      message: 'Registration submitted. An admin must approve your account before you can sign in.',
      ...(process.env.NODE_ENV !== 'production' ? { devVerificationToken: token } : {}),
    },
    201,
  );
});