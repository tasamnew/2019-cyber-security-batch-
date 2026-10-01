// Environment access with validation. Import `env` from server code only —
// importing this from a Client Component would inline secrets into the bundle.

const required = (key: string): string => {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${key}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
};

function num(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const isProd = process.env.NODE_ENV === 'production';

const authSecret = required('AUTH_SECRET');
if (authSecret.length < 32) {
  throw new Error('AUTH_SECRET must be at least 32 characters long.');
}
if (isProd && authSecret.includes('replace-me')) {
  throw new Error('AUTH_SECRET still contains the .env.example placeholder.');
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd,
  isDev: !isProd,
  // APP_URL wins; otherwise fall back to the platform-provided public URL
  // (Render sets RENDER_EXTERNAL_URL) so cookies/links are correct without
  // manual configuration.
  appUrl:
    process.env.APP_URL ?? process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:3000',
  authSecret,
  port: num('PORT', 3000),
  maxUploadMb: num('MAX_UPLOAD_MB', 25),

  // Session lifetimes
  accessTokenTtl: '2h',
  sessionTtlDays: num('SESSION_TTL_DAYS', 7),

  // Cookie flags. `secure` is always true in production so the session cookie
  // is never sent over plaintext HTTP.
  cookie: {
    name: 'cs_session',
    secure: isProd,
  },
} as const;