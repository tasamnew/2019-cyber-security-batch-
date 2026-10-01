import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { enforceRateLimit, limitKey } from '@/lib/rate-limit';
import { loginSchema } from '@/lib/validation';
import { verifyPassword, fakeVerify } from '@/lib/password';
import {
  createSession,
  setSessionCookie,
  getRequestMeta,
  getCurrentUser,
} from '@/lib/auth';
import { audit } from '@/lib/audit';

/**
 * POST /api/auth/login
 *
 * Defences against credential stuffing and enumeration:
 *  - Per-IP + per-email rate limits.
 *  - Progressive lockout on the User row after repeated failures.
 *  - Constant-ish timing via fakeVerify() when the email is unknown.
 *  - A single generic error message for every failure mode.
 */

const MAX_FAILED = 8;
const LOCKOUT_MS = 15 * 60 * 1000;

export const POST = handler(async (req: Request) => {
  const body = await req.json().catch(() => {
    throw ApiError.badRequest('Send a JSON body.');
  });
  const input = loginSchema.parse(body);

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  enforceRateLimit(limitKey(req, 'login', ip), 20, 15 * 60 * 1000);
  enforceRateLimit(`login:email:${input.email}`, 10, 15 * 60 * 1000);

  const user = await db.user.findUnique({ where: { email: input.email } });

  if (!user) {
    await fakeVerify(); // equalise timing so account existence isn't leaked
    throw ApiError.unauthorized('Incorrect email or password.');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new ApiError(
      423,
      'LOCKED',
      `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`,
    );
  }

  const valid = await verifyPassword(input.password, user.passwordHash);

  if (!valid) {
    const failed = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCKOUT_MS) : null,
      },
    });
    await audit({
      actorId: null,
      action: 'auth.login_failed',
      entityType: 'User',
      entityId: user.id,
      ip,
      userAgent: req.headers.get('user-agent') ?? null,
    });
    throw ApiError.unauthorized('Incorrect email or password.');
  }

  // Credentials are correct — now check account standing.
  if (user.status === 'BLOCKED') {
    throw ApiError.forbidden('Your account has been suspended. Contact an admin.');
  }

  if (user.status === 'PENDING') {
    throw ApiError.forbidden(
      'Your registration is still awaiting admin approval.',
    );
  }

  const meta = await getRequestMeta();
  const { token, expiresAt } = await createSession(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
    },
    { ip: meta.ip, userAgent: meta.userAgent },
  );

  await setSessionCookie(token, expiresAt);

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  await audit({
    actorId: user.id,
    action: 'auth.login',
    entityType: 'User',
    entityId: user.id,
    ip,
    userAgent: req.headers.get('user-agent') ?? null,
  });

  return ok({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      bio: user.bio,
      avatarSeed: user.avatarSeed,
    },
  });
});

/** GET /api/auth/login — useful for a quick session probe. */
export const GET = handler(async () => {
  const user = await getCurrentUser();
  return ok({ authenticated: Boolean(user) });
});