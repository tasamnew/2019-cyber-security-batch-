import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { CtfClient } from './ctf-client';

export const metadata: Metadata = { title: 'CTF & Challenges' };
export const dynamic = 'force-dynamic';

export default async function CtfPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [challenges, categories, solves] = await Promise.all([
    db.ctfChallenge.findMany({
      orderBy: [{ difficulty: 'desc' }, { createdAt: 'desc' }],
      include: { createdBy: { select: { id: true, name: true, role: true, avatarSeed: true } } },
    }),
    db.ctfChallenge.findMany({ select: { category: true }, distinct: ['category'] }),
    db.ctfSolve.findMany({
      where: { userId: user.id },
      select: { challengeId: true, points: true, solvedAt: true },
    }),
  ]);

  const solvedIds = new Set(solves.map((s) => s.challengeId));
  const isModerator = user.role === 'ADMIN' || user.role === 'MODERATOR';

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">CTF &amp; Challenges</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            Practice boxes, wargames and weekend competitions.
          </p>
        </div>
        <p className="text-sm text-text-tertiary">
          <span className="font-mono text-lg text-accent-green">{solvedIds.size}</span> solved ·{' '}
          <span className="font-mono text-lg text-accent-cyan">
            {solves.reduce((sum, s) => sum + s.points, 0)}
          </span>{' '}
          pts
        </p>
      </header>

      <CtfClient
        currentUserId={user.id}
        canCreate={isModerator || user.role === 'STUDENT'}
        categories={categories.map((c) => c.category).sort()}
        solvedIds={[...solvedIds]}
        initialChallenges={challenges.map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          url: c.url,
          category: c.category,
          difficulty: c.difficulty,
          points: c.points,
          // Hints and write-ups are spoilers: moderators see them by default.
          hints: isModerator ? c.hints : [],
          hintCount: c.hints.length,
          writeUpUrl: isModerator ? c.writeUpUrl : null,
          createdAt: c.createdAt.toISOString(),
          createdBy: c.createdBy,
          canEdit: isModerator || c.createdBy.id === user.id,
        }))}
      />
    </div>
  );
}