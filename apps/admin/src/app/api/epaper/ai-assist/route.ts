import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// POST /api/epaper/ai-assist
//   { action: "suggest-lead", date }                              → top-3 article ids for front-page lead
//   { action: "shorten-headline", articleId, maxChars }           → array of 3 shorter headlines
//
// Uses Azure OpenAI deployment (GPT-5.1) already configured for /api/ai/rewrite.

const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const KEY = process.env.AZURE_OPENAI_KEY;
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt51";
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";

async function callLLM(systemPrompt: string, userMsg: string): Promise<string> {
  if (!ENDPOINT || !KEY) throw new Error("Azure OpenAI not configured");
  const url = `${ENDPOINT}openai/deployments/${DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": KEY },
    body: JSON.stringify({
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMsg }],
      temperature: 0.6,
      max_tokens: 600,
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR", "SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    const action = body?.action as string;

    if (action === "suggest-lead") {
      // Pull last-24h published articles + a small bag of metadata; ask LLM
      // to rank top 3 for front-page lead with one-line reasoning each.
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const articles = await prisma.article.findMany({
        where: { status: "PUBLISHED", publishedAt: { gte: since } },
        select: {
          id: true, title: true, summary: true, breaking: true, featured: true, viewCount: true,
          category: { select: { name: true } },
        },
        orderBy: { publishedAt: "desc" },
        take: 60,
      });
      if (articles.length === 0) {
        return NextResponse.json({ suggestions: [], reason: "No fresh articles in the last 24h." });
      }
      const slim = articles.map((a) => ({
        id: a.id,
        title: a.title.slice(0, 200),
        summary: (a.summary || "").slice(0, 200),
        breaking: a.breaking,
        featured: a.featured,
        viewCount: a.viewCount,
        category: a.category.name,
      }));
      const sys = `You're the chief editor of a Rayalaseema regional Telugu newspaper. Pick the 3 most newsworthy articles for tomorrow's FRONT PAGE LEAD from the supplied list. Optimize for: public interest, regional relevance, exclusivity, urgency. Reply as pure JSON array with shape [{id,reason}]. No markdown.`;
      const raw = await callLLM(sys, JSON.stringify(slim));
      // Try to parse; if LLM wrapped in markdown, strip.
      const clean = raw.replace(/```json|```/g, "").trim();
      let parsed: Array<{ id: string; reason: string }> = [];
      try { parsed = JSON.parse(clean); } catch { /* keep empty */ }
      return NextResponse.json({ suggestions: parsed.slice(0, 3) });
    }

    if (action === "shorten-headline") {
      const articleId = body?.articleId as string;
      const maxChars = Number(body?.maxChars || 60);
      const article = await prisma.article.findUnique({ where: { id: articleId }, select: { title: true } });
      if (!article) return NextResponse.json({ error: "Article not found" }, { status: 404 });
      const sys = `Rewrite the given Telugu newspaper headline to fit within ${maxChars} characters while preserving the news angle. Reply with exactly 3 alternative headlines, one per line, no numbering, no quotes, no explanation.`;
      const raw = await callLLM(sys, article.title);
      const variants = raw.split("\n").map((s) => s.trim()).filter((s) => s.length > 0 && s.length <= maxChars + 10).slice(0, 3);
      return NextResponse.json({ original: article.title, variants });
    }

    return NextResponse.json({ error: `Unknown action ${action}` }, { status: 400 });
  } catch (e) {
    return apiError(e);
  }
}
