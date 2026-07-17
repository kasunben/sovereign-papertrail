import { sanitizeTextMarkup } from './sanitize';

export type NodeType = 'text' | 'image' | 'link';
const NODE_TYPES: NodeType[] = ['text', 'image', 'link'];

export interface NodePosition {
  x: number;
  y: number;
}

export interface ValidatedNode {
  id: string;
  type: NodeType;
  position: NodePosition;
  data: Record<string, unknown>;
}

export interface ValidatedEdge {
  id: string;
  source: string;
  target: string;
  data: Record<string, unknown> | null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Only same-origin-relative or http(s) URLs are ever persisted — anything
 * else (`javascript:`, `data:`, etc.) is a stored-XSS vector once rendered
 * back as an `<a href>` (LinkNode) or `<img src>` (ImageNode/LinkNode
 * preview image). The board-snapshot PUT route is the write boundary this
 * guards, same as sanitizeTextNodeBody guards text-node body markup.
 */
function isSafeUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (value.startsWith('/')) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function validatePosition(value: unknown): NodePosition | null {
  if (typeof value !== 'object' || value === null) return null;
  const { x, y } = value as Record<string, unknown>;
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
  return { x, y };
}

function validateTextData(raw: Record<string, unknown>): Record<string, unknown> {
  const title = typeof raw.title === 'string' ? raw.title : '';
  const body = typeof raw.body === 'string' ? sanitizeTextMarkup(raw.body) : '';
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string') : [];
  return { title, body, tags };
}

function validateImageData(raw: Record<string, unknown>): Record<string, unknown> | null {
  if (!isSafeUrl(raw.url) || !isSafeUrl(raw.thumbnailUrl)) return null;
  return {
    url: raw.url,
    thumbnailUrl: raw.thumbnailUrl,
    width: isFiniteNumber(raw.width) ? raw.width : 0,
    height: isFiniteNumber(raw.height) ? raw.height : 0,
  };
}

function validateLinkData(raw: Record<string, unknown>): Record<string, unknown> | null {
  if (!isSafeUrl(raw.url)) return null;
  return {
    url: raw.url,
    title: typeof raw.title === 'string' ? raw.title : null,
    description: typeof raw.description === 'string' ? raw.description : null,
    image: isSafeUrl(raw.image) ? raw.image : null,
  };
}

/**
 * Validates and re-sanitises one client-submitted node before it's allowed
 * into storage — a whole-snapshot PUT could otherwise skip the per-node
 * editor (and its sanitizeTextNodeBody call) entirely. Returns null for a
 * node that fails validation; the caller drops it rather than rejecting the
 * whole save, so one malformed node can't block every other edit on the
 * board from persisting.
 */
export function validateNode(raw: unknown): ValidatedNode | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (!isNonEmptyString(record.id)) return null;
  if (!NODE_TYPES.includes(record.type as NodeType)) return null;
  const type = record.type as NodeType;

  const position = validatePosition(record.position);
  if (!position) return null;

  const rawData =
    typeof record.data === 'object' && record.data !== null ? (record.data as Record<string, unknown>) : {};

  const data =
    type === 'text'
      ? validateTextData(rawData)
      : type === 'image'
        ? validateImageData(rawData)
        : validateLinkData(rawData);
  if (!data) return null;

  return { id: record.id, type, position, data };
}

/** `nodeIds` scopes edges to nodes that also passed validation and belong to this save — a dangling edge is dropped, same fail-soft policy as validateNode. */
export function validateEdge(raw: unknown, nodeIds: Set<string>): ValidatedEdge | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (!isNonEmptyString(record.id)) return null;
  if (!isNonEmptyString(record.source) || !isNonEmptyString(record.target)) return null;
  if (!nodeIds.has(record.source) || !nodeIds.has(record.target)) return null;
  const data =
    typeof record.data === 'object' && record.data !== null ? (record.data as Record<string, unknown>) : null;
  return { id: record.id, source: record.source, target: record.target, data };
}
