import sanitizeHtml from 'sanitize-html';

/**
 * Allow-list of text-node formatting tags (SPEC.md "Sanitisation"). No
 * scripts, handlers, iframes, or anything else capable of executing code —
 * only structural/inline formatting a rich-text editor would produce.
 */
const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'blockquote',
  'code',
  'pre',
  'a',
];

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  a: ['href'],
};

/**
 * Sanitises text-node body markup server-side on write (PTR-06). Only ever
 * call this from a server action (`sanitizeTextNodeBody` in actions.ts) —
 * this module itself has no auth boundary, it's a pure function.
 */
export function sanitizeTextMarkup(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
    // Drop the tag but keep any already-sanitised text/child content inside it,
    // rather than dropping disallowed tags (and their content) entirely —
    // matches how a rich-text editor's "unsupported formatting" should degrade.
    disallowedTagsMode: 'discard',
  });
}
