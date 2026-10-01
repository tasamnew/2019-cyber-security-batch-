import { cookies, headers } from 'next/headers';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import type { Role, UserStatus } from '@prisma/client';

/**
 * Stateless access token + a server-side Session row.
 *
 * The JWT carries the identity and is signed with HS256. Every authenticated
 * request additionally checks that the `sid` claim still resolves to a live
 * Session row, which makes logout and admin-initiated revocation immediate
 * instead of waiting for the token to expire.
 */

const secretKey = new TextEncoder().encode(env.authSecret);

export interface AccessTokenClaims {
  sub: string; // user id
  sid: string; // session id
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  /** Standard JWT exp, seconds since epoch. */
  exp?: number;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  bio: string | null;
  avatarSeed: string;
  createdAt: Date;
  sessionId: string;
}

const ISSUER = 'cs';
const AUDIENCE = 'cs-web';

export async function createSession(
  user: { id: string; email: string; name: string; role: Role; status: UserStatus },
  meta: { ip?: string; userAgent?: string },
): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const sessionId = randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + env.sessionTtlDays * 24 * 60 * 60 * 1000);

  await db.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
      expiresAt,
    },
  });

  const token = await new SignJWT({
    sub: user.id,
    sid: sessionId,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    // The cookie's own expiry is the long one; the token itself is short-lived
    // so a leaked token has a small blast radius.
    .setExpirationTime(env.accessTokenTtl)
    .sign(secretKey);

  return { token, sessionId, expiresAt };
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'], // pinned: prevents alg-confusion attacks
    });
    return payload as unknown as AccessTokenClaims;
  } catch {
    return null;
  }
}

async function readCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(env.cookie.name)?.value ?? null;
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(env.cookie.name, token, {
    httpOnly: true, // not readable from JS → limits XSS impact
    secure: env.cookie.secure, // HTTPS-only in production
    sameSite: 'lax', // blocks cross-site POSTs (CSRF) while keeping normal nav working
    path: '/',
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(env.cookie.name, '', {
    httpOnly: true,
    secure: env.cookie.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

/**
 * Resolve the acting user for a server component / route handler.
 * Returns null when unauthenticated, blocked, or the session was revoked.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = await readCookie();
  if (!token) return null;

  const claims = await verifyAccessToken(token);
  if (!claims?.sub || !claims.sid) return null;

  // Re-check the session and user state on every request so that blocking a user
  // or revoking a session takes effect without waiting for token expiry.
  const session = await db.session.findUnique({
    where: { id: claims.sid },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          bio: true,
          avatarSeed: true,
          createdAt: true,
        },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) return null;
  if (session.user.status === 'BLOCKED') return null;

  const { user } = session;
  return { ...user, sessionId: session.id };
}

/**
 * Same as getCurrentUser but also allows PENDING users through.
 * Used by the "awaiting approval" screen so members can see why they can't post.
 */
export async function getCurrentUserAnyStatus(): Promise<CurrentUser | null> {
  return getCurrentUser();
}

export async function destroySession(sessionId: string): Promise<void> {
  await db.session.deleteMany({ where: { id: sessionId } });
}

/** Best-effort client IP from proxy headers. */
export async function getRequestMeta(): Promise<{ ip?: string; userAgent?: string }> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  return {
    ip: forwarded?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? undefined,
    userAgent: h.get('user-agent') ?? undefined,
  };
}

export type { JWTPayload };