/**
 * Next.js instrumentation hook — runs once when the server process starts.
 *
 * Used to guarantee the owner account configured via SUPERADMIN_EMAIL is an
 * approved ADMIN on every boot, which is the only practical way to provision an
 * owner on hosts that give no shell access (e.g. Firebase App Hosting).
 */
export async function register() {
  // Only run in the Node.js server runtime, and never during `next build`.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (!process.env.DATABASE_URL) return;

  try {
    const { ensureSuperadmins } = await import('@/lib/superadmin');
    await ensureSuperadmins();
  } catch (err) {
    // Never block server startup on a bootstrap failure (e.g. DB unreachable).
    console.error('[instrumentation] superadmin bootstrap skipped:', err);
  }
}
