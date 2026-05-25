import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// GET /api/epaper/layout?date= — edition layout + titles of referenced articles
export async function GET(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;

  const sp = new URL(req.url).searchParams;
  const dateParam = sp.get("date");
  if (!dateParam) return NextResponse.json({ error: "date required" }, { status: 400 });
  const editionKey = sp.get("edition") || "main";
  const editionDate = new Date(dateParam);
  editionDate.setHours(0, 0, 0, 0);

  try {
    const edition = await prisma.epaperEdition.findUnique({
      where: { date_edition: { date: editionDate, edition: editionKey } },
    });
    if (!edition) return NextResponse.json({ error: "Edition not found" }, { status: 404 });

    // Resolve referenced article titles for the editor display
    const layout = (edition.layout as any) || { pages: [] };
    const ids = new Set<string>();
    for (const p of layout.pages || []) {
      if (p.slots?.lead) ids.add(p.slots.lead);
      [...(p.slots?.majors || []), ...(p.slots?.secondary || []), ...(p.slots?.briefs || [])].forEach((id: string) => ids.add(id));
    }
    const arts = await prisma.article.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, title: true, category: { select: { name: true } } },
    });
    const titles: Record<string, { title: string; category: string }> = {};
    arts.forEach((a) => (titles[a.id] = { title: a.title, category: a.category.name }));

    return NextResponse.json({ status: edition.status, layout, titles });
  } catch (error) {
    return apiError(error);
  }
}

// PUT /api/epaper/layout?date= — save edited layout
export async function PUT(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;

  const sp = new URL(req.url).searchParams;
  const dateParam = sp.get("date");
  if (!dateParam) return NextResponse.json({ error: "date required" }, { status: 400 });
  const editionKey = sp.get("edition") || "main";
  const editionDate = new Date(dateParam);
  editionDate.setHours(0, 0, 0, 0);

  try {
    const body = await req.json();
    if (!body.pages || !Array.isArray(body.pages)) {
      return NextResponse.json({ error: "pages array required" }, { status: 400 });
    }
    await prisma.epaperEdition.update({
      where: { date_edition: { date: editionDate, edition: editionKey } },
      data: { layout: { pages: body.pages } as any, status: "draft" },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
