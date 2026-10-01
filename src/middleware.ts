import { NextResponse } from 'next/server';
import { TOKEN_ISSUER, TOKEN_AUDIENCE } from '@/lib/token-claims';

/**
 * Edge middleware: coarse access control only.
 *
 * This runs on every request before rendering, so it stays cheap: it verifies
 * the JWT signature with `jose` (edge-compatible) and checks the expiry. It
 * deliberately does NOT touch the database; authoritative checks (session
 * revocation, blocked accounts, maintenance mode) happen in the layout/route
 * handlers via `getCurrentUser()`.
 */

const SESSION_COOKIE = 'cs_session';
const PROTECTED = ['/dashboard', '/forum', '/chat', '/resources', '/ctf', '/assignments', '/admin', '/profile'];
const AUTH_PAGES = ['/login', '/register', '/forgot-password', '/reset-password'];

function isProtected(pathname: string): boolean {
  return PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Presence of a cookie is NOT proof of a session.
 *
 * A revoked session, an expired token, or a rotated AUTH_SECRET all leave the
 * cookie in the browser while making it worthless. Trusting presence alone makes
 * /login bounce to /dashboard, which then bounces back to /login, and the
 * browser gives up with ERR_TOO_MANY_REDIRECTS.
 *
 * So the token is actually verified here (signature + issuer + audience +
 * expiry). This is edge-safe: `jose` only, no database access. Authoritative
 * checks still happen server-side in getCurrentUser().
 */
async function hasValidSession(req: Request): Promise<boolean> {
  const token = req.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);

  if (!token) return false;

  try {
    const { jwtVerify } = await import('jose');
    await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET), {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      algorithms: ['HS256'],
    });
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: Request) {
  const { pathname, search } = new URL(req.url);
  const cookiePresent = req.headers
    .get('cookie')
    ?.split(';')
    .some((c) => c.trim().startsWith(`${SESSION_COOKIE}=`));
  const signedIn = cookiePresent ? await hasValidSession(req) : false;

  // Signed-out users are bounced to login, remembering where they wanted to go.
  if (isProtected(pathname) && !signedIn) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', pathname + search);

    // Drop the stale cookie so the fresh login is not fought by the check above.
    const res = NextResponse.redirect(url);
    if (cookiePresent) res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  }

  // Already signed in? Skip the auth screens.
  if (signedIn && AUTH_PAGES.includes(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/forum/:path*',
    '/chat/:path*',
    '/resources/:path*',
    '/ctf/:path*',
    '/assignments/:path*',
    '/admin/:path*',
    '/profile/:path*',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
  ],
};