import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// Auto-builds an EDITABLE layout plan from published articles.
// Staff then tweak slot assignments in the admin editor before rendering.
// POST /api/epaper/draft?date=YYYY-MM-DD&edition=main|<district-slug>

const PAGE_PLAN: { slug: string | null; label: string }[] = [
  { slug: null, label: "ముఖ్యాంశాలు" },
  { slug: "politics", label: "రాజకీయం" },
  { slug: "district-news", label: "జిల్లా వార్తలు" },
  { slug: "national", label: "జాతీయం" },
  { slug: "international", label: "అంతర్జాతీయం" },
  { slug: "business", label: "వ్యాపారం" },
  { slug: "sports", label: "క్రీడలు" },
  { slug: "entertainment", label: "సినిమా" },
  { slug: "crime", label: "నేరాలు" },
  { slug: "agriculture", label: "వ్యవసాయం" },
  { slug: "education", label: "విద్య" },
  { slug: "health", label: "ఆరోగ్యం" },
  { slug: "technology", label: "టెక్నాలజీ" },
  { slug: "devotional", label: "భక్తి" },
  { slug: "editorial", label: "సంపాదకీయం" },
];
const SOFT = new Set(["rasi-phalalu", "weather", "navyaseema"]);

interface LayoutPage {
  label: string;
  isFront: boolean;
  slots: { lead: string | null; majors: string[]; secondary: string[]; briefs: string[] };
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;

  const sp = new URL(req.url).searchParams;
  const editionKey = sp.get("edition") || "main";
  const editionDate = new Date(sp.get("date") || Date.now());
  editionDate.setHours(0, 0, 0, 0);

  try {
    const articles = await prisma.content.findMany({
      where: { type: "ARTICLE", status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 600,
      select: { id: true, title: true, summary: true, constituencyId: true, category: { select: { slug: true } } },
    });

    const byCat: Record<string, string[]> = {};
    for (const a of articles) {
      const slug = a.category?.slug;
      if (slug) (byCat[slug] ||= []).push(a.id);
    }

    // District edition - front + district-news pages drawn from this district's articles
    let districtName = "";
    let districtPool: string[] = [];
    if (editionKey !== "main") {
      const district = await prisma.district.findUnique({
        where: { slug: editionKey },
        include: { constituencies: { select: { id: true } } },
      });
      if (!district) return NextResponse.json({ error: "Unknown district" }, { status: 400 });
      districtName = district.name;
      const constIds = new Set(district.constituencies.map((c) => c.id));
      districtPool = articles
        .filter(
          (a) =>
            (a.constituencyId && constIds.has(a.constituencyId)) ||
            a.title.includes(district.name) ||
            a.title.toLowerCase().includes(district.nameEn.toLowerCase()) ||
            (a.summary || "").includes(district.name)
        )
        .map((a) => a.id);
    }

    // category is nullable on Content (uncategorised drafts) - treat those as
    // soft so they don't fall into the front-page pool by default.
    const isFrontCandidate = (a: (typeof articles)[number]) =>
      !!a.category && !SOFT.has(a.category.slug);
    const frontPool =
      editionKey === "main"
        ? articles.filter(isFrontCandidate).map((a) => a.id)
        : districtPool.length
        ? districtPool
        : articles.filter(isFrontCandidate).map((a) => a.id);

    const pages: LayoutPage[] = PAGE_PLAN.map((p) => {
      let ids: string[];
      if (p.slug === null) ids = frontPool;
      else if (p.slug === "district-news" && editionKey !== "main") ids = districtPool.length ? districtPool : byCat["district-news"] || [];
      else ids = byCat[p.slug] || [];
      return {
        label: p.slug === "district-news" && districtName ? `${districtName} వార్తలు` : p.label,
        isFront: p.slug === null,
        slots: { lead: ids[0] || null, majors: ids.slice(1, 3), secondary: ids.slice(3, 6), briefs: ids.slice(6, 16) },
      };
    }).filter((p) => p.slots.lead);

    if (pages.length === 0) {
      return NextResponse.json({ error: "No published articles" }, { status: 400 });
    }

    const dateLabel = editionDate.toLocaleDateString("te-IN", { day: "numeric", month: "long", year: "numeric" });
    const title = `రాయలసీమ న్యూస్${districtName ? ` - ${districtName} ఎడిషన్` : ""} · ${dateLabel}`;

    const existing = await prisma.epaperEdition.findUnique({
      where: { date_edition: { date: editionDate, edition: editionKey } },
    });
    const edition = existing
      ? await prisma.epaperEdition.update({
          where: { id: existing.id },
          data: { layout: { pages } as any, status: "draft", title },
        })
      : await prisma.epaperEdition.create({
          data: { date: editionDate, edition: editionKey, layout: { pages } as any, status: "draft", title, pdfUrl: null },
        });

    return NextResponse.json({ success: true, editionId: edition.id, edition: editionKey, pages: pages.length });
  } catch (error) {
    return apiError(error);
  }
}
