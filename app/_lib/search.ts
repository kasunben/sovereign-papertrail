/**
 * Board-wide search (PTR-10) — matches across a text node's title/body/tags
 * and a link node's title/description/url. Image nodes have no searchable
 * text of their own. Structurally typed against the node shapes rather than
 * importing Canvas's client-only types, so this stays a plain, unit-testable
 * function with no 'use client' dependency.
 */

export interface SearchableNodeBase {
  id: string;
}

export type SearchableNode = SearchableNodeBase &
  (
    | { type: 'text'; data: { title: string; body: string; tags: string[] } }
    | { type: 'link'; data: { title?: string | null; description?: string | null; url: string } }
    | { type: 'image'; data: Record<string, unknown> }
  );

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ');
}

export function nodeSearchableText(node: SearchableNode): string {
  switch (node.type) {
    case 'text':
      return [node.data.title, stripHtml(node.data.body), node.data.tags.join(' ')].join(' ');
    case 'link':
      return [node.data.title ?? '', node.data.description ?? '', node.data.url].join(' ');
    case 'image':
      return '';
  }
}

export function matchingNodeIds(nodes: SearchableNode[], query: string): Set<string> {
  const trimmed = query.trim().toLowerCase();
  const matched = new Set<string>();
  if (!trimmed) return matched;
  for (const node of nodes) {
    if (nodeSearchableText(node).toLowerCase().includes(trimmed)) {
      matched.add(node.id);
    }
  }
  return matched;
}
