import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { PostComposer } from './post-composer';

export const metadata: Metadata = { title: 'New post' };
export const dynamic = 'force-dynamic';

export default async function NewPostPage() {
  const categories = await db.category.findMany({
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, slug: true, color: true, description: true },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/forum" className="text-xs text-text-tertiary hover:text-accent-cyan">
          ← Back to forum
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-text-primary">Start a discussion</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Share a question, lab result or technique with the group.
        </p>
      </div>

      <div className="card">
        <PostComposer categories={categories} />
      </div>
    </div>
  );
}