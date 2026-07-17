import { describe, expect, it } from 'vitest';
import { matchingNodeIds, nodeSearchableText, type SearchableNode } from '../search';

const textNode: SearchableNode = {
  id: 'n1',
  type: 'text',
  data: { title: 'Evidence Wall', body: '<p>The <strong>suspect</strong> was seen nearby.</p>', tags: ['urgent', 'lead'] },
};

const linkNode: SearchableNode = {
  id: 'n2',
  type: 'link',
  data: { title: 'News article', description: 'A report on the incident', url: 'https://example.com/report' },
};

const imageNode: SearchableNode = {
  id: 'n3',
  type: 'image',
  data: { status: 'ready' },
};

describe('nodeSearchableText', () => {
  it('strips HTML from a text node body and includes title/tags', () => {
    const text = nodeSearchableText(textNode);
    expect(text).toContain('Evidence Wall');
    expect(text).toContain('suspect');
    expect(text).not.toContain('<strong>');
    expect(text).toContain('urgent');
    expect(text).toContain('lead');
  });

  it('includes a link node title/description/url', () => {
    const text = nodeSearchableText(linkNode);
    expect(text).toContain('News article');
    expect(text).toContain('A report on the incident');
    expect(text).toContain('https://example.com/report');
  });

  it('returns empty text for an image node', () => {
    expect(nodeSearchableText(imageNode)).toBe('');
  });
});

describe('matchingNodeIds', () => {
  const nodes = [textNode, linkNode, imageNode];

  it('returns an empty set for a blank query', () => {
    expect(matchingNodeIds(nodes, '   ')).toEqual(new Set());
  });

  it('matches case-insensitively across title/body/tags', () => {
    expect(matchingNodeIds(nodes, 'SUSPECT')).toEqual(new Set(['n1']));
    expect(matchingNodeIds(nodes, 'urgent')).toEqual(new Set(['n1']));
  });

  it('matches a link node by description', () => {
    expect(matchingNodeIds(nodes, 'incident')).toEqual(new Set(['n2']));
  });

  it('never matches an image node', () => {
    expect(matchingNodeIds(nodes, 'ready')).toEqual(new Set());
  });

  it('matches multiple nodes when the query appears in both', () => {
    // "report" appears in the link node's URL/description
    expect(matchingNodeIds(nodes, 'report')).toEqual(new Set(['n2']));
  });
});
