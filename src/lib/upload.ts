'use client';

import { formatBytes } from '@/lib/utils';

/**
 * Browser-side upload helper shared by every place that accepts a file.
 *
 * The server enforces the real rules (MIME allow-list in `lib/storage.ts`, size
 * limit from settings, ownership); `ACCEPT` and the size check here only stop
 * an obviously-doomed request before it costs bandwidth.
 */

export const ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.tar,.gz,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.gif';

export interface UploadedFile {
  id: string;
}

/**
 * POST multipart form data while reporting byte progress.
 *
 * `fetch` has no upload progress event, so XHR is used for this one request.
 */
export function uploadWithProgress(
  form: FormData,
  onProgress: (percent: number) => void,
): Promise<{ file: UploadedFile }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files/upload');

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    });

    xhr.addEventListener('load', () => {
      const type = xhr.getResponseHeader('content-type') ?? '(none)';
      const raw = xhr.responseText ?? '';

      let body: { file?: UploadedFile; error?: { message?: string } } | null = null;
      try {
        body = JSON.parse(raw);
      } catch {
        // Not a parseable reply. The id may still be in the header, so only
        // report a hard failure once that has been ruled out too.
        console.error('[upload] non-JSON response', {
          status: xhr.status,
          contentType: type,
          bodyLength: raw.length,
          headerFileId: xhr.getResponseHeader('x-file-id'),
          body: raw.slice(0, 500),
        });
      }

      const fileId = body?.file?.id ?? xhr.getResponseHeader('x-file-id');
      if (xhr.status >= 200 && xhr.status < 300 && fileId) {
        onProgress(100);
        resolve({ file: { id: fileId } });
        return;
      }

      if (body?.error?.message) {
        reject(new Error(body.error.message));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        const detail = raw.trim().slice(0, 200) || '(empty body)';
        reject(
          new Error(`Upload failed: HTTP ${xhr.status} returned ${type}, not JSON. Body: ${detail}`),
        );
        return;
      }
      reject(new Error(`Upload failed (HTTP ${xhr.status}).`));
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload.')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled.')));

    xhr.send(form);
  });
}

/** Stage a picked or dropped file, rejecting the ones the server would refuse. */
export function validateUploadCandidate(
  candidate: File,
  maxBytes: number,
): { ok: true } | { ok: false; message: string } {
  if (candidate.size === 0) return { ok: false, message: 'That file is empty.' };
  if (candidate.size > maxBytes) {
    return {
      ok: false,
      message: `"${candidate.name}" is ${formatBytes(candidate.size)}. Limit is ${formatBytes(maxBytes)}.`,
    };
  }
  return { ok: true };
}
