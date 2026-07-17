import { randomUUID } from 'node:crypto';
import { sdk } from '@sovereignfs/sdk';
import { getRequestContext, requireProjectRole } from '../../_lib/access';
import { processImageUpload } from '../../_lib/assets';
import { recordActivity } from '../../_lib/platform-events';

/**
 * POST /papertrail/api/assets — image upload (PTR-07). Multipart form:
 * `projectId` + `file`. Re-encodes via jimp (1400px full + 480px thumbnail)
 * and writes both through sdk.storage, scoped under the project's key
 * prefix so the serve route ([projectId]/[file]) can membership-check by
 * projectId alone.
 */
export async function POST(req: Request) {
  const { db, userId, tenantId } = await getRequestContext();

  const formData = await req.formData();
  const projectId = formData.get('projectId');
  const file = formData.get('file');

  if (typeof projectId !== 'string' || !projectId) {
    return Response.json({ error: 'projectId is required.' }, { status: 400 });
  }
  if (!(file instanceof Blob)) {
    return Response.json({ error: 'file is required.' }, { status: 400 });
  }

  try {
    await requireProjectRole(db, tenantId, projectId, userId, 'editor');
  } catch {
    return Response.json({ error: 'Not authorized.' }, { status: 403 });
  }

  let processed: Awaited<ReturnType<typeof processImageUpload>>;
  try {
    processed = await processImageUpload(await file.arrayBuffer());
  } catch {
    return Response.json({ error: 'Could not process that image.' }, { status: 400 });
  }
  const { full, thumbnail } = processed;

  const assetId = randomUUID();
  const fullKey = `projects/${projectId}/assets/${assetId}.jpg`;
  const thumbKey = `projects/${projectId}/assets/${assetId}-thumb.jpg`;

  await Promise.all([
    sdk.storage.put({ key: fullKey, body: full.buffer, contentType: full.contentType }),
    sdk.storage.put({ key: thumbKey, body: thumbnail.buffer, contentType: thumbnail.contentType }),
  ]);

  await recordActivity({
    action: 'papertrail.image.uploaded',
    targetType: 'project',
    targetId: projectId,
    summary: 'Uploaded an image.',
  });

  return Response.json({
    assetId,
    url: `/papertrail/api/assets/${projectId}/${assetId}`,
    thumbnailUrl: `/papertrail/api/assets/${projectId}/${assetId}-thumb`,
    width: full.width,
    height: full.height,
  });
}
