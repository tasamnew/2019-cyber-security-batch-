import { db } from '../src/lib/db';

/**
 * Clear a login lockout.
 *
 * After `MAX_FAILED` (8) wrong passwords the login route sets `lockedUntil`
 * and rejects every attempt for 15 minutes (see src/app/api/auth/login).
 * That is correct for real attackers, but it also locks out the legitimate
 * owner after a typo or a password manager misfire.
 *
 * Usage:
 *   npm run db:unlock -- tasamnew1@gmail.com [more@example.com ...]
 */

async function main() {
  const emails = process.argv
    .slice(2)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (emails.length === 0) {
    console.error('Usage: npm run db:unlock -- <email> [email ...]');
    process.exit(1);
  }

  for (const email of emails) {
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, email: true, failedLoginCount: true, lockedUntil: true },
    });

    if (!user) {
      console.log(`  ${email}: no such user`);
      continue;
    }

    await db.session.deleteMany({ where: { userId: user.id } });
    await db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    const wasLocked = user.lockedUntil && user.lockedUntil > new Date();
    console.log(`  ${email}: unlocked (failedLoginCount reset${wasLocked ? ', was locked' : ''})`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });