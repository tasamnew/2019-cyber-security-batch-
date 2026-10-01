import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ProfileClient } from './profile-client';

export const metadata: Metadata = { title: 'Profile' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [profile, postCount, commentCount, solves, sessions] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        bio: true,
        avatarSeed: true,
        createdAt: true,
        lastLoginAt: true,
      },
    }),
    db.post.count({ where: { authorId: user.id, status: 'PUBLISHED' } }),
    db.comment.count({ where: { authorId: user.id, status: 'PUBLISHED' } }),
    db.ctfSolve.findMany({
      where: { userId: user.id },
      orderBy: { solvedAt: 'desc' },
      take: 10,
      include: { challenge: { select: { title: true, difficulty: true, points: true } } },
    }),
    db.session.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, userAgent: true, ip: true, createdAt: true },
    }),
  ]);

  if (!profile) return null;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Your Profile</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Account details, activity and active sessions.
        </p>
      </header>

      <ProfileClient
        sessions={sessions.map((s) => ({
          id: s.id,
          userAgent: s.userAgent,
          ip: s.ip,
          createdAt: s.createdAt.toISOString(),
        }))}
        solves={solves.map((s) => ({
          id: s.id,
          title: s.challenge.title,
          difficulty: s.challenge.difficulty,
          points: s.points,
          solvedAt: s.solvedAt.toISOString(),
        }))}
        stats={{ postCount, commentCount, solveCount: solves.length, totalPoints: solves.reduce((a, s) => a + s.points, 0) }}
        profile={{
          id: profile.id,
          name: profile.name,
          email: profile.email,
          role: profile.role,
          status: profile.status,
          bio: profile.bio,
          avatarSeed: profile.avatarSeed,
          createdAt: profile.createdAt.toISOString(),
          lastLoginAt: profile.lastLoginAt ? profile.lastLoginAt.toISOString() : null,
        }}
      />
    </div>
  );
}