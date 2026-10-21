import { describe, test, expect } from "bun:test";
import { enrichKeywords, englishTerms } from "../../src/lib/video-iq/keywords";
import { SAMPLE } from "../../../../packages/youtube/__tests__/contract.test";

type Row = { volume: number | null; competition: string | null; fetchedAt: Date };

function fakePrisma(rows: Record<string, Row>) {
  return {
    rows,
    keywordVolume: {
      findMany: async ({ where }: any) => (where.term.in as string[]).filter((t) => rows[t]).map((t) => ({ term: t, ...rows[t] })),
      upsert: async ({ where, create }: any) => {
        rows[where.term] = { volume: create.volume, competition: create.competition, fetchedAt: create.fetchedAt };
        return create;
      },
    },
  };
}

describe("englishTerms", () => {
  test("pulls english phrases from titles and tags, lower-cased, unique", () => {
    const t = englishTerms(SAMPLE as any);
    expect(t).toContain("rachamallu siva prasad reddy vs varadarajulu reddy");
    expect(t).toContain("proddatur news");
    expect(t).not.toContain("ప్రొద్దుటూరు న్యూస్");
    expect(new Set(t).size).toBe(t.length);
  });
});

describe("enrichKeywords", () => {
  test("uses fresh cache, asks dfs only for missing terms, stores results", async () => {
    const prisma = fakePrisma({ "proddatur news": { volume: 1000, competition: "LOW", fetchedAt: new Date() } });
    const asked: string[][] = [];
    const dfs = {
      searchVolume: async (terms: string[]) => { asked.push(terms); return terms.map((term) => ({ term, volume: 7, competition: "LOW" })); },
      suggestions: async () => [{ term: "proddatur news today", volume: 320 }],
      related: async () => [{ term: "kadapa district news", volume: 90 }],
      youtubeSerp: async () => [{ rank: 1, channel: "Sakshi TV", title: "x", views: 5, published: null, url: "u" }],
    } as any;
    const block = await enrichKeywords(SAMPLE as any, { prisma: prisma as any, dfs });
    expect(asked.length).toBe(1);
    expect(asked[0]).not.toContain("proddatur news");
    expect(block.terms.find((t) => t.term === "proddatur news")?.volume).toBe(1000);
    expect(block.terms.find((t) => t.term === "kadapa news")?.volume).toBe(7);
    expect(prisma.rows["kadapa news"].volume).toBe(7);
    expect(block.suggested.map((s) => s.term)).toEqual(["proddatur news today", "kadapa district news"]);
    expect(block.serp[0].channel).toBe("Sakshi TV");
    expect(block.unavailable).toBeUndefined();
  });

  test("stale cache rows are refreshed", async () => {
    const old = new Date(Date.now() - 40 * 86400_000);
    const prisma = fakePrisma({ "proddatur news": { volume: 1, competition: null, fetchedAt: old } });
    const asked: string[][] = [];
    const dfs = { searchVolume: async (terms: string[]) => { asked.push(terms); return terms.map((term) => ({ term, volume: 500, competition: "LOW" })); }, suggestions: async () => [], related: async () => [], youtubeSerp: async () => [] } as any;
    const block = await enrichKeywords(SAMPLE as any, { prisma: prisma as any, dfs });
    expect(asked[0]).toContain("proddatur news");
    expect(block.terms.find((t) => t.term === "proddatur news")?.volume).toBe(500);
  });

  test("dfs null marks the block unavailable and returns cached terms only", async () => {
    const block = await enrichKeywords(SAMPLE as any, { prisma: fakePrisma({}) as any, dfs: null });
    expect(block.unavailable).toMatch(/not configured/);
    expect(block.serp).toEqual([]);
    expect(block.terms.length).toBeGreaterThan(0);
  });

  test("dfs failure (IP not whitelisted) degrades to unavailable, never throws", async () => {
    const dfs = { searchVolume: async () => { throw new Error("Access denied. Your IP is not whitelisted."); }, suggestions: async () => [], related: async () => [], youtubeSerp: async () => [] } as any;
    const block = await enrichKeywords(SAMPLE as any, { prisma: fakePrisma({}) as any, dfs });
    expect(block.unavailable).toMatch(/not whitelisted/);
  });
});
