import { sdk } from '@sovereignfs/sdk';
import { fetchLinkPreview } from '../../_lib/preview';

/**
 * GET /papertrail/api/preview?url= — OpenGraph scrape (PTR-08). Auth-only
 * (no project/board scoping): this doesn't touch any board's stored data,
 * it just proxies metadata for a signed-in user's own canvas state, same
 * boundary as sanitizeTextNodeBody.
 */
export async function GET(req: Request) {
  await sdk.auth.requireSession();

  const url = new URL(req.url).searchParams.get('url');
  if (!url) {
    return Response.json({ error: 'url is required.' }, { status: 400 });
  }

  try {
    const preview = await fetchLinkPreview(url);
    return Response.json(preview);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Could not fetch a preview for that URL.' },
      { status: 400 },
    );
  }
}
