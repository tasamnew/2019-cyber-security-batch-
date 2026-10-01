import { db } from '@/lib/db';
import { requireAdminOnlyPage } from '../require-admin';
import { AuditClient } from './audit-client';

export default async function AdminAuditPage() {
  await requireAdminOnlyPage();

  const [entries, total] = await Promise.all([
    db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { actor: { select: { id: true, name: true, role: true, avatarSeed: true } } },
    }),
    db.auditLog.count(),
  ]);

  return (
    <AuditClient
      totalEntries={total}
      initialEntries={entries.map((e) => ({
        id: e.id,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        ip: e.ip,
        metadata: e.metadata,
        createdAt: e.createdAt.toISOString(),
        actor: e.actor,
      }))}
    />
  );
}