import { ApiError } from '@/lib/api-response';

/**
 * In-memory sliding-window rate limiter.
 *
 * NOTE: state lives in this Node process, so limits are per-instance. That is
 * fine for a single-node student deployment; behind a load balancer put a shared
 * store (e.g. the Upstash/Redis rate-limiter adapter) in front of this module.
 * The interface is intentionally shaped so that swap is a one-file change.
 */

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

// Periodic sweep so the map cannot grow without bound.
const SWEEP_INTERVAL_MS = 60_000;
if (typeof setInterval !== 'undefined' && process.env.NODE_ENV !== 'test') {
  const timer = setInterval(() => {
    const cutoff = Date.now();
    for (const [key, bucket] of buckets) {
      bucket.hits = bucket.hits.filter((t) => t > cutoff - 15 * 60_000);
      if (bucket.hits.length === 0) buckets.delete(key);
    }
  }, SWEEP_INTERVAL_MS);
  // Don't keep the process alive just for the sweeper.
  timer.unref?.();
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  /** Seconds until the client may retry. */
  retryAfter: number;
}

/**
 * @param key      unique bucket, usually `${ip}:${route}`
 * @param limit    max requests allowed inside the window
 * @param windowMs sliding window length
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };

  bucket.hits = bucket.hits.filter((t) => t > now - windowMs);

  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    const oldest = bucket.hits[0] ?? now;
    return {
      success: false,
      remaining: 0,
      retryAfter: Math.ceil((oldest + windowMs - now) / 1000),
    };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);

  return {
    success: true,
    remaining: limit - bucket.hits.length,
    retryAfter: 0,
  };
}

/**
 * Rate limit + `Retry-After` header, throwing a 429 ApiError when exceeded.
 * Call at the top of every mutating or auth-sensitive handler.
 */
export function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const result = rateLimit(key, limit, windowMs);
  if (!result.success) {
    throw ApiError.tooManyRequests(
      `Too many attempts. Try again in ${result.retryAfter}s.`,
    );
  }
  return result;
}

/** Build a stable bucket key from the request. */
export function limitKey(req: Request, scope: string, identity?: string | null): string {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'local';
  return `${scope}:${identity ?? ip}`;
}