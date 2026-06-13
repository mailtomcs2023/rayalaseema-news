// A small, dependency-free HTML → blocks parser for rendering CMS article
// bodies natively (no WebView, no react-native-render-html). It handles the
// tags the editor actually produces - paragraphs, headings, lists, images,
// blockquotes, links, bold/italic - and degrades gracefully on anything else
// (unknown tags are dropped, their text kept).

export interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
  href?: string;
}

export type Block =
  | { kind: "para"; spans: Span[] }
  | { kind: "heading"; level: number; spans: Span[] }
  | { kind: "listitem"; ordered: boolean; index: number; spans: Span[] }
  | { kind: "quote"; spans: Span[] }
  | { kind: "image"; src: string };

const NAMED: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
  mdash: "—",
  ndash: "–",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const num = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isNaN(num) ? m : String.fromCodePoint(num);
    }
    return NAMED[code.toLowerCase()] ?? m;
  });
}

const BLOCK_TAGS = new Set(["p", "div", "section", "article", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "figure", "figcaption"]);

// Parse the body into an ordered list of render-ready blocks.
export function parseHtmlBlocks(html: string | null | undefined): Block[] {
  if (!html) return [];
  // Drop script/style/comments outright.
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  const blocks: Block[] = [];
  let spans: Span[] = [];
  let bold = 0;
  let italic = 0;
  let href: string | null = null;
  let heading = 0; // 0 = paragraph, else heading level
  let quote = false;
  let ordered = false;
  let listCounter = 0;
  let inList = false;

  const pushText = (raw: string) => {
    const text = decodeEntities(raw).replace(/\s+/g, " ");
    if (!text || text === " ") {
      // keep a single space between inline runs, drop pure whitespace blocks
      if (text === " " && spans.length) spans.push({ text: " " });
      return;
    }
    spans.push({ text, bold: bold > 0 || undefined, italic: italic > 0 || undefined, href: href ?? undefined });
  };

  const flush = () => {
    const trimmed = trimSpans(spans);
    if (trimmed.length) {
      if (inList) blocks.push({ kind: "listitem", ordered, index: listCounter, spans: trimmed });
      else if (heading) blocks.push({ kind: "heading", level: heading, spans: trimmed });
      else if (quote) blocks.push({ kind: "quote", spans: trimmed });
      else blocks.push({ kind: "para", spans: trimmed });
    }
    spans = [];
  };

  const tagRe = /<(\/?)([a-z0-9]+)([^>]*)>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(cleaned)) !== null) {
    // Text before this tag belongs to the current block.
    if (m.index > last) pushText(cleaned.slice(last, m.index));
    last = tagRe.lastIndex;

    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    const attrs = m[3] || "";

    if (tag === "br") {
      spans.push({ text: "\n" });
      continue;
    }
    if (tag === "img" && !closing) {
      flush();
      const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
      if (src) blocks.push({ kind: "image", src });
      continue;
    }
    if (tag === "strong" || tag === "b") {
      bold += closing ? -1 : 1;
      if (bold < 0) bold = 0;
      continue;
    }
    if (tag === "em" || tag === "i") {
      italic += closing ? -1 : 1;
      if (italic < 0) italic = 0;
      continue;
    }
    if (tag === "a") {
      if (closing) href = null;
      else href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? null;
      continue;
    }
    if (tag === "ul" || tag === "ol") {
      flush();
      if (!closing) {
        inList = true;
        ordered = tag === "ol";
        listCounter = 0;
      } else {
        inList = false;
      }
      continue;
    }
    if (tag === "li") {
      if (closing) flush();
      else {
        flush();
        listCounter += 1;
      }
      continue;
    }
    if (BLOCK_TAGS.has(tag)) {
      flush();
      if (!closing) {
        heading = /^h([1-6])$/.exec(tag) ? Number(tag[1]) : 0;
        quote = tag === "blockquote";
      } else {
        heading = 0;
        quote = false;
      }
      continue;
    }
    // Unknown tag - ignore, keep any text around it.
  }
  if (last < cleaned.length) pushText(cleaned.slice(last));
  flush();

  return blocks;
}

function trimSpans(spans: Span[]): Span[] {
  const out = spans.slice();
  while (out.length && out[0].text.trim() === "" && out[0].text !== "\n") out.shift();
  while (out.length && out[out.length - 1].text.trim() === "" && out[out.length - 1].text !== "\n") out.pop();
  return out;
}
