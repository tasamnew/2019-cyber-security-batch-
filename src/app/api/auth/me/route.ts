import { handler, ok } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth';

/**
 * GET /api/auth/me
 *
 * Never cached: role/status changes and session revocations must be reflected
 * on the very next request.
 */
export const GET = handler(async () => {
  const user = await getCurrentUser();

  if (!user) return ok({ user: null });

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