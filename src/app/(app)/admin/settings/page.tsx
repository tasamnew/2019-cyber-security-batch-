import { db } from '@/lib/db';
import { requireAdminOnlyPage } from '../require-admin';
import { getSettings } from '@/lib/settings';
import { SettingsClient } from './settings-client';

export default async function AdminSettingsPage() {
  await requireAdminOnlyPage();

  const [settings, activeSessions, storage] = await Promise.all([
    getSettings(),
    db.session.count({ where: { expiresAt: { gt: new Date() } } }),
    db.fileAsset.aggregate({ _sum: { sizeBytes: true }, _count: { _all: true } }),
  ]);

  return (
    <SettingsClient
      sessions={activeSessions}
      storage={{
        fileCount: storage._count._all,
        totalBytes: storage._sum.sizeBytes ?? 0,
      }}
      initialSettings={{
        siteName: settings.siteName,
        registrationOpen: settings.registrationOpen,
        requireApproval: settings.requireApproval,
        maintenanceMode: settings.maintenanceMode,
        allowGuests: settings.allowGuests,
        maxUploadMb: settings.maxUploadMb,
      }}
    />
  );
}