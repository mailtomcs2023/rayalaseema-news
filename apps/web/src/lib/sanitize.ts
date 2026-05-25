import sanitizeHtml from "sanitize-html";

// Centralised HTML sanitiser for any user-authored content we render via
// `dangerouslySetInnerHTML`. Two presets:
//
//   • articleHtml — TipTap output for the public article body. Keeps the
//     editor-supported elements (headings, paragraphs, lists, blockquote,
//     images, links, basic inline formatting) and strips everything else.
//
//   • adHtml     — admin-supplied display ad markup. Slightly more permissive:
//     allows tracking pixels and inline width/height styling, but still drops
//     <script>, event handlers, <iframe>, and javascript: URLs.
//
// Both presets reject every `on*` event handler, every `javascript:` URL, and
// every <script>/<iframe>/<object>/<embed>/<form> tag — the well-known XSS
// vectors that our previous regex-based filter only partially handled.

const COMMON_DROP_TAGS = ["script", "style", "iframe", "object", "embed", "form"];

const ARTICLE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "br", "hr",
    "strong", "em", "b", "i", "u", "s", "mark", "code", "pre",
    "ul", "ol", "li",
    "blockquote", "cite",
    "a", "img",
    "figure", "figcaption",
    "table", "thead", "tbody", "tr", "th", "td",
    "span", "div",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    th: ["colspan", "rowspan", "scope"],
    td: ["colspan", "rowspan"],
    "*": ["class"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  // Force every <a> opening a new tab to set rel="noopener noreferrer" so the
  // tab can't access window.opener.
  transformTags: {
    a: (tagName, attribs) => {
      const newAttribs: Record<string, string> = { ...attribs };
      if (newAttribs.target === "_blank") {
        newAttribs.rel = "noopener noreferrer";
      }
      return { tagName, attribs: newAttribs };
    },
  },
  disallowedTagsMode: "discard",
  exclusiveFilter: () => false,
};

ARTICLE_OPTIONS.allowedTags = (ARTICLE_OPTIONS.allowedTags as string[]).filter(
  (t) => !COMMON_DROP_TAGS.includes(t),
);

const AD_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "a", "img", "div", "span", "p", "br",
    "strong", "em", "b", "i", "u",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "picture", "source", "video",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel", "class", "style"],
    img: ["src", "alt", "title", "width", "height", "loading", "class", "style"],
    video: ["src", "poster", "controls", "autoplay", "muted", "loop", "playsinline", "width", "height", "class", "style"],
    source: ["src", "type", "media", "srcset", "sizes"],
    picture: ["class", "style"],
    div: ["class", "style"],
    span: ["class", "style"],
    p: ["class", "style"],
    "*": ["class"],
  },
  allowedSchemes: ["http", "https"],
  allowedSchemesAppliedToAttributes: ["href", "src", "srcset"],
  // Allow inline `style` but constrain it — only width/height/display/etc.,
  // never URL-bearing properties (background-image) or javascript expressions.
  allowedStyles: {
    "*": {
      width: [/^\d+(?:px|%|em|rem)$/],
      height: [/^\d+(?:px|%|em|rem)$/],
      "max-width": [/^\d+(?:px|%|em|rem)$/],
      display: [/^(?:block|inline|inline-block|flex|grid)$/],
      "text-align": [/^(?:left|right|center)$/],
      margin: [/^[\d\s.a-z%-]+$/i],
      padding: [/^[\d\s.a-z%-]+$/i],
      "border-radius": [/^\d+(?:px|%)$/],
    },
  },
  transformTags: {
    a: (tagName, attribs) => {
      const newAttribs: Record<string, string> = { ...attribs };
      if (!newAttribs.target) newAttribs.target = "_blank";
      newAttribs.rel = "noopener noreferrer";
      return { tagName, attribs: newAttribs };
    },
  },
  disallowedTagsMode: "discard",
};

export function sanitizeArticleHtml(html: string): string {
  if (!html) return "";
  return sanitizeHtml(html, ARTICLE_OPTIONS);
}

export function sanitizeAdHtml(html: string): string {
  if (!html) return "";
  return sanitizeHtml(html, AD_OPTIONS);
}

// AMP-specific cleanup: same drop list as the article preset, but we still
// need to convert <img> → <amp-img> and strip inline `style` (forbidden by
// the AMP spec). Done as a post-step on top of the sanitised article HTML.
const AMP_OPTIONS: sanitizeHtml.IOptions = {
  ...ARTICLE_OPTIONS,
  // AMP disallows generic <img>; allow it here so we can post-process to <amp-img>.
  // Strip inline styles — AMP only accepts <style amp-custom>.
  allowedAttributes: {
    ...ARTICLE_OPTIONS.allowedAttributes,
    "*": ["class"],
  },
};

export function sanitizeForAmp(html: string): string {
  if (!html) return "";
  const cleaned = sanitizeHtml(html, AMP_OPTIONS);
  return cleaned.replace(
    /<img\b([^>]*?)src=("|')(.*?)\2([^>]*?)\/?>/gi,
    (_m, pre, _q, src, post) => {
      const altMatch = (pre + post).match(/alt=("|')(.*?)\1/);
      const alt = altMatch ? altMatch[2] : "";
      return `<amp-img src="${src}" alt="${alt}" width="800" height="450" layout="responsive"></amp-img>`;
    },
  );
}
