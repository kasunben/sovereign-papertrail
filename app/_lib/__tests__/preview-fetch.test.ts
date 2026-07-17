import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

import { lookup } from 'node:dns/promises';
import { fetchLinkPreview } from '../preview';

// `dns.lookup` is overloaded on its options shape, so vi.mocked() infers the
// single-result overload instead of the `{ all: true }` one preview.ts
// actually calls — assert the mock's shape directly instead of fighting that.
const mockedLookup = lookup as unknown as {
  mockResolvedValue: (addresses: { address: string; family: number }[]) => void;
};

describe('fetchLinkPreview', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockedLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('extracts OpenGraph title/description/image, resolving a relative image URL', async () => {
    const html = `<!doctype html><html><head>
      <title>Fallback title</title>
      <meta property="og:title" content="Evidence Wall">
      <meta property="og:description" content="A place to map connections">
      <meta property="og:image" content="/preview.png">
    </head><body></body></html>`;
    fetchSpy.mockResolvedValue(
      new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }),
    );

    const preview = await fetchLinkPreview('https://example.com/article');

    expect(preview.title).toBe('Evidence Wall');
    expect(preview.description).toBe('A place to map connections');
    expect(preview.image).toBe('https://example.com/preview.png');
  });

  it('falls back to the <title> tag when there is no og:title', async () => {
    const html = '<html><head><title>Plain Page</title></head><body></body></html>';
    fetchSpy.mockResolvedValue(new Response(html, { status: 200 }));

    const preview = await fetchLinkPreview('https://example.com/');

    expect(preview.title).toBe('Plain Page');
    expect(preview.image).toBeNull();
  });

  it('rejects a non-http(s) URL before ever calling fetch', async () => {
    await expect(fetchLinkPreview('file:///etc/passwd')).rejects.toThrow('Only http(s) URLs are allowed.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a host that resolves to a private address', async () => {
    mockedLookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);

    await expect(fetchLinkPreview('https://internal.example/')).rejects.toThrow(
      'That address is not allowed.',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a non-ok response', async () => {
    fetchSpy.mockResolvedValue(new Response('not found', { status: 404 }));

    await expect(fetchLinkPreview('https://example.com/missing')).rejects.toThrow('status 404');
  });
});
