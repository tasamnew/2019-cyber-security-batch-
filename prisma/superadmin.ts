import { db } from '../src/lib/db';
import { ensureSuperadmins } from '../src/lib/superadmin';

/**
 * Standalone super-admin bootstrap.
 *
 *   SUPERADMIN_EMAIL=you@example.com SUPERADMIN_PASSWORD='...' npm run db:superadmin
 *
 * Promotes existing accounts to ADMIN/APPROVED, or creates them when a password
 * is supplied. Idempotent — safe to run repeatedly. Also runs automatically on
 * server start via src/instrumentation.ts.
 */
async function main() {
  const touched = await ensureSuperadmins();
  if (touched.length === 0) {
    console.log('No SUPERADMIN_EMAIL set (or account needs no change). Nothing to do.');
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
