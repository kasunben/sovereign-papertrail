import { sdk } from '@sovereignfs/sdk';
import { getRequestContext, requireProjectRole } from '../../../../_lib/access';

// Storage keys are `projects/<projectId>/assets/<assetId>[-thumb].jpg` — the
// `file` segment must be exactly that asset-id shape, never a path.
const SAFE_FILE_TOKEN = /^[a-zA-Z0-9-]+$/;

interface RouteParams {
  params: Promise<{ projectId: string; file: string }>;
}

/**
 * GET /papertrail/api/assets/:projectId/:file — serves an uploaded image
 * (PTR-07). Membership-checked on every request (the platform's per-route
 * access-control rule — this route isn't reachable only via links inside an
 * already-authorized canvas) with immutable cache headers, since re-encoded
 * assets are never mutated after upload.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const { projectId, file } = await params;
  if (!SAFE_FILE_TOKEN.test(file)) {
    return new Response('Not found', { status: 404 });
  }

  const { db, userId, tenantId } = await getRequestContext();
  try {
    await requireProjectRole(db, tenantId, projectId, userId, 'viewer');
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const object = await sdk.storage.get(`projects/${projectId}/assets/${file}.jpg`);
  if (!object) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': object.contentType,
      'Content-Length': String(object.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
