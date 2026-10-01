/**
 * Guard for the production build: fail fast with an actionable message when a
 * required secret is missing.
 *
 * On Render, `.env` is not deployed (it is gitignored), so every value must be
 * set in the dashboard. Without this check the build dies deep inside Prisma
 * with "Environment variable not found: DATABASE_URL", which does not tell the
 * operator where to fix it.
 *
 * Usage: node scripts/require-env.mjs DATABASE_URL AUTH_SECRET
 */

const required = process.argv.slice(2);
const missing = required.filter((key) => !process.env[key] || process.env[key].trim() === '');

if (missing.length > 0) {
  console.error('\n  Missing required environment variable(s): ' + missing.join(', ') + '\n');
  console.error('  Set them in your host dashboard (Render: Service > Environment),');
  console.error('  or add them to render.yaml with `sync: false` so they are prompted for.');
  console.error('  DATABASE_URL should be a direct PostgreSQL URL, e.g.');
  console.error('    postgresql://user:pass@host/db?sslmode=require\n');
  process.exit(1);
}