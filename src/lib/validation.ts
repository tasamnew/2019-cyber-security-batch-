import { z } from 'zod';
import { checkPasswordStrength } from '@/lib/password';

/**
 * Shared validation schemas. Every request body is parsed through one of these
 * before it reaches Prisma — this is the main defence against NoSQL-style
 * injection, mass assignment and oversized payloads.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/**
 * Strips control characters (tab/newline included — those are never legal in a
 * single-line field) and trims. Applied to every free-text field so that stored
 * values cannot smuggle terminal escapes or zero-width padding.
 */
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g;

const clean = (max: number) =>
  z.string().max(max).transform((s) => s.replace(CONTROL_CHARS, '').trim());

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  // Deliberately permissive: the only authoritative test is sending mail.
  .refine((v) => /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v), 'Enter a valid email address.');

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens only.');

/** Markdown body. Length capped to keep posts readable and DB rows small. */
export const markdownSchema = clean(20_000);

export const tagsSchema = z
  .array(
    z
      .string()
      .trim()
      .toLowerCase()
      .max(24)
      .regex(/^[a-z0-9][a-z0-9+#._-]*$/, 'Tags may contain letters, numbers, +, #, ., _ and -'),
  )
  .max(10, 'Use at most 10 tags.')
  .default([]);

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters.')
  .max(200)
  .superRefine((p, ctx) => {
    const result = checkPasswordStrength(p);
    if (!result.ok && result.message) {
      ctx.addIssue({ code: 'custom', message: result.message });
    }
  });

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour such as #3dd6ff.');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const registerSchema = z.object({
  name: clean(80).pipe(z.string().min(2, 'Enter your name.')),
  email: emailSchema,
  password: passwordSchema,
  studentId: clean(40).optional(),
  bio: clean(500).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(200),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const updateProfileSchema = z.object({
  name: clean(80).pipe(z.string().min(2)).optional(),
  bio: clean(500).optional(),
  avatarSeed: hexColorSchema.optional(),
  currentPassword: z.string().max(200).optional(),
  newPassword: passwordSchema.optional(),
});

// ---------------------------------------------------------------------------
// Forum
// ---------------------------------------------------------------------------

export const categorySchema = z.object({
  name: clean(60).pipe(z.string().min(2)),
  slug: slugSchema,
  description: clean(300).optional(),
  color: hexColorSchema.default('#3dd6ff'),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});
export const categoryUpdateSchema = categorySchema.partial();

export const postCreateSchema = z.object({
  title: clean(160).pipe(z.string().min(8, 'Give the post a more descriptive title.')),
  body: markdownSchema.pipe(z.string().min(20, 'Add some detail (at least 20 characters).')),
  categoryId: z.string().cuid(),
  tags: tagsSchema,
});

export const postUpdateSchema = z.object({
  title: clean(160).pipe(z.string().min(8)).optional(),
  body: markdownSchema.pipe(z.string().min(20)).optional(),
  categoryId: z.string().cuid().optional(),
  tags: tagsSchema.optional(),
});

export const commentCreateSchema = z.object({
  body: markdownSchema.pipe(z.string().min(2, 'Comment is too short.')),
  parentId: z.string().cuid().nullish(),
});

export const commentUpdateSchema = z.object({
  body: markdownSchema.pipe(z.string().min(2)),
});

export const voteSchema = z.object({
  value: z.union([z.literal(1), z.literal(-1), z.literal(0)]).describe('1 up, -1 down, 0 clear'),
});

export const postListQuerySchema = paginationSchema.extend({
  category: slugSchema.optional(),
  q: clean(120).optional(),
  sort: z.enum(['new', 'top', 'active', 'unanswered']).default('new'),
  authorId: z.string().cuid().optional(),
});

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export const channelCreateSchema = z.object({
  name: clean(40).pipe(z.string().min(2)),
  slug: slugSchema,
  topic: clean(200).optional(),
  kind: z.enum(['PUBLIC', 'PRIVATE']).default('PUBLIC'),
});

export const messageCreateSchema = z.object({
  body: clean(4000).pipe(z.string().min(1, 'Message cannot be empty.')),
  attachmentId: z.string().cuid().nullish(),
});

// ---------------------------------------------------------------------------
// Resources / files
// ---------------------------------------------------------------------------

export const resourceCreateSchema = z.object({
  title: clean(120).pipe(z.string().min(3)),
  description: clean(1000).optional(),
  kind: z.enum(['LINK', 'FILE']),
  url: z.url('Enter a valid URL.').optional(),
  fileId: z.string().cuid().optional(),
  tags: tagsSchema,
});

export const resourceUpdateSchema = resourceCreateSchema.partial();

export const resourceListQuerySchema = paginationSchema.extend({
  q: clean(120).optional(),
  kind: z.enum(['LINK', 'FILE']).optional(),
  tag: clean(24).optional(),
});

// ---------------------------------------------------------------------------
// CTF
// ---------------------------------------------------------------------------

export const ctfCreateSchema = z.object({
  title: clean(120).pipe(z.string().min(3)),
  description: markdownSchema.pipe(z.string().min(10)),
  url: z.url().optional(),
  category: clean(40).pipe(z.string().min(2)),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'INSANE']).default('MEDIUM'),
  points: z.coerce.number().int().min(0).max(1_000_000).default(0),
  hints: z.array(clean(300)).max(10).default([]),
  writeUpUrl: z.url().optional(),
  // Plaintext flag, only ever hashed by the route before storage.
  flag: z.string().min(1).max(200).optional(),
});

