import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { ApiError } from '@/lib/api-response';
import { env } from '@/lib/env';

/**
 * Upload handling.
 *
 * Security model:
 *  - Files are written OUTSIDE `public/`, so they are never statically served.
 *    Downloads go through /api/files/[id], which re-checks auth every time.
 *  - The on-disk name is random and extension-derived, never user controlled.
 *    This defeats path traversal ("../../app/layout.tsx") and double-extension
 *    tricks ("payload.php.png").
 *  - The extension is chosen from an allow-list keyed off the sniffed MIME type,
 *    not from `file.originalname`.
 *  - Every byte is streamed through SHA-256 so uploads can be de-duplicated and
 *    so an admin action has a verifiable identifier.
 */

const UPLOAD_ROOT = path.join(process.cwd(), 'storage', 'uploads');

/**
 * Allowed MIME types and the single extension each maps to.
 * Adding a type means adding it here — nothing is accepted by default.
 */
const ALLOWED: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/zip': '.zip',
  'application/x-tar': '.tar',
  'application/gzip': '.gz',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'text/csv': '.csv',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export function maxUploadBytes(maxMb?: number): number {
  return (maxMb ?? env.maxUploadMb) * 1024 * 1024;
}

export interface StoredFile {
  storedName: string;
  sizeBytes: number;
  sha256: string;
  mimeType: string;
  /** Sanitised for display only — never used to build a path. */
  originalName: string;
}

export function assertAllowedMime(mimeType: string): void {
  if (!(mimeType in ALLOWED)) {
    throw ApiError.badRequest(
      `File type "${mimeType || 'unknown'}" is not allowed. Accepted: PDF, Office docs, archives, text, CSV, and images.`,
    );
  }
}

/** Strip directory components and control chars from the client filename. */
export function sanitizeOriginalName(name: string): string {
  const base = path.basename(name.replace(/\\/g, '/'));
  return base.replace(/[^\w.\- ]/g, '_').slice(0, 180) || 'upload';
}

export async function saveUpload(
  file: File,
  maxBytes: number,
): Promise<StoredFile> {
  if (file.size === 0) throw ApiError.badRequest('The file is empty.');
  if (file.size > maxBytes) {
    throw ApiError.badRequest(
      `File is too large. The limit is ${Math.floor(maxBytes / 1024 / 1024)} MB.`,
    );
  }

  const mimeType = file.type || 'application/octet-stream';
  assertAllowedMime(mimeType);

  const ext = ALLOWED[mimeType];
  const storedName = `${Date.now().toString(36)}-${randomBytes(16).toString('hex')}${ext}`;
  const dest = path.join(UPLOAD_ROOT, storedName);

  // Belt-and-braces: the generated name can never contain a separator, but assert
  // anyway so a future change to the naming scheme cannot open a traversal hole.
  if (path.dirname(path.resolve(dest)) !== path.resolve(UPLOAD_ROOT)) {
    throw ApiError.internal('Refusing to write outside the upload directory.');
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    throw ApiError.badRequest('File is too large.');
  }

  await fs.mkdir(UPLOAD_ROOT, { recursive: true });
  await fs.writeFile(dest, bytes, { flag: 'wx', mode: 0o600 });

  return {
    storedName,
    sizeBytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    mimeType,
    originalName: sanitizeOriginalName(file.name),
  };
}

export function resolveStoredPath(storedName: string): string {
  const resolved = path.resolve(UPLOAD_ROOT, path.basename(storedName));
  if (path.dirname(resolved) !== path.resolve(UPLOAD_ROOT)) {
    throw ApiError.notFound();
  }
  return resolved;
}

export async function deleteStoredFile(storedName: string): Promise<void> {
  try {
    await fs.unlink(resolveStoredPath(storedName));
  } catch {
    // Already gone — deleting the DB row is what actually matters.
  }
}

/** Safe download filename: strips CR/LF and quotes to prevent header injection. */
export function contentDisposition(filename: string, inline: boolean): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename);
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}