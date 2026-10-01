import { db } from '@/lib/db';
import { hashPassword } from '@/lib/password';

/**
 * Bootstrap the configured super-admin account.
 *
 * Reads `SUPERADMIN_EMAIL` (comma-separated list supported). For each address:
 *  - if the account exists, promote it to ADMIN + APPROVED and clear lockouts;
 *  - if it does not exist, create it with `SUPERADMIN_PASSWORD`.
 *
 * This is how the primary owner gets elevated on a fresh deployment without
 * shelling into the database. It is idempotent and safe to run on every boot.
 */
/** True when the address is configured as a protected super-admin. */
export function isSuperadminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.SUPERADMIN_EMAIL;
  if (!raw) return false;
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .includes(email.toLowerCase());
}

export async function ensureSuperadmins(): Promise<string[]> {
  const raw = process.env.SUPERADMIN_EMAIL;
  if (!raw) return [];

  const emails = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const password = process.env.SUPERADMIN_PASSWORD;
  const touched: string[] = [];

  for (const email of emails) {
    const existing = await db.user.findUnique({ where: { email }, select: { id: true, role: true, status: true } });

    if (existing) {
      if (existing.role === 'ADMIN' && existing.status === 'APPROVED') continue;
      await db.user.update({
        where: { id: existing.id },
        data: {
          role: 'ADMIN',
          status: 'APPROVED',
          failedLoginCount: 0,
          lockedUntil: null,
          // A promotion must invalidate any stolen sessions from the old role.
          sessions: { deleteMany: {} },
        },
      });
    } else {
      if (!password) {
        console.warn(
          `[superadmin] Cannot create ${email}: set SUPERADMIN_PASSWORD to auto-create the account.`,
        );
        continue;
      }
      await db.user.create({
        data: {
          email,
          name: 'Super Admin',
          passwordHash: await hashPassword(password),
          role: 'ADMIN',
          status: 'APPROVED',
          avatarSeed: '22c55e',
        },
      });
    }

    touched.push(email);
  }

  if (touched.length > 0) {
    console.log(`[superadmin] ensured admin access for: ${touched.join(', ')}`);
  }
  return touched;
}
