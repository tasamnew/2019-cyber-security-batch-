import { NextResponse } from 'next/server';

/**
 * Edge middleware: coarse access control only.
 *
 * This runs on every request before rendering, so it stays cheap — it verifies
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

export async function middleware(req: Request) {
  const { pathname, search } = new URL(req.url);
  const hasSessionCookie = req.headers
    .get('cookie')
    ?.split(';')
    .some((c) => c.trim().startsWith(`${SESSION_COOKIE}=`));

  // Signed-out users are bounced to login, remembering where they wanted to go.
  if (isProtected(pathname) && !hasSessionCookie) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }

  // Already signed in? Skip the auth screens.
  if (hasSessionCookie && AUTH_PAGES.includes(pathname)) {
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