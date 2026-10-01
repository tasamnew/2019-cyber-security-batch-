import { PrismaClient, Role, UserStatus, PostStatus, CtfDifficulty, AssignmentType, AssignmentStatus } from '@prisma/client';
import { hashPassword } from '../src/lib/password';
import { hashFlag } from '../src/lib/flags';
import { ensureSuperadmins } from '../src/lib/superadmin';

const prisma = new PrismaClient();

/**
 * Development seed for the 2019 cohort hub.
 *
 * Creates the admin/moderator accounts, forum categories, channels, sample
 * content and a couple of CTF challenges. Safe to re-run: every write is an
 * upsert keyed on a natural unique column.
 */

const PASSWORD = 'ChangeMe!2019';

async function main() {
  const passwordHash = await hashPassword(PASSWORD);

  // ---------------------------------------------------------------- users
  const admin = await prisma.user.upsert({
    where: { email: 'admin@cs2019.local' },
    update: {},
    create: {
      email: 'admin@cs2019.local',
      name: 'Site Admin',
      passwordHash,
      role: Role.ADMIN,
      status: UserStatus.APPROVED,
      bio: 'Runs the 2019 cohort hub.',
      avatarSeed: '22c55e',
    },
  });

  const moderator = await prisma.user.upsert({
    where: { email: 'mod@cs2019.local' },
    update: {},
    create: {
      email: 'mod@cs2019.local',
      name: 'Lead Moderator',
      passwordHash,
      role: Role.MODERATOR,
      status: UserStatus.APPROVED,
      bio: 'Keeps the forum tidy.',
      avatarSeed: '06b6d4',
    },
  });

  const alice = await prisma.user.upsert({
    where: { email: 'alice@cs2019.local' },
    update: {},
    create: {
      email: 'alice@cs2019.local',
      name: 'Alice Rahman',
      passwordHash,
      role: Role.STUDENT,
      status: UserStatus.APPROVED,
      bio: 'Reverse engineering and CTFs.',
      avatarSeed: 'a855f7',
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: 'bob@cs2019.local' },
    update: {},
    create: {
      email: 'bob@cs2019.local',
      name: 'Bob Chatterjee',
      passwordHash,
      role: Role.STUDENT,
      status: UserStatus.APPROVED,
      bio: 'Web app security.',
      avatarSeed: 'f43f5e',
    },
  });

  // One account left pending so the admin approval queue is not empty.
  await prisma.user.upsert({
    where: { email: 'newcomer@cs2019.local' },
    update: {},
    create: {
      email: 'newcomer@cs2019.local',
      name: 'Pending Member',
      passwordHash,
      role: Role.GUEST,
      status: UserStatus.PENDING,
    },
  });

  // ------------------------------------------------------------ categories
  const categories = [
    { slug: 'announcements', name: 'Announcements', description: 'Course and cohort news.', color: '#f59e0b', sortOrder: 1 },
    { slug: 'network-security', name: 'Network Security', description: 'Recon, scanning, protocols.', color: '#22c55e', sortOrder: 2 },
    { slug: 'web-security', name: 'Web Security', description: 'OWASP, web vulns, secure coding.', color: '#06b6d4', sortOrder: 3 },
    { slug: 'cryptography', name: 'Cryptography', description: 'Applied crypto and CTF puzzles.', color: '#a855f7', sortOrder: 4 },
    { slug: 'career', name: 'Career & CTF', description: 'Interviews, certifications, competitions.', color: '#f43f5e', sortOrder: 5 },
  ];

  const categoryRows = await Promise.all(
    categories.map((category) =>
      prisma.category.upsert({
        where: { slug: category.slug },
        update: { name: category.name, description: category.description, color: category.color, sortOrder: category.sortOrder },
        create: { ...category },
      }),
    ),
  );

  const bySlug = Object.fromEntries(categoryRows.map((c) => [c.slug, c]));

  // ----------------------------------------------------------------- posts
  const posts = [
    {
      slug: 'welcome-to-the-2019-cohort-hub',
      title: 'Welcome to the 2019 cohort hub',
      category: 'announcements',
      author: admin,
      isPinned: true,
      body: [
        'This is our shared workspace for the **2019 Cyber Security cohort**.',
        '',
        '- Post questions in the matching category',
        '- Share tools and write-ups under Resources',
        '- Use the assignment board to claim labs',
        '- Report anything abusive — moderators see it immediately',
      ].join('\n'),
    },
    {
      slug: 'nmap-cheatsheet-thread',
      title: 'Nmap cheat sheet for the recon lab',
      category: 'network-security',
      author: alice,
      isPinned: false,
      body: [
        'Quick reference for the recon lab. Replace the placeholders before scanning anything outside our lab range.',
        '',
        '```bash',
        'nmap -sn 10.0.0.0/24          # host discovery',
        'nmap -sV -p- --min-rate 1000 # full port scan with version detection',
        'nmap -sC -sV -A -oA out.txt  # default scripts + OS guess',
        '```',
        '',
        'Always get written scope approval before scanning.',
      ].join('\n'),
    },
    {
      slug: 'sql-injection-prevention-thread',
      title: 'Preventing SQL injection in our class project',
      category: 'web-security',
      author: bob,
      isPinned: false,
      body: [
        'Reminders for the web app project:',
        '',
        '1. **Never** build SQL by string concatenation.',
        '2. Use parameterised queries (`$queryRawUnsafe` with `Prisma.sql` tagged templates).',
        '3. Validate every input with Zod before it reaches the database.',
        '4. Return generic errors — stack traces leak schema details.',
      ].join('\n'),
    },
    {
      slug: 'modular-multiplication-basics',
      title: 'Modular arithmetic basics for the crypto lab',
      category: 'cryptography',
      author: alice,
      isPinned: false,
      body: [
        'A short primer before the crypto lab.',
        '',
        '- Modular arithmetic wraps around a modulus: `a mod n`.',
        '- Modular inverses exist only when `gcd(a, n) = 1`.',
        '- RSA relies on efficient modular exponentiation, not on the secret being secret by maths.',
        '',
        'Python: `pow(base, exp, modulus)` already does the fast version.',
      ].join('\n'),
    },
  ];

  const postRows = await Promise.all(
    posts.map((post) =>
      prisma.post.upsert({
        where: { slug: post.slug },
        update: {},
        create: {
          slug: post.slug,
          title: post.title,
          body: post.body,
          categoryId: bySlug[post.category].id,
          authorId: post.author.id,
          isPinned: post.isPinned,
          status: PostStatus.PUBLISHED,
          tags: [post.category],
        },
      }),
    ),
  );

  // -------------------------------------------------------------- comments
  const welcomePost = postRows[0];
  const existingComments = await prisma.comment.count({ where: { postId: welcomePost.id } });
  if (existingComments === 0) {
    await prisma.comment.createMany({
      data: [
        { postId: welcomePost.id, authorId: alice.id, body: 'Glad this exists — no more scattered Drive folders.' },
        { postId: welcomePost.id, authorId: bob.id, body: 'Can we pin a lab-schedule thread too?' },
      ],
    });
  }

  // -------------------------------------------------------------- channels
  const channels = [
    { slug: 'general', name: 'general', topic: 'Day-to-day chatter', kind: 'PUBLIC' as const },
    { slug: 'labs', name: 'labs', topic: 'Lab work and walkthroughs', kind: 'PUBLIC' as const },
    { slug: 'ctf-team', name: 'ctf-team', topic: 'Competition prep', kind: 'PRIVATE' as const },
  ];

  const channelRows = await Promise.all(
    channels.map((channel) =>
      prisma.channel.upsert({
        where: { slug: channel.slug },
        update: {},
        create: {
          slug: channel.slug,
          name: channel.name,
          topic: channel.topic,
          kind: channel.kind,
          createdById: moderator.id,
        },
      }),
    ),
  );

  // Seed membership so the private channel is visible to the right people.
  for (const channel of channelRows) {
    for (const user of [admin, moderator, alice, bob]) {
      await prisma.channelMember.upsert({
        where: { userId_channelId: { userId: user.id, channelId: channel.id } },
        update: {},
        create: { channelId: channel.id, userId: user.id },
      });
    }
  }

  const general = channelRows[0];
  const messageCount = await prisma.message.count({ where: { channelId: general.id } });
  if (messageCount === 0) {
    await prisma.message.createMany({
      data: [
        { channelId: general.id, senderId: moderator.id, body: 'Welcome back everyone. First CTF practice is Friday.', type: 'TEXT' },
        { channelId: general.id, senderId: alice.id, body: 'Works for me.', type: 'TEXT' },
      ],
    });
  }

  // ----------------------------------------------------------------- CTFs
  const challenges = [
    {
      title: 'Find the flag in the HTML',
      description: 'The flag is hidden in plain sight. Fetch the page and read the source.',
      category: 'web',
      difficulty: CtfDifficulty.EASY,
      points: 50,
      hints: ['Comments are a good place to look.', 'View page source, not the rendered DOM.'],
      flag: 'CSHUB{easy_start}',
      writeUpUrl: null,
      author: moderator,
    },
    {
      title: 'Crack the ROT13 note',
      description: 'A short note was left behind in a substitution cipher. Recover the flag.',
      category: 'crypto',
      difficulty: CtfDifficulty.EASY,
      points: 75,
      hints: ['13 is the classic shift.'],
      flag: 'CSHUB{rot_thirteen}',
      writeUpUrl: null,
      author: alice,
    },
    {
      title: 'Steal the admin cookie',
      description: 'A demo login has a flaw. Recover the flag without triggering the alarm twice.',
      category: 'web',
      difficulty: CtfDifficulty.MEDIUM,
      points: 200,
      hints: ['Check the cookie flags.', 'Is the session id predictable?'],
      flag: 'CSHUB{session_hygiene}',
      writeUpUrl: null,
      author: bob,
    },
  ];

  for (const challenge of challenges) {
    const existing = await prisma.ctfChallenge.findFirst({ where: { title: challenge.title } });
    if (existing) continue;

    await prisma.ctfChallenge.create({
      data: {
        title: challenge.title,
        description: challenge.description,
        category: challenge.category,
        difficulty: challenge.difficulty,
        points: challenge.points,
        hints: challenge.hints,
        writeUpUrl: challenge.writeUpUrl,
        flagHash: hashFlag(challenge.flag),
        createdById: challenge.author.id,
      },
    });
  }

  // ----------------------------------------------------------- assignments
  const assignments = [
    {
      title: 'Lab 1 — network reconnaissance',
      description: 'Complete the recon section and submit your scan output.',
      courseCode: 'CS-401',
      type: AssignmentType.LAB,
      status: AssignmentStatus.IN_PROGRESS,
      ownerId: alice.id,
      author: moderator,
    },
    {
      title: 'Assignment 2 — secure login implementation',
      description: 'Implement login with hashed passwords, rate limiting and session revocation.',
      courseCode: 'CS-401',
      type: AssignmentType.ASSIGNMENT,
      status: AssignmentStatus.TODO,
      ownerId: null,
      author: moderator,
    },
    {
      title: 'Group project — security audit report',
      description: 'Audit the class project and write up findings.',
      courseCode: 'CS-450',
      type: AssignmentType.PROJECT,
      status: AssignmentStatus.TODO,
      ownerId: null,
      author: admin,
    },
  ];

  for (const assignment of assignments) {
    const existing = await prisma.assignment.findFirst({ where: { title: assignment.title } });
    if (existing) continue;

    await prisma.assignment.create({
      data: {
        title: assignment.title,
        description: assignment.description,
        courseCode: assignment.courseCode,
        type: assignment.type,
        status: assignment.status,
        dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        ownerId: assignment.ownerId,
        createdById: assignment.author.id,
      },
    });
  }

  // --------------------------------------------------------- announcements
  const announcementCount = await prisma.announcement.count({ where: { title: 'Welcome to the 2019 cohort hub' } });
  if (announcementCount === 0) {
    await prisma.announcement.create({
      data: {
        title: 'Welcome to the 2019 cohort hub',
        body: 'Registration is open. **New members are approved manually** — expect a short wait before your first sign-in.',
        pinned: true,
        expiresAt: null,
        authorId: admin.id,
      },
    });
  }

  // ------------------------------------------------------------- settings
  const settings: [string, unknown][] = [
    ['siteName', 'CS 2019 Hub'],
    ['registrationOpen', true],
    ['requireApproval', true],
    ['maintenanceMode', false],
    ['allowGuests', false],
    ['maxUploadMb', 25],
  ];

  for (const [key, value] of settings) {
    await prisma.appSetting.upsert({
      where: { key },
      update: { value: value as never },
      create: { key, value: value as never },
    });
  }

  // Elevate the owner configured via SUPERADMIN_EMAIL, if any.
  await ensureSuperadmins();

  console.log('Seed complete.');
  console.log('Accounts (password for all: %s)', PASSWORD);
  console.log('  admin@cs2019.local   ADMIN');
  console.log('  mod@cs2019.local     MODERATOR');
  console.log('  alice@cs2019.local   STUDENT');
  console.log('  bob@cs2019.local     STUDENT');
  console.log('  newcomer@cs2019.local PENDING (cannot sign in until approved)');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });