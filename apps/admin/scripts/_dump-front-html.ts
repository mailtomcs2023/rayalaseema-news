import { prisma } from "@rayalaseema/db";
import { renderEpaperPageById } from "../src/lib/epaper/render-layout";
import fs from "node:fs";

async function main() {
  const p = await prisma.epaperPage.findFirst({ where: { templateSlug: "front" }, orderBy: { createdAt: "desc" }, select: { id: true, layout: true } });
  if (!p) { console.log("no front page"); return; }
  const blocks = (p.layout as any).blocks as any[];
  const lead = blocks.find((b) => b.type === "lead");
  console.log("LEAD block:", JSON.stringify(lead));
  if (lead?.articleId) {
    const a = await prisma.content.findUnique({ where: { id: lead.articleId }, select: { title: true, slug: true, featuredImage: true, body: true, summary: true } });
    console.log("LEAD article title:", a?.title);
    console.log("LEAD article slug:", a?.slug);
    console.log("LEAD featuredImage:", a?.featuredImage);
    console.log("LEAD summary len:", (a?.summary || "").length);
    console.log("LEAD body len:", (a?.body || "").length);
    console.log("LEAD body[0..200]:", (a?.body || "").slice(0, 200));
  }
  const html = await renderEpaperPageById(p.id);
  fs.writeFileSync("c:/tmp/front.html", html);
  const i = html.indexOf('class="lead block"');
  console.log("\n--- lead block HTML (700 chars) ---\n" + html.slice(i - 20, i + 700));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
