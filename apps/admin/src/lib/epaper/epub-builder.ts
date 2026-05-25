// Minimal ePub3 builder (#97).
//
// Produces a valid .epub (ZIP) for an EpaperEdition by walking its pages,
// emitting one XHTML chapter per page (using the article text already in DB),
// plus the required OPF + nav + container files.
//
// No external dep — writes a store-only (no deflate) ZIP by hand. ePub3
// validators allow store-only for mimetype + arbitrary deflate for the rest;
// we use store-only throughout for simplicity. Trade: ~30% larger file. Fine
// for a daily edition (text + no embedded images), and reader compatibility
// is universal (Kindle Previewer, Kobo, Apple Books).

import { prisma } from "@rayalaseema/db";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";

// CRC32 table for ZIP entry checksums.
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

interface ZipEntry { name: string; data: Buffer; }

function buildZip(entries: ZipEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const crc = crc32(e.data);
    const size = e.data.length;
    // Local file header (30 bytes + name + data). Method 0 = store.
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);    // version
    lfh.writeUInt16LE(0, 6);     // flags
    lfh.writeUInt16LE(0, 8);     // method = store
    lfh.writeUInt16LE(0, 10); lfh.writeUInt16LE(0, 12); // time/date
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(size, 18); // compressed
    lfh.writeUInt32LE(size, 22); // uncompressed
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);    // extra len
    chunks.push(lfh, nameBuf, e.data);

    // Central directory entry.
    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4); cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8); cdh.writeUInt16LE(0, 10);
    cdh.writeUInt16LE(0, 12); cdh.writeUInt16LE(0, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(size, 20); cdh.writeUInt32LE(size, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30); cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34); cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
    cdh.writeUInt32LE(offset, 42);
    central.push(cdh, nameBuf);
    offset += lfh.length + nameBuf.length + e.data.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBuf, eocd]);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function stripHtml(s: string): string {
  return s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
}

export async function buildEpubForEdition(editionId: string): Promise<{ buffer: Buffer; filename: string }> {
  const edition = await prisma.epaperEdition.findUnique({
    where: { id: editionId },
    include: { pages: { orderBy: { pageNumber: "asc" } } },
  });
  if (!edition) throw new Error("Edition not found");

  // Resolve all article ids referenced across the edition.
  const articleIds = new Set<string>();
  for (const p of edition.pages) {
    const blocks = ((p.layout as any)?.blocks || []) as Array<{ articleId?: string }>;
    for (const b of blocks) if (b.articleId) articleIds.add(b.articleId);
  }
  const articles = articleIds.size > 0
    ? await prisma.article.findMany({
        where: { id: { in: [...articleIds] } },
        select: { id: true, title: true, summary: true, body: true },
      })
    : [];
  const byId = new Map(articles.map((a) => [a.id, a]));

  const isoDate = edition.date.toISOString();
  const dateStr = isoDate.slice(0, 10);
  const uid = `urn:re-epaper:${editionId}:${createHash("sha1").update(editionId).digest("hex").slice(0, 16)}`;
  const title = edition.title || `రాయలసీమ ఎక్స్‌ప్రెస్ — ${dateStr}`;

  // Per-page chapters.
  const chapters: Array<{ id: string; href: string; title: string; xhtml: string }> = [];
  for (const p of edition.pages) {
    const blocks = ((p.layout as any)?.blocks || []) as Array<{ articleId?: string; type: string; overrideTitle?: string; overrideDek?: string }>;
    const stories: string[] = [];
    for (const b of blocks) {
      if (!b.articleId) continue;
      const a = byId.get(b.articleId);
      if (!a) continue;
      const h = esc(b.overrideTitle?.trim() || a.title);
      const body = esc(stripHtml(a.body || a.summary || ""));
      stories.push(`<section><h2>${h}</h2><p>${body}</p></section>`);
    }
    const id = `page-${p.pageNumber}`;
    const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="te" lang="te">
<head><meta charset="UTF-8"/><title>${esc(p.label)}</title></head>
<body><h1>${esc(p.label)}</h1>${stories.join("\n") || "<p><em>No stories on this page.</em></p>"}</body>
</html>`;
    chapters.push({ id, href: `${id}.xhtml`, title: p.label, xhtml });
  }

  // OPF manifest + spine.
  const manifestItems = chapters.map((c) => `<item id="${c.id}" href="${c.href}" media-type="application/xhtml+xml"/>`).join("\n    ");
  const spineItems = chapters.map((c) => `<itemref idref="${c.id}"/>`).join("\n    ");
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="te">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${uid}</dc:identifier>
    <dc:title>${esc(title)}</dc:title>
    <dc:language>te</dc:language>
    <dc:date>${isoDate}</dc:date>
    <dc:publisher>Rayalaseema Express</dc:publisher>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`;

  const navItems = chapters.map((c) => `<li><a href="${c.href}">${esc(c.title)}</a></li>`).join("\n      ");
  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="te" lang="te">
<head><meta charset="UTF-8"/><title>${esc(title)}</title></head>
<body>
  <nav epub:type="toc"><h1>పేజీలు</h1><ol>
      ${navItems}
  </ol></nav>
</body></html>`;

  const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

  const entries: ZipEntry[] = [
    { name: "mimetype", data: Buffer.from("application/epub+zip", "utf8") },
    { name: "META-INF/container.xml", data: Buffer.from(container, "utf8") },
    { name: "OEBPS/content.opf", data: Buffer.from(opf, "utf8") },
    { name: "OEBPS/nav.xhtml", data: Buffer.from(nav, "utf8") },
    ...chapters.map((c) => ({ name: `OEBPS/${c.href}`, data: Buffer.from(c.xhtml, "utf8") })),
  ];

  return {
    buffer: buildZip(entries),
    filename: `rayalaseema-express-${dateStr}-${edition.edition}.epub`,
  };
}
