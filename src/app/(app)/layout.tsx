import { redirect } from 'next/navigation';
import { getCurrentUser, clearSessionCookie } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { Sidebar } from '@/components/nav';
import { AuthProvider } from '@/hooks/use-auth';
import { UserMenu } from '@/components/user-menu';

export const dynamic = 'force-dynamic';

/**
 * Authenticated app shell.
 *
 * Enforces session validity and approval here, once, instead of repeating the
 * check in every page. Middleware has already redirected anonymous users, so a
 * null user at this point means the session was revoked mid-flight.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    // The cookie may be present but invalid/expired (revoked session, changed
    // issuer, rotated AUTH_SECRET). Clearing it stops the middleware from
    // bouncing /login straight back here, which would loop forever.
    clearSessionCookie();
    redirect('/login');
  }

  if (user.status !== 'APPROVED') redirect('/pending');

  const settings = await getSettings();

  return (
    <AuthProvider
      initialUser={{
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        bio: user.bio,
        avatarSeed: user.avatarSeed,
      }}
    >
      <div className="flex min-h-screen">
        <Sidebar siteName={settings.siteName} />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Desktop top bar with announcements + user menu */}
          <header className="sticky top-0 z-30 hidden items-center justify-end gap-3 border-b border-border bg-bg-primary/80 px-6 py-3 backdrop-blur lg:flex">
            {settings.maintenanceMode && (
              <span className="badge border-accent-amber/40 bg-accent-amber/10 text-accent-amber">
                Maintenance mode
              </span>
            )}
            <UserMenu />
          </header>

          <main id="main" className="min-w-0 flex-1 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}