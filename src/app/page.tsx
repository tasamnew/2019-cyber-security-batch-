import Link from 'next/link';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { LandingNav } from './landing-nav';

export const metadata: Metadata = {
  title: 'CS Hub — 2019 Cyber Security Student Group',
};

export default async function LandingPage() {
  // Already signed in? Skip the marketing page entirely.
  const user = await getCurrentUser();
  if (user?.status === 'APPROVED') {
    const { redirect } = await import('next/navigation');
    redirect('/dashboard');
  }

  const settings = await getSettings();

  return (
    <div className="flex min-h-screen flex-col">
      <LandingNav siteName={settings.siteName} />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                'linear-gradient(rgba(61,245,163,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(61,245,163,0.06) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />
          <div className="relative mx-auto max-w-6xl px-6 py-20 sm:py-28">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent-green/30 bg-accent-green/5 px-3 py-1 font-mono text-xs text-accent-green">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-green" />
              2019 CYBER SECURITY STUDENT GROUP
            </div>

            <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-text-primary sm:text-6xl">
              Think like an attacker.
              <span className="block text-accent-green">Build like a defender.</span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-secondary">
              A private collaboration hub for our group — technical discussions, live chat,
              shared lab guides, CTF practice and deadline tracking in one place.
            </p>

            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                href={user ? '/pending' : '/register'}
                className="btn-primary px-6 py-3 text-base"
              >
                {user ? 'Awaiting approval' : 'Join the group'}
              </Link>
              <Link href="/login" className="btn-secondary px-6 py-3 text-base">
                Sign in
              </Link>
            </div>

            {!settings.registrationOpen && (
              <p className="mt-4 text-sm text-accent-amber">
                Registration is currently closed. Ask an admin to add you.
              </p>
            )}
          </div>
        </section>

        {/* Feature grid */}
        <section className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-center text-2xl font-semibold text-text-primary">
            Everything the group needs, nothing it doesn&apos;t
          </h2>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: '◈',
                title: 'Discussion Forums',
                body: 'Network security, ethical hacking, cryptography and CTF write-ups — with markdown and syntax-highlighted code.',
              },
              {
                icon: '▲',
                title: 'Live Group Chat',
                body: 'Topic channels for quick questions and direct messages between members. Real-time via Socket.io.',
              },
              {
                icon: '⬢',
                title: 'Resource Repository',
                body: 'Lab guides, PDF books, cheat sheets and past papers. Tagged and searchable.',
              },
              {
                icon: '⚑',
                title: 'CTF & Practice',
                body: 'Active challenges, spoiler-gated hints and write-ups shared by the group.',
              },
              {
                icon: '▦',
                title: 'Assignment Tracker',
                body: 'A shared board for deadlines, labs, exams and project submissions.',
              },
              {
                icon: '⚙',
                title: 'Admin Dashboard',
                body: 'Approve registrations, moderate content, review analytics and broadcast announcements.',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="group rounded-xl border border-border bg-surface/60 p-6 transition hover:border-accent-green/40 hover:bg-surface"
              >
                <div className="text-2xl text-accent-green">{feature.icon}</div>
                <h3 className="mt-4 font-semibold text-text-primary">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-6xl px-6 text-center font-mono text-xs text-text-tertiary">
          CS Hub · private to the 2019 Cyber Security student group
        </div>
      </footer>
    </div>
  );
}