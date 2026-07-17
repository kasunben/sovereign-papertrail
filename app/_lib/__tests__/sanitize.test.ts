import { describe, expect, it } from 'vitest';
import { sanitizeTextMarkup } from '../sanitize';

describe('sanitizeTextMarkup', () => {
  it('keeps allow-listed formatting tags', () => {
    const input = '<p>Hello <strong>world</strong>, <em>truly</em>.</p>';
    expect(sanitizeTextMarkup(input)).toBe(input);
  });

  it('keeps lists and links with an href', () => {
    const input = '<ul><li>one</li><li>two</li></ul><a href="https://example.com">link</a>';
    expect(sanitizeTextMarkup(input)).toBe(input);
  });

  it('strips script tags entirely, including their content', () => {
    const input = '<p>safe</p><script>alert(1)</script>';
    expect(sanitizeTextMarkup(input)).toBe('<p>safe</p>');
  });

  it('strips iframes entirely, including their content', () => {
    const input = '<iframe src="https://evil.example"></iframe><p>safe</p>';
    expect(sanitizeTextMarkup(input)).toBe('<p>safe</p>');
  });

  it('strips inline event handler attributes', () => {
    const input = '<p onclick="alert(1)">text</p>';
    expect(sanitizeTextMarkup(input)).toBe('<p>text</p>');
  });

  it('strips javascript: URLs from links', () => {
    const input = '<a href="javascript:alert(1)">click</a>';
    expect(sanitizeTextMarkup(input)).toBe('<a>click</a>');
  });

  it('discards a disallowed tag but keeps its text content', () => {
    const input = '<div>kept text</div>';
    expect(sanitizeTextMarkup(input)).toBe('kept text');
  });

  it('strips style and class attributes from allowed tags', () => {
    const input = '<p style="color:red" class="foo">text</p>';
    expect(sanitizeTextMarkup(input)).toBe('<p>text</p>');
  });
});
