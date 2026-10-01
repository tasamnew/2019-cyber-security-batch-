import { db } from '../src/lib/db';
import { hashPassword, checkPasswordStrength, verifyPassword } from '../src/lib/password';

/**
 * Set a user's password from the command line.
 *
 * Useful when the owner is locked out or migrating an account onto a new
 * deployment. Existing sessions are revoked so a stolen cookie cannot survive
 * the change, and any active lockout is cleared.
 *
 * Usage:
 *   npm run db:set-password -- <email> <newPassword>
 */

async function main() {
  const [email, password] = process.argv.slice(2);

  if (!email || !password) {
    console.error('Usage: npm run db:set-password -- <email> <newPassword>');
    process.exit(1);
  }

  const strength = checkPasswordStrength(password);
  if (!strength.ok) {
    console.error(`Refusing to set password: ${strength.message}`);
    process.exit(1);
  }

  const normalised = email.trim().toLowerCase();
  const user = await db.user.findUnique({
    where: { email: normalised },
    select: { id: true, email: true, status: true, role: true, passwordHash: true },
  });

  if (!user) {
    console.error(`No such user: ${normalised}`);
    process.exit(1);
  }

  const alreadyCorrect = await verifyPassword(password, user.passwordHash);
  if (!alreadyCorrect) {
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password) },
    });
  }

  await db.session.deleteMany({ where: { userId: user.id } });
  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null },
  });

  console.log(`Password updated for ${user.email} (${user.role}, ${user.status}).`);
  console.log('All existing sessions revoked and any lockout cleared.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });