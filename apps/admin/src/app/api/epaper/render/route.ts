import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { uploadBuffer, blobConfigured } from "@/lib/blob";
import { renderBroadsheetPage, type EpaperArticle, type PageOptions } from "@/lib/epaper-template";

export const maxDuration = 300;

interface LayoutPage {
  label: string;
  isFront: boolean;
  slots: { lead: string | null; majors: string[]; secondary: string[]; briefs: string[] };
}

function teluguDate(d: Date): string {
  const months = ["జనవరి","ఫిబ్రవరి","మార్చి","ఏప్రిల్","మే","జూన్","జులై","ఆగస్టు","సెప్టెంబర్","అక్టోబర్","నవంబర్","డిసెంబర్"];
  const days = ["ఆదివారం","సోమవారం","మంగళవారం","బుధవారం","గురువారం","శుక్రవారం","శనివారం"];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${days[d.getUTCDay()]}`;
}

// POST /api/epaper/render?date=YYYY-MM-DD - render the (edited) layout into PDF + page PNGs
export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  if (!blobConfigured()) {
    return NextResponse.json({ error: "AZURE_STORAGE_CONNECTION_STRING not configured" }, { status: 503 });
  }

  const sp = new URL(req.url).searchParams;
  const editionKey = sp.get("edition") || "main";
  const editionDate = new Date(sp.get("date") || Date.now());
  editionDate.setHours(0, 0, 0, 0);

  try {
    const edition = await prisma.epaperEdition.findUnique({
      where: { date_edition: { date: editionDate, edition: editionKey } },
    });
    if (!edition || !edition.layout) {
      return NextResponse.json({ error: "No draft layout - build a draft first" }, { status: 400 });
    }
    const pagesPlan = (edition.layout as any).pages as LayoutPage[];
    if (!pagesPlan?.length) {
      return NextResponse.json({ error: "Layout has no pages" }, { status: 400 });
    }

    // Fetch every article referenced by the layout, in one query
    const ids = new Set<string>();
    for (const p of pagesPlan) {
      if (p.slots.lead) ids.add(p.slots.lead);
      [...p.slots.majors, ...p.slots.secondary, ...p.slots.briefs].forEach((id) => ids.add(id));
    }
    const arts = await prisma.content.findMany({
      where: { type: "ARTICLE", id: { in: [...ids] } },
      select: {
        id: true, slug: true, title: true, summary: true, featuredImage: true,
        category: { select: { name: true } },
        desk: { select: { name: true } },
      },
    });
    const artMap = new Map<string, EpaperArticle>(
      arts.map((a) => [a.id, {
        slug: a.slug || "",
        title: a.title,
        summary: a.summary,
        featuredImage: a.featuredImage,
        categoryName: a.category?.name || "",
        deskName: a.desk?.name ?? null,
      }])
    );
    const get = (id: string | null): EpaperArticle | null => (id ? artMap.get(id) || null : null);
    const getMany = (idList: string[]) => idList.map(get).filter(Boolean) as EpaperArticle[];

    // Ads keyed by pageNumber → { top, bottom }
    const adRows = await prisma.epaperAd.findMany({ where: { editionId: edition.id } });
    const adsByPage = new Map<number, { top?: string; bottom?: string }>();
    for (const ad of adRows) {
      const e = adsByPage.get(ad.pageNumber) || {};
      if (ad.slot === "bottom") e.bottom = ad.imageUrl;
      else e.top = ad.imageUrl;
      adsByPage.set(ad.pageNumber, e);
    }

    await prisma.epaperEdition.update({ where: { id: edition.id }, data: { status: "generating" } });
    await prisma.epaperPage.deleteMany({ where: { editionId: edition.id } });

    const dateLabel = teluguDate(editionDate);
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1200, height: 2000 }, deviceScaleFactor: 2 });
    const pdf = await PDFDocument.create();
    const pageRows: { pageNumber: number; label: string; imageUrl: string; hotspots: unknown }[] = [];

    try {
      for (let i = 0; i < pagesPlan.length; i++) {
        const lp = pagesPlan[i];
        const lead = get(lp.slots.lead);
        if (!lead) continue;
        const opts: PageOptions = {
          isFront: lp.isFront,
          sectionLabel: lp.label,
          dateLabel,
          pageNumber: i + 1,
          totalPages: pagesPlan.length,
          lead,
          majors: getMany(lp.slots.majors),
          secondary: getMany(lp.slots.secondary),
          briefs: getMany(lp.slots.briefs),
          adTop: adsByPage.get(i + 1)?.top || null,
          adBottom: adsByPage.get(i + 1)?.bottom || null,
        };
        await page.setContent(renderBroadsheetPage(opts), { waitUntil: "networkidle" });

        const hotspots = await page.$$eval("[data-slug]", (els) =>
          els
            .map((el) => {
              const r = el.getBoundingClientRect();
              return {
                slug: el.getAttribute("data-slug") || "",
                x: +(r.x / 1200).toFixed(4),
                y: +(r.y / 2000).toFixed(4),
                w: +(r.width / 1200).toFixed(4),
                h: +(r.height / 2000).toFixed(4),
              };
            })
            .filter((b) => b.slug && b.w > 0 && b.h > 0)
        );

        const png = await page.screenshot({ type: "png" });
        const imageUrl = await uploadBuffer(Buffer.from(png), "png", "image/png");
        pageRows.push({ pageNumber: i + 1, label: lp.label, imageUrl, hotspots });

        const embedded = await pdf.embedPng(png);
        const pdfPage = pdf.addPage([embedded.width, embedded.height]);
        pdfPage.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
      }
    } finally {
      await browser.close();
    }

    const pdfBytes = await pdf.save();
    const pdfUrl = await uploadBuffer(Buffer.from(pdfBytes), "pdf", "application/pdf");

    await prisma.epaperPage.createMany({
      data: pageRows.map((r) => ({
        editionId: edition.id,
        pageNumber: r.pageNumber,
        label: r.label,
        imageUrl: r.imageUrl,
        hotspots: r.hotspots as any,
      })),
    });
    await prisma.epaperEdition.update({
      where: { id: edition.id },
      data: { status: "ready", pdfUrl, pageCount: pageRows.length, thumbnailUrl: pageRows[0]?.imageUrl },
    });

    return NextResponse.json({ success: true, pages: pageRows.length, pdfUrl });
  } catch (error) {
    await prisma.epaperEdition
      .update({ where: { date_edition: { date: editionDate, edition: editionKey } }, data: { status: "failed" } })
      .catch(() => {});
    return apiError(error);
  }
}
