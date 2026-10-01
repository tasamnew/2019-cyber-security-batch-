import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env';

/**
 * Flags are stored as an HMAC keyed by AUTH_SECRET rather than in plaintext:
 * a database dump then does not hand out every unsolved flag, and comparison
 * stays constant-time so a wrong flag cannot be brute-forced by timing.
 */
export function hashFlag(flag: string): string {
  return createHmac('sha256', env.authSecret).update(normalizeFlag(flag)).digest('hex');
}

export function verifyFlag(candidate: string, storedHash: string): boolean {
  const a = Buffer.from(hashFlag(candidate), 'utf8');
  const b = Buffer.from(storedHash, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Trim and lowercase so `FLAG{...}` and `flag{...}` are treated the same. */
function normalizeFlag(flag: string): string {
  return flag.trim().toLowerCase();
}