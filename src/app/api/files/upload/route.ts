import { db } from '@/lib/db';
import { handler, ok, ApiError } from '@/lib/api-response';
import { requireMember } from '@/lib/guards';
import { enforceRateLimit, limitKey } from '@/lib/rate-limit';
import { saveUpload, maxUploadBytes } from '@/lib/storage';
import { getSettings } from '@/lib/settings';

/**
 * POST /api/files/upload  (multipart/form-data, field name: `file`)
 *
 * Returns a FileAsset id. The client then passes that id to /api/resources.
 * Files are written outside `public/` and only ever served through
 * /api/files/[id], which re-checks the session on every download.
 */
export const POST = handler(async (req: Request) => {
  const actor = await requireMember();
  enforceRateLimit(limitKey(req, 'file:upload', actor.id), 30, 60 * 60 * 1000);

  const settings = await getSettings();
  const limit = maxUploadBytes(settings.maxUploadMb);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw ApiError.badRequest('Send the file as multipart/form-data.');
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    throw ApiError.badRequest('No file was provided (expected field name "file").');
  }

  const stored = await saveUpload(file, limit);

  const asset = await db.fileAsset.create({
    data: {
      originalName: stored.originalName,
      storedName: stored.storedName,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      sha256: stored.sha256,
      uploadedById: actor.id,
    },
  });

  const response = ok({ file: asset }, 201);
  // Repeat the id in a header so publishing can still complete if the JSON body
  // is ever empty or truncated in transit.
  response.headers.set('X-File-Id', asset.id);
  return response;
});