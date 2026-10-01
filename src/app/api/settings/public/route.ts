import { db } from '@/lib/db';
import { handler, ok } from '@/lib/api-response';
import { getSettings } from '@/lib/settings';

/**
 * GET /api/settings/public
 *
 * Unauthenticated. Exposes only what the client needs before signing in:
 * whether registration is open, and whether the site is in maintenance mode so
 * the UI can show a banner instead of a broken page.
 */
export const GET = handler(async () => {
  const settings = await getSettings();

  return ok({
    siteName: settings.siteName,
    registrationOpen: settings.registrationOpen,
    maintenanceMode: settings.maintenanceMode,
    allowGuests: settings.allowGuests,
  });
});