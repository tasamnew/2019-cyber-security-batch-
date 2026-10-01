import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ResourcesClient } from './resources-client';
import { env } from '@/lib/env';

export const metadata: Metadata = { title: 'Resources' };
export const dynamic = 'force-dynamic';

export default async function ResourcesPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [resources, tagRows] = await Promise.all([
    db.resource.findMany({
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: {
        uploadedBy: { select: { id: true, name: true, role: true, avatarSeed: true } },
        file: {
          select: { id: true, originalName: true, mimeType: true, sizeBytes: true, downloadCount: true },
        },
      },
    }),
    db.resource.findMany({ select: { tags: true } }),
  ]);

  const tagSet = new Set<string>();
  for (const row of tagRows) for (const tag of row.tags) tagSet.add(tag);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Resource Library</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Lab guides, cheat sheets, write-ups and reference material shared by the group.
        </p>
      </header>

      <ResourcesClient
        currentUserId={user.id}
        maxUploadMb={env.maxUploadMb}
        initialTags={[...tagSet].sort()}
        initialResources={resources.map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          tags: r.tags,
          kind: r.kind,
          url: r.url,
          createdAt: r.createdAt.toISOString(),
          uploadedBy: r.uploadedBy,
          file: r.file
            ? {
                id: r.file.id,
                originalName: r.file.originalName,
                mimeType: r.file.mimeType,
                sizeBytes: r.file.sizeBytes,
                downloadCount: r.file.downloadCount,
              }
            : null,
        }))}
      />
    </div>
  );
}