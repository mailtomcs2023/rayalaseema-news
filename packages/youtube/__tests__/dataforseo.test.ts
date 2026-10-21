import { describe, test, expect } from "bun:test";
import { createDataForSeo } from "../src/dataforseo";

const ok = (result: unknown) => new Response(JSON.stringify({ status_code: 20000, tasks: [{ status_code: 20000, result }] }), { status: 200 });

describe("dataforseo", () => {
  test("searchVolume posts India + partners with basic auth and maps rows", async () => {
    let body = "";
    let auth = "";
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      body = String(init.body);
      auth = String((init.headers as Record<string, string>).Authorization);
      return ok([{ keyword: "proddatur news", search_volume: 1000, competition: "LOW" }]);
    }) as any;
    const d = createDataForSeo({ login: "l", password: "p", fetchImpl });
    expect(await d.searchVolume(["proddatur news"])).toEqual([{ term: "proddatur news", volume: 1000, competition: "LOW" }]);
    expect(body).toContain('"location_code":2356');
    expect(body).toContain('"search_partners":true');
    expect(auth).toBe("Basic " + Buffer.from("l:p").toString("base64"));
  });

  test("suggestions and related map keyword_info volume", async () => {
    const fetchImpl = (async () => ok([{ items: [{ keyword: "proddatur news today", keyword_info: { search_volume: 320 } }] }])) as any;
    const d = createDataForSeo({ login: "l", password: "p", fetchImpl });
    expect(await d.suggestions("proddatur")).toEqual([{ term: "proddatur news today", volume: 320 }]);
    expect(await d.related("proddatur")).toEqual([{ term: "proddatur news today", volume: 320 }]);
  });

  test("youtubeSerp maps items and omits depth", async () => {
    let body = "";
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      body = String(init.body);
      return ok([{ items: [{ rank_absolute: 1, channel_name: "Sakshi TV", title: "x", views_count: 5, publication_date: "1 day ago", url: "u" }] }]);
    }) as any;
    const d = createDataForSeo({ login: "l", password: "p", fetchImpl });
    expect(await d.youtubeSerp("proddatur news")).toEqual([{ rank: 1, channel: "Sakshi TV", title: "x", views: 5, published: "1 day ago", url: "u" }]);
    expect(body).not.toContain("depth");
  });

  test("API error surfaces the status message", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ status_code: 40101, status_message: "Access denied. Your IP is not whitelisted." }), { status: 401 })) as any;
    await expect(createDataForSeo({ login: "l", password: "p", fetchImpl }).searchVolume(["a"])).rejects.toThrow(/not whitelisted/);
  });
});
