import { spawnSync } from 'node:child_process';

/**
 * Prisma client generation wrapper.
 *
 * `prisma generate` validates the datasource block, which resolves
 * `env("DATABASE_URL")`. On a build machine the variable may legitimately be
 * absent (it is a secret that is only injected at runtime on some hosts), and
 * Prisma then aborts with P1012 "Environment variable not found".
 *
 * The generated client never contains the connection string, so supplying a
 * syntactically valid placeholder when the real one is missing is safe: it only
 * unblocks code generation. Any command that actually connects to the database
 * (`migrate deploy`, `db:seed`, the running app) still requires the real
 * DATABASE_URL and will fail loudly if it is absent.
 */

const PLACEHOLDER = 'postgresql://placeholder:placeholder@localhost:5432/placeholder';

if (!process.env.DATABASE_URL) {
  console.warn('[prisma] DATABASE_URL is not set — using a placeholder for client generation only.');
  process.env.DATABASE_URL = PLACEHOLDER;
}

const result = spawnSync('npx', ['prisma', 'generate'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});

process.exit(result.status ?? 1);