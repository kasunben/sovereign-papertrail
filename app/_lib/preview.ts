import { lookup as dnsLookup } from 'node:dns/promises';
import net from 'node:net';

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 200 * 1024;
const MAX_REDIRECTS = 5;

export interface LinkPreview {
  title: string | null;
  description: string | null;
  image: string | null;
}

function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true; // RFC 1918
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
  if (a === 192 && b === 168) return true; // RFC 1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 0) return true; // "this network"
  return false;
}

function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true; // loopback / unspecified
  // IPv4-mapped (::ffff:a.b.c.d) — check the embedded IPv4 too, otherwise this
  // is a straightforward bypass of the IPv4 checks above.
  if (normalized.startsWith('::ffff:')) {
    const embedded = normalized.slice('::ffff:'.length);
    if (net.isIPv4(embedded)) return isBlockedIPv4(embedded);
  }
  const firstHextet = parseInt(normalized.split(':')[0] || '0', 16);
  if (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) return true; // link-local fe80::/10
  if (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) return true; // unique local fc00::/7 (RFC 4193)
  return false;
}

/** Exported for unit testing — the actual SSRF guard used by fetchLinkPreview. */
export function isBlockedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedIPv4(ip);
  if (net.isIPv6(ip)) return isBlockedIPv6(ip);
  return true; // unrecognised shape — fail closed
}

async function assertHostIsFetchable(hostname: string): Promise<void> {
  let addresses: { address: string }[];
  try {
    addresses = await dnsLookup(hostname, { all: true });
  } catch {
    throw new Error('Could not resolve that host.');
  }
  if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
    throw new Error('That address is not allowed.');
  }
}

/**
 * Fetches with the SSRF guard applied on every hop: resolve-then-block
 * private/loopback/link-local ranges before each request, including
 * redirect targets — never follows fetch()'s automatic redirect (that would
 * skip re-validation of the redirected host).
 */
async function safeFetch(targetUrl: string, redirectsLeft: number): Promise<Response> {
  const parsed = new URL(targetUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed.');
  }
  await assertHostIsFetchable(parsed.hostname);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(parsed.toString(), { signal: controller.signal, redirect: 'manual' });
  } finally {
    clearTimeout(timer);
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) throw new Error('Redirect with no location.');
    if (redirectsLeft <= 0) throw new Error('Too many redirects.');
    return safeFetch(new URL(location, parsed).toString(), redirectsLeft - 1);
  }

  return response;
}

async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
      if (total >= maxBytes) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
    .subarray(0, maxBytes)
    .toString('utf-8');
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function scanMetaTags(html: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const tagMatch of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = tagMatch[0];
    const propMatch = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i);
    const contentMatch = tag.match(/content\s*=\s*["']([^"']*)["']/i);
    if (propMatch?.[1] && contentMatch?.[1] !== undefined) {
      map.set(propMatch[1].toLowerCase(), decodeHtmlEntities(contentMatch[1]));
    }
  }
  return map;
}

function extractTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = match?.[1];
  return title ? decodeHtmlEntities(title.trim()) || null : null;
}

function resolveUrl(maybeRelative: string, base: string): string | null {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return null;
  }
}

/**
 * Server-side-only OpenGraph/HTML-meta scraper (PTR-08). Only ever call this
 * from the preview route handler — never import it into a client component.
 */
export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  const response = await safeFetch(url, MAX_REDIRECTS);
  if (!response.ok) {
    throw new Error(`Could not fetch that page (status ${response.status}).`);
  }

  const html = await readBounded(response, MAX_BYTES);
  const meta = scanMetaTags(html);

  const title = meta.get('og:title') ?? extractTitleTag(html);
  const description = meta.get('og:description') ?? meta.get('description') ?? null;
  const rawImage = meta.get('og:image') ?? null;

  return {
    title: title ?? null,
    description,
    image: rawImage ? resolveUrl(rawImage, response.url || url) : null,
  };
}