export const ctfFlagSubmissionSchema = z.object({
  flag: z.string().min(1).max(200),
});

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export const assignmentCreateSchema = z.object({
  title: clean(160).pipe(z.string().min(3)),
  description: clean(2000).optional(),
  courseCode: clean(30).optional(),
  type: z.enum(['ASSIGNMENT', 'LAB', 'PROJECT', 'EXAM', 'DEADLINE']).default('ASSIGNMENT'),
  dueAt: z.coerce.date().nullish(),
  ownerId: z.string().cuid().nullish(),
});

export const assignmentUpdateSchema = assignmentCreateSchema
  .partial()
  .extend({ status: z.enum(['TODO', 'IN_PROGRESS', 'SUBMITTED', 'DONE']).optional() });

// ---------------------------------------------------------------------------
// Moderation / admin
// ---------------------------------------------------------------------------

export const reportCreateSchema = z.object({
  targetType: z.enum(['POST', 'COMMENT', 'RESOURCE', 'FILE', 'MESSAGE', 'USER']),
  targetId: clean(64),
  reason: z.enum(['SPAM', 'HARASSMENT', 'OFF_TOPIC', 'MALICIOUS_CONTENT', 'COPYRIGHT', 'OTHER']),
  details: clean(500).optional(),
});

export const reportResolveSchema = z.object({
  status: z.enum(['RESOLVED', 'DISMISSED']),
  resolution: clean(500).optional(),
});

export const adminUserUpdateSchema = z
  .object({
    role: z.enum(['GUEST', 'STUDENT', 'MODERATOR', 'ADMIN']).optional(),
    status: z.enum(['PENDING', 'APPROVED', 'BLOCKED']).optional(),
  })
  .refine((v) => (v.role !== undefined || v.status !== undefined), {
    message: 'Provide a role or a status change.',
  });

export const adminSettingsSchema = z.object({
  siteName: clean(60).optional(),
  registrationOpen: z.boolean().optional(),
  requireApproval: z.boolean().optional(),
  maintenanceMode: z.boolean().optional(),
  allowGuests: z.boolean().optional(),
  maxUploadMb: z.coerce.number().int().min(1).max(500).optional(),
});

export const announcementSchema = z.object({
  title: clean(120).pipe(z.string().min(3)),
  body: markdownSchema.pipe(z.string().min(5)),
  pinned: z.boolean().default(true),
  expiresAt: z.coerce.date().nullish(),
});

export const adminUserListQuerySchema = paginationSchema.extend({
  status: z.enum(['PENDING', 'APPROVED', 'BLOCKED']).optional(),
  role: z.enum(['ADMIN', 'MODERATOR', 'STUDENT', 'GUEST']).optional(),
  q: clean(120).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PostCreateInput = z.infer<typeof postCreateSchema>;
export type MessageCreateInput = z.infer<typeof messageCreateSchema>;