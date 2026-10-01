import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { timeAgo } from '@/lib/utils';

export const metadata: Metadata = { title: 'Awaiting approval' };
export const dynamic = 'force-dynamic';

/**
 * Shown to PENDING and BLOCKED accounts.
 *
 * PENDING accounts are allowed to see this page even though every other
 * authenticated route rejects them — otherwise they would hit a bare 403 with no
 * explanation.
 */
export default async function PendingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Approved members have no business here.
  if (user.status === 'APPROVED') redirect('/dashboard');

  const settings = await getSettings();
  const blocked = user.status === 'BLOCKED';

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="card w-full max-w-lg text-center">
        <div className={`text-3xl ${blocked ? 'text-accent-rose' : 'text-accent-amber'}`}>
          {blocked ? '⊘' : '⏳'}
        </div>

        <h1 className="mt-4 text-xl font-semibold text-text-primary">
          {blocked ? 'Account suspended' : 'Registration received'}
        </h1>

        <p className="mt-2 text-sm text-text-secondary">
          {blocked
            ? 'Your account has been suspended. If you believe this is a mistake, contact an administrator.'
            : 'Thanks for registering. An administrator has to approve your account before you can access the hub — this keeps it restricted to members of the 2019 Cyber Security student group.'}
        </p>

        <dl className="mt-6 space-y-2 rounded-lg border border-border bg-bg-secondary/60 p-4 text-left text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-text-tertiary">Signed in as</dt>
            <dd className="font-medium text-text-primary">{user.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-tertiary">Member since</dt>
            <dd className="text-text-primary">{timeAgo(user.createdAt)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-tertiary">Status</dt>
            <dd className={blocked ? 'text-accent-rose' : 'text-accent-amber'}>{user.status}</dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-secondary">
            Back home
          </Link>
          {!blocked && (
            <Link href={`mailto:admin@${settings.siteName.toLowerCase().replace(/\s+/g, '')}?subject=Account approval`} className="btn-primary">
              Contact an admin
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}