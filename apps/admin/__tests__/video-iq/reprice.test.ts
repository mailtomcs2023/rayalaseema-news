import { describe, test, expect } from "bun:test";
import { repriceRun } from "../../src/lib/video-iq/reprice";
import { SAMPLE } from "../../../../packages/youtube/__tests__/contract.test";

// DataForSEO was whitelisted after this run was analysed: its terms sit at
// volume null and the title cannot earn the search-term points.
const chosen = {
  title: "రాచమల్లు ఫైర్ | YSRCP News Today Row",
  thumbnailIndex: 0, thumbnailUrl: "https://blob/t.jpg",
  description: "హుక్ లైన్\nకథ వివరాలు ఇక్కడ ఉంటాయి, రెండు మూడు వాక్యాలు, ఎనభై అక్షరాలకు పైగా ఉండేలా రాయాలి.",
  tags: SAMPLE.tags, chapters: [], hashtags: [], playlists: [], comment: "",
};
const row: any = {
  id: "r1", status: "READY", breaking: false, chosen,
  suggestions: { ...SAMPLE, format: "VIDEO", keywords: { terms: [{ term: "ysrcp news today", volume: null, competition: null }], suggested: [], serp: [], unavailable: "Your IP is not whitelisted" } },
  scores: { title: 85, thumbnail: 100, description: 100, tags: 100, fit: 95, overall: 94 },
  events: [{ at: "2026-10-24T10:00:00.000Z", text: "Ready." }],
};

describe("repriceRun", () => {
  test("re-prices the terms, stores them, recomputes the scores from the chosen metadata and notes an event", async () => {
    const updates: any[] = [];
    const prisma: any = { videoOptimization: { update: async (a: any) => { updates.push(a.data); return { ...row, ...a.data }; } } };
    const enrichKeywords = async () => ({ terms: [{ term: "ysrcp news today", volume: 1000, competition: "LOW" }], suggested: [{ term: "ysrcp", volume: 5000 }], serp: [] });
    const r = await repriceRun(row, { prisma, enrichKeywords, dfs: {} as any });
    expect(r.keywords.terms[0].volume).toBe(1000);
    expect(r.scores.title).toBe(100);
    expect(updates[0].suggestions.keywords.unavailable).toBeUndefined();
    expect(updates[0].scores.title).toBe(100);
    expect(JSON.stringify(updates[0].events)).toContain("priced");
  });
  test("refuses when DataForSEO is not configured", async () => {
    const enrichKeywords = async () => ({ terms: [], suggested: [], serp: [] });
    await expect(repriceRun(row, { prisma: {} as any, enrichKeywords, dfs: null })).rejects.toThrow(/DataForSEO/);
  });
  test("refuses before the analysis exists", async () => {
    const enrichKeywords = async () => ({ terms: [], suggested: [], serp: [] });
    await expect(repriceRun({ ...row, suggestions: null }, { prisma: {} as any, enrichKeywords, dfs: {} as any })).rejects.toThrow(/analys/);
  });
});
