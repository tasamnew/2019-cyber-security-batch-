/**
 * JWT issuer/audience claims.
 *
 * Kept in a dependency-free module so both the Node runtime (`src/lib/auth.ts`)
 * and the Edge middleware (`src/middleware.ts`) can import them. Importing
 * `@/lib/auth` from middleware would pull in Prisma and `next/headers`, which do
 * not work on the Edge runtime.
 *
 * WARNING: changing these values invalidates every issued session cookie, so
 * anyone holding an old cookie is logged out. That must be paired with clearing
 * the stale cookie, or the app can loop between /login and /dashboard.
 */
export const TOKEN_ISSUER = 'cs';
export const TOKEN_AUDIENCE = 'cs-web';