import { db } from '@/lib/db';

/**
 * Runtime settings backed by the AppSetting key/value table with in-process
 * caching. Values are JSON so booleans survive the round trip.
 *
 * Settings are read on nearly every request (e.g. maintenance mode), so they are
 * cached briefly; `invalidateSettingsCache()` is called by the admin settings
 * route after a write.
 */

export interface SiteSettings {
  siteName: string;
  registrationOpen: boolean;
  requireApproval: boolean;
  maintenanceMode: boolean;
  allowGuests: boolean;
  maxUploadMb: number;
}

export const DEFAULT_SETTINGS: SiteSettings = {
  siteName: 'CS',
  registrationOpen: true,
  requireApproval: true,
  maintenanceMode: false,
  allowGuests: false,
  maxUploadMb: 25,
};

type SettingKey = keyof SiteSettings;

const CACHE_TTL_MS = 15_000;
let cache: { value: SiteSettings; expiresAt: number } | null = null;

export function invalidateSettingsCache(): void {
  cache = null;
}

export async function getSettings(): Promise<SiteSettings> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  const rows = await db.appSetting.findMany();
  const value: SiteSettings = { ...DEFAULT_SETTINGS };

  for (const row of rows) {
    const key = row.key as SettingKey;
    if (!(key in DEFAULT_SETTINGS)) continue;
    const raw = row.value;
    // Postgres returns JsonValue; validate the shape rather than trusting it.
    const target = value as unknown as Record<string, unknown>;
    const fallback = DEFAULT_SETTINGS[key];
    if (typeof raw === typeof fallback) {
      target[key] = raw as never;
    }
  }

  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

export async function updateSettings(patch: Partial<SiteSettings>): Promise<SiteSettings> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return getSettings();

  await db.$transaction(
    entries.map(([key, val]) =>
      db.appSetting.upsert({
        where: { key },
        create: { key, value: val as never },
        update: { value: val as never },
      }),
    ),
  );

  invalidateSettingsCache();
  return getSettings();
}