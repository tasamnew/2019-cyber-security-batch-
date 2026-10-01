import { NextResponse } from 'next/server';

/**
 * Uniform API error envelope: { error: { code, message, fields? } }.
 * Route handlers should never leak raw exception text to the client; log the
 * real error server-side and return one of these instead.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  static badRequest(message = 'Invalid request.', fields?: Record<string, string>) {
    return new ApiError(400, 'BAD_REQUEST', message, fields);
  }

  static unauthorized(message = 'You must be signed in.') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'You do not have permission to do that.') {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Not found.') {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  static conflict(message = 'That conflicts with existing data.') {
    return new ApiError(409, 'CONFLICT', message);
  }

  static tooManyRequests(message = 'Too many requests. Please slow down.') {
    return new ApiError(429, 'RATE_LIMITED', message);
  }

  static internal(message = 'Something went wrong.') {
    return new ApiError(500, 'INTERNAL', message);
  }
}

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function ok(data: unknown = { success: true }, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function fail(err: ApiError): NextResponse {
  return NextResponse.json(
    { error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) } },
    { status: err.status },
  );
}

/**
 * Wrap a route handler: converts thrown ApiError / ZodError into the envelope
 * and hides unexpected exceptions behind a 500 while logging the real cause.
 */
/**
 * Wrap a route handler: converts thrown ApiError / ZodError into the envelope
 * and hides unexpected exceptions behind a 500 while logging the real cause.
 *
 * Generic over the response type so handlers that stream (file downloads)
 * can return a plain `Response`.
 */
export function handler<Args extends unknown[], R extends Response = NextResponse>(
  fn: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R | NextResponse> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) return fail(err);

      // Zod v4 exposes `.issues`; convert to a field->message map.
      if (
        err &&
        typeof err === 'object' &&
        'issues' in err &&
        Array.isArray((err as { issues: unknown }).issues)
      ) {
        const issues = (err as { issues: { path: (string | number)[]; message: string }[] }).issues;
        const fields: Record<string, string> = {};
        for (const issue of issues) {
          const key = issue.path.length > 0 ? issue.path.join('.') : '_';
          if (!fields[key]) fields[key] = issue.message;
        }
        return fail(ApiError.badRequest('Please check the highlighted fields.', fields));
      }

      console.error('[api] unhandled error:', err);
      return fail(ApiError.internal());
    }
  };
}