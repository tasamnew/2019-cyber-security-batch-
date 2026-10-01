# CS 2019 Hub

A collaboration and knowledge-sharing platform for the **2019 Cyber Security Student Group**. It combines a forum, real-time chat, a resource repository, a CTF corner, an assignment tracker and a full admin dashboard behind a role-based, session-revocable auth system.

Built with Next.js (App Router), React, Tailwind CSS v4, PostgreSQL/Prisma and Socket.io.

---

## Features

- **Forum** — categories, Markdown posts with syntax highlighting, comments, up/down voting, tags, pinning and soft moderation.
- **Real-time chat** — public/private channels and direct messages over Socket.io, with an HTTP fallback so messaging still works if the socket drops.
- **Resource library** — share links or upload files (PDF, Office, archives, text, CSV, images) with tags, search and protected downloads.
- **CTF corner** — challenges with difficulty, points, spoiler-gated hints, write-ups and a per-member scoreboard. Flags are stored as keyed HMACs, never in plaintext.
- **Assignment tracker** — shared Kanban board with claimable cards, deadlines, ownership and overdue highlighting.
- **Admin dashboard** — member approval and role management, moderation queue, announcements, runtime site settings, audit log and session revocation.
- **Auth & security** — HTTP-only JWT cookie backed by revocable server-side sessions, bcrypt password hashing, role-based access control, rate limiting, Zod validation on every endpoint, account lockout and a maintenance mode.

## Roles

| Role | Capabilities |
| --- | --- |
| `GUEST` | Read-only access to public content |
| `STUDENT` | Post, comment, vote, chat, upload resources, solve CTFs, manage own assignments |
| `MODERATOR` | Everything a student can do, plus content moderation, pinning, channels and the moderation queue |
| `ADMIN` | Full access: member roles, block/approve, site settings, audit log and session revocation |

New accounts are created `PENDING` and cannot sign in until an admin approves them (toggleable in **Admin → Settings**).

---

## Prerequisites

- **Node.js 20.11+** (developed on Node 24)
- **PostgreSQL 14+**, running and reachable

No Docker configuration is bundled — point `DATABASE_URL` at any PostgreSQL instance.

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure the environment
cp .env.example .env
#    then edit .env and set DATABASE_URL and AUTH_SECRET
```

Generate a strong secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Create the database and apply the schema:

```bash
createdb cs_hub            # or use pgAdmin / your host's console
npm run db:push            # push the schema (quick start)
# or, for a migration history:
npm run db:migrate
```

Seed demo data (accounts, categories, posts, channels, CTFs, assignments, announcements and settings):

```bash
npm run db:seed
```

Start the dev server (custom server so Socket.io runs alongside Next):

```bash
npm run dev
```

Open <http://localhost:3000>.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | 32+ char random secret; signs session JWTs and keys flag hashes |
| `APP_URL` | No | Public origin; on Render it defaults to `RENDER_EXTERNAL_URL`, otherwise `http://localhost:3000` |
| `PORT` | No | Server port, defaults to `3000` |
| `NODE_ENV` | No | `development` or `production` |
| `MAX_UPLOAD_MB` | No | Upload cap in MB, defaults to `25` (admin-overridable at runtime) |
| `SUPERADMIN_EMAIL` | No | Comma-separated address(es) promoted to `ADMIN`/`APPROVED` on every boot; protected from demotion |
| `SUPERADMIN_PASSWORD` | No | Password used only to create a missing super-admin account (min 10 chars, mixed case + digit) |

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next + Socket.io dev server with hot reload |
| `npm run build` | Production build |
| `npm run start` | Run the production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm run db:generate` | Regenerate the Prisma Client |
| `npm run db:push` | Sync schema to the database without migrations |
| `npm run db:migrate` | Create/apply a development migration |
| `npm run db:deploy` | Apply committed migrations in production |
| `npm run db:seed` | Seed demo data |
| `npm run db:superadmin` | Promote/create the account in `SUPERADMIN_EMAIL` |
| `npm run db:secure-demo` | Block the seeded `@cs2019.local` demo accounts (production hardening) |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:reset` | Drop, recreate, migrate and reseed |

## Demo accounts

Created by `npm run db:seed`. Password for every account: **`ChangeMe!2019`**

| Email | Role |
| --- | --- |
| `admin@cs2019.local` | Admin |
| `mod@cs2019.local` | Moderator |
| `alice@cs2019.local` | Student |
| `bob@cs2019.local` | Student |
| `newcomer@cs2019.local` | Pending (cannot sign in until approved) |

> Change these credentials before exposing the app to anyone.

---

## Project structure

