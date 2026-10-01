import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireAdmin } from '@/lib/guards';
import { adminSettingsSchema } from '@/lib/validation';
import { getSettings, updateSettings } from '@/lib/settings';
import { audit } from '@/lib/audit';

/** GET /api/admin/settings — current runtime configuration. */
export const GET = handler(async () => {
  await requireAdmin();
  return ok({ settings: await getSettings() });
});

/** PATCH /api/admin/settings — toggle registration, maintenance mode, etc. */
export const PATCH = handler(async (req: Request) => {
  const actor = await requireAdmin();

  const body = await req.json().catch(() => {
    throw ApiError.badRequest('Send a JSON body.');
  });
  const input = adminSettingsSchema.parse(body);

  const before = await getSettings();
  const after = await updateSettings(input);

  // Build a before/after diff of only the keys that actually changed.
  const prev = before as unknown as Record<string, unknown>;
  const next = after as unknown as Record<string, unknown>;
  const changes: Record<string, Prisma.InputJsonObject> = {};
  for (const key of Object.keys(input)) {
    if (prev[key] !== next[key]) {
      changes[key] = {
        from: (prev[key] ?? null) as Prisma.InputJsonValue,
        to: (next[key] ?? null) as Prisma.InputJsonValue,
      };
    }
  }

  await audit({
    actorId: actor.id,
    action: 'admin.settings.update',
    entityType: 'SETTING',
    entityId: 'global',
    metadata: { changes } as Prisma.InputJsonObject,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  });

  return ok({ settings: after });
});