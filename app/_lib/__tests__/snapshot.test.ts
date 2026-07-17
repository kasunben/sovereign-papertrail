import { describe, expect, it } from 'vitest';
import { validateEdge, validateNode } from '../snapshot';

describe('validateNode', () => {
  it('accepts a well-formed text node and sanitises its body', () => {
    const result = validateNode({
      id: 'n1',
      type: 'text',
      position: { x: 10, y: 20 },
      data: { title: 'Hello', body: '<p>safe</p><script>alert(1)</script>', tags: ['a', 'b'] },
    });
    expect(result).toEqual({
      id: 'n1',
      type: 'text',
      position: { x: 10, y: 20 },
      data: { title: 'Hello', body: '<p>safe</p>', tags: ['a', 'b'] },
    });
  });

  it('drops non-string tags rather than rejecting the whole node', () => {
    const result = validateNode({
      id: 'n1',
      type: 'text',
      position: { x: 0, y: 0 },
      data: { title: '', body: '', tags: ['ok', 42, null] },
    });
    expect(result?.data.tags).toEqual(['ok']);
  });

  it('accepts a well-formed image node with http(s) URLs', () => {
    const result = validateNode({
      id: 'n2',
      type: 'image',
      position: { x: 0, y: 0 },
      data: { url: '/papertrail/api/assets/p1/a1', thumbnailUrl: '/papertrail/api/assets/p1/a1-thumb', width: 800, height: 600 },
    });
    expect(result).toEqual({
      id: 'n2',
      type: 'image',
      position: { x: 0, y: 0 },
      data: { url: '/papertrail/api/assets/p1/a1', thumbnailUrl: '/papertrail/api/assets/p1/a1-thumb', width: 800, height: 600 },
    });
  });

  it('rejects an image node whose url is a javascript: URI', () => {
    const result = validateNode({
      id: 'n2',
      type: 'image',
      position: { x: 0, y: 0 },
      data: { url: 'javascript:alert(1)', thumbnailUrl: '/x', width: 10, height: 10 },
    });
    expect(result).toBeNull();
  });

  it('accepts a well-formed link node and rejects a link node with an unsafe image URL', () => {
    const good = validateNode({
      id: 'n3',
      type: 'link',
      position: { x: 0, y: 0 },
      data: { url: 'https://example.com', title: 'Example', description: 'desc', image: 'https://example.com/x.png' },
    });
    expect(good?.data.image).toBe('https://example.com/x.png');

    const badImage = validateNode({
      id: 'n3',
      type: 'link',
      position: { x: 0, y: 0 },
      data: { url: 'https://example.com', title: 'Example', description: 'desc', image: 'data:text/html,<script>1</script>' },
    });
    expect(badImage?.data.image).toBeNull();
  });

  it('rejects an unknown node type', () => {
    expect(validateNode({ id: 'n1', type: 'video', position: { x: 0, y: 0 }, data: {} })).toBeNull();
  });

  it('rejects a node missing an id or a non-finite position', () => {
    expect(validateNode({ type: 'text', position: { x: 0, y: 0 }, data: {} })).toBeNull();
    expect(validateNode({ id: 'n1', type: 'text', position: { x: Infinity, y: 0 }, data: {} })).toBeNull();
    expect(validateNode(null)).toBeNull();
    expect(validateNode('not-an-object')).toBeNull();
  });
});

describe('validateEdge', () => {
  const nodeIds = new Set(['a', 'b']);

  it('accepts an edge whose endpoints are both in the known node set', () => {
    const result = validateEdge({ id: 'e1', source: 'a', target: 'b', data: { color: '#000' } }, nodeIds);
    expect(result).toEqual({ id: 'e1', source: 'a', target: 'b', data: { color: '#000' } });
  });

  it('drops an edge whose endpoint is not in the known node set', () => {
    expect(validateEdge({ id: 'e1', source: 'a', target: 'ghost' }, nodeIds)).toBeNull();
  });

  it('drops a malformed edge', () => {
    expect(validateEdge({ id: 'e1', source: 'a' }, nodeIds)).toBeNull();
    expect(validateEdge(null, nodeIds)).toBeNull();
  });

  it('allows a null data payload', () => {
    const result = validateEdge({ id: 'e1', source: 'a', target: 'b' }, nodeIds);
    expect(result).toEqual({ id: 'e1', source: 'a', target: 'b', data: null });
  });
});