```
prisma/
  schema.prisma        # data model
  seed.ts              # demo data
server.mjs             # custom Next + Socket.io server
src/
  app/
    (app)/             # authenticated shell: dashboard, forum, chat, resources, ctf, assignments, profile, admin
    api/               # REST endpoints (auth, content, moderation, admin)
    login|register|... # public auth pages
  components/          # nav, markdown, UI primitives, user menu
  hooks/               # auth, socket, toast
  lib/                 # auth, rbac, guards, validation, storage, flags, settings, audit, votes
  styles/globals.css   # Tailwind v4 theme and component classes
  middleware.ts        # coarse route protection
```

## Security notes

- Passwords are hashed with bcrypt (cost 12); failed logins are counted and lock the account temporarily.
- The session cookie is `httpOnly`, `sameSite=lax`, `secure` in production, and backed by a `Session` row so an admin can revoke it instantly. Changing a password drops all other sessions.
- Every mutating endpoint validates its body with Zod and enforces a permission check plus rate limits.
- Uploads are written to disk under randomized names with an allowlist of MIME types; downloads stream through an authenticated route rather than a public directory.
- CTF flags are stored as HMAC-SHA256 digests keyed by `AUTH_SECRET` and compared in constant time.
- Admin actions are written to an append-only audit log; content actions also record a moderation entry.

## Production

```bash
npm ci
npm run db:deploy
npm run build
NODE_ENV=production npm run start
```

Run the app behind a TLS-terminating reverse proxy and keep `.env` out of version control. The in-memory rate limiter and settings cache assume a single app instance; for multiple replicas, move rate limiting to Redis and replace the cache with a shared store.

## Deploying to Render (free, no credit card)

This is the recommended host: it runs the custom `server.mjs`, so Socket.io (real-time chat) works, and it needs no card.

1. Create a free [Neon](https://neon.tech) Postgres and copy the **direct** (non-pooled) connection string. **Remove the trailing `&channel_binding=require`** — Prisma's query engine hangs on it — keeping `?sslmode=require`.
2. Push this folder to a **GitHub** repository (Render deploys from Git).
3. In Render, choose **New → Blueprint** and select the repo — it reads `render.yaml`. Provide the two prompted secrets:
   - `DATABASE_URL` = the Neon connection string
   - `SUPERADMIN_PASSWORD` = a strong password for `tasamnew1@gmail.com`
   (`AUTH_SECRET` is generated automatically.)
4. Render builds, runs `prisma migrate deploy`, and starts the app. First boot promotes `tasamnew1@gmail.com` to an approved admin.

**Caveats on the free plan**

- The service **sleeps after ~15 minutes idle** and cold-starts on the next request.
- **No persistent disk:** files written to `storage/uploads` are lost on redeploy/restart. Use Cloud Storage or links for anything permanent.
- Rate limiting and the settings cache are in-memory and assume a single instance.

## Deploying to Firebase App Hosting (requires Blaze billing)

App Hosting runs the Next.js app on Cloud Run. It requires the **Blaze (pay-as-you-go)** plan and a **PostgreSQL** database reachable over the network — this project uses [Neon](https://neon.tech) (free tier) rather than a local server. Configuration lives in `apphosting.yaml`; secrets live in Cloud Secret Manager.

**One-time setup**

1. Upgrade the `cyber-security-batch` project to **Blaze** in the Firebase console.
2. Create a Neon Postgres database and copy its **pooled** connection string (the host contains `-pooler`).
3. Apply the schema migration to Neon (run locally, pointing at the Neon URL):

   ```bash
   DATABASE_URL="postgresql://...-pooler.../neondb?sslmode=require" npm run db:deploy
   ```

4. Push this folder to a **GitHub** repository (App Hosting deploys from GitHub).
5. Create the secrets and connect the backend:

   ```bash
   firebase login
   firebase apphosting:secrets:set DATABASE_URL        # paste the Neon pooled URL
   firebase apphosting:secrets:set AUTH_SECRET         # node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   firebase apphosting:secrets:set SUPERADMIN_PASSWORD # initial owner password
   firebase init apphosting                            # connect the GitHub repo + branch
   ```

6. Trigger a rollout (or just push to the connected branch). App Hosting builds with `npm run build` and starts the app.

`tasamnew1@gmail.com` is promoted to `ADMIN`/`APPROVED` automatically on boot (see `SUPERADMIN_EMAIL`), so you can sign in with it as soon as the rollout is live. Reset its password from **Profile** afterwards.

**Deployment caveats**

- **Uploads are ephemeral.** Files written to `storage/uploads` do not survive a redeploy or scale-out on Cloud Run. Use Cloud Storage (or links) for anything that must persist.
- **Real-time chat:** App Hosting runs the Next.js adapter, which may not execute the custom `server.mjs`. Chat then falls back to the HTTP API (history + send still work; live push may not). Deploy to Cloud Run with a Dockerfile if Socket.io must be live.
- Rate limiting and the settings cache are in-memory and assume a single instance; move them to Redis before scaling beyond one replica.

---

## Leaving the old project untouched

The original Vite scaffold lives at `..\cyber` and was not modified. This project is entirely self-contained in this folder.
