import { handler, ok } from '@/lib/api-response';
import { getCurrentUser, clearSessionCookie, destroySession } from '@/lib/auth';

/** POST /api/auth/logout — deletes the server session and clears the cookie. */
export const POST = handler(async () => {
  const user = await getCurrentUser();
  if (user) await destroySession(user.sessionId);
  await clearSessionCookie();
  return ok({ success: true });
});