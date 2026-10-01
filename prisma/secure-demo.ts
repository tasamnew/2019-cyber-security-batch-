import { randomBytes } from 'node:crypto';
import { db } from '../src/lib/db';
import { hashPassword } from '../src/lib/password';

/**
 * Production hardening for seeded demo data.
 *
 * `prisma/seed.ts` creates demo accounts on the `@cs2019.local` domain with a
 * well-known password (`ChangeMe!2019`). Those are perfect for local
 * development but must never be usable on a real deployment. This script keeps
 * their content (posts, channels, CTF challenges reference them) but:
 *
 *   - blocks the accounts so they cannot sign in, and
 *   - replaces their password hashes with an unknown random value.
 *
 * The owner in SUPERADMIN_EMAIL is never touched. Idempotent.
 *
 *   DATABASE_URL="<production url>" npm run db:secure-demo
 */

const DEMO_DOMAIN = '@cs2019.local';

async function main() {
  const demo = await db.user.findMany({
    where: { email: { endsWith: DEMO_DOMAIN } },
    select: { id: true, email: true },
  });

  if (demo.length === 0) {
    console.log('No demo accounts found — nothing to do.');
    return;
  }

  const ids = demo.map((u) => u.id);
  const unknownHash = await hashPassword(randomBytes(32).toString('base64url'));

  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.user.updateMany({
    where: { id: { in: ids } },
    data: { status: 'BLOCKED', passwordHash: unknownHash, failedLoginCount: 0, lockedUntil: null },
  });

  console.log(`Blocked ${demo.length} demo account(s):`);
  for (const u of demo) console.log(`  ${u.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
