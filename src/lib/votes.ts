import { db } from '@/lib/db';

/**
 * Post/comment listing with vote aggregation.
 *
 * Vote is polymorphic, so the score comes from a grouped query rather than a
 * relation. Doing this in one round trip keeps the forum list to 2 queries.
 */

export interface VoteAggregate {
  score: number;
  upvotes: number;
  downvotes: number;
}

const EMPTY_AGG: VoteAggregate = { score: 0, upvotes: 0, downvotes: 0 };

/**
 * Aggregate vote totals for a set of targets in one query.
 * Returns a map keyed by target id.
 */
export async function getVoteAggregates(
  targetType: 'POST' | 'COMMENT',
  targetIds: string[],
): Promise<Map<string, VoteAggregate>> {
  const result = new Map<string, VoteAggregate>();
  if (targetIds.length === 0) return result;
  for (const id of targetIds) result.set(id, EMPTY_AGG);

  const rows = await db.vote.groupBy({
    by: ['targetId', 'value'],
    where: { targetType, targetId: { in: targetIds } },
    _count: { _all: true },
  });

  for (const row of rows) {
    const current = result.get(row.targetId) ?? EMPTY_AGG;
    const count = row._count._all;
    result.set(row.targetId, {
      score: current.score + row.value * count,
      upvotes: current.upvotes + (row.value === 1 ? count : 0),
      downvotes: current.downvotes + (row.value === -1 ? count : 0),
    });
  }

  return result;
}

/** Sum of a vote column for one target. */
async function sumVotes(targetType: string, targetId: string): Promise<number> {
  const agg = await db.vote.aggregate({
    where: { targetType, targetId },
    _sum: { value: true },
  });
  return agg._sum.value ?? 0;
}

/** Which targets has this user voted on, and how? Used to render the button state. */
export async function getUserVotes(
  userId: string,
  targetType: 'POST' | 'COMMENT',
  targetIds: string[],
): Promise<Map<string, number>> {
  if (targetIds.length === 0) return new Map();
  const rows = await db.vote.findMany({
    where: { userId, targetType, targetId: { in: targetIds } },
    select: { targetId: true, value: true },
  });
  return new Map(rows.map((r) => [r.targetId, r.value]));
}

/**
 * Apply an up/down/clear vote. Returns the recomputed aggregate.
 * Idempotent: sending the same value twice leaves a single vote row.
 */
export async function castVote(
  userId: string,
  targetType: 'POST' | 'COMMENT',
  targetId: string,
  value: 1 | -1 | 0,
): Promise<VoteAggregate> {
  if (value === 0) {
    await db.vote.deleteMany({ where: { userId, targetType, targetId } });
  } else {
    await db.vote.upsert({
      where: { userId_targetType_targetId: { userId, targetType, targetId } },
      create: { userId, targetType, targetId, value },
      update: { value },
    });
  }

  // Comments cache their score on the row so the UI can sort without a join.
  if (targetType === 'COMMENT') {
    const score = await sumVotes(targetType, targetId);
    await db.comment.update({ where: { id: targetId }, data: { score } });
  }

  const aggregates = await getVoteAggregates(targetType, [targetId]);
  return aggregates.get(targetId) ?? EMPTY_AGG;
}