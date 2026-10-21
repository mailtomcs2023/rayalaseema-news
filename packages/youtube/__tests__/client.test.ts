import { describe, test, expect } from "bun:test";
import { createYouTubeClient, YouTubeQuotaError, YouTubeAuthError } from "../src/client";

function fakeFetch(handlers: Record<string, (init?: RequestInit) => Response>) {
  const calls: string[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const key = Object.keys(handlers).find((k) => url.includes(k));
    if (!key) return new Response("not found", { status: 404 });
    return handlers[key](init);
  }) as unknown as typeof fetch;
  return { f, calls };
}
const tokenOk = () => new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
const creds = { refreshToken: "r", clientId: "i", clientSecret: "s" };

describe("youtube client", () => {
  test("accounts units through onUnits and sends bearer token", async () => {
    const units: Array<[number, string]> = [];
    let auth = "";
    const { f, calls } = fakeFetch({
      "oauth2.googleapis.com/token": tokenOk,
      "/videos?": (init) => { auth = String((init?.headers as Record<string, string>)?.Authorization); return new Response(JSON.stringify({ items: [] })); },
    });
    const c = createYouTubeClient({ ...creds, fetchImpl: f, onUnits: async (u, l) => { units.push([u, l]); } });
    await c.getVideos(["a"]);
    expect(units).toEqual([[1, "videos.list"]]);
    expect(calls.some((x) => x.includes("/videos?"))).toBe(true);
    expect(auth).toBe("Bearer tok");
  });

  test("dry run never sends writes but still counts units", async () => {
    const units: number[] = [];
    const { f, calls } = fakeFetch({ "oauth2.googleapis.com/token": tokenOk });
    const c = createYouTubeClient({ ...creds, dryRun: true, fetchImpl: f, onUnits: async (u) => { units.push(u); } });
    await c.addToPlaylist("PL1", "vid");
    expect(calls.filter((x) => x.startsWith("POST") && !x.includes("oauth2")).length).toBe(0);
    expect(units).toEqual([50]);
  });

  test("maps quotaExceeded and invalid_grant to typed errors", async () => {
    const { f } = fakeFetch({
      "oauth2.googleapis.com/token": tokenOk,
      "/playlistItems": () => new Response(JSON.stringify({ error: { errors: [{ reason: "quotaExceeded" }] } }), { status: 403 }),
    });
    const c = createYouTubeClient({ ...creds, fetchImpl: f });
    await expect(c.addToPlaylist("PL1", "vid")).rejects.toBeInstanceOf(YouTubeQuotaError);

    const bad = fakeFetch({ "oauth2.googleapis.com/token": () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "invalid_rapt" }), { status: 400 }) });
    const c2 = createYouTubeClient({ ...creds, fetchImpl: bad.f });
    await expect(c2.getVideos(["a"])).rejects.toBeInstanceOf(YouTubeAuthError);
  });

  test("resumable upload: init, PUT bytes, returns id", async () => {
    const { f, calls } = fakeFetch({
      "oauth2.googleapis.com/token": tokenOk,
      "upload/youtube/v3/videos": (init) => init?.method === "POST"
        ? new Response("", { status: 200, headers: { Location: "https://upload.example/session1" } })
        : new Response("", { status: 404 }),
      "upload.example/session1": () => new Response(JSON.stringify({ id: "NEWID123456" }), { status: 200 }),
    });
    const c = createYouTubeClient({ ...creds, fetchImpl: f });
    const id = await c.uploadVideo({
      bytes: new Uint8Array([1, 2, 3]), sizeBytes: 3,
      snippet: { title: "t", description: "d", tags: [], categoryId: "25", defaultLanguage: "te", defaultAudioLanguage: "te" },
      status: { privacyStatus: "private", selfDeclaredMadeForKids: false },
    });
    expect(id).toBe("NEWID123456");
    expect(calls.some((x) => x.startsWith("PUT https://upload.example/session1"))).toBe(true);
  });

  test("insertComment refuses URLs before spending quota", async () => {
    const units: number[] = [];
    const { f } = fakeFetch({ "oauth2.googleapis.com/token": tokenOk });
    const c = createYouTubeClient({ ...creds, fetchImpl: f, onUnits: async (u) => { units.push(u); } });
    await expect(c.insertComment("vid", "see https://x.y")).rejects.toThrow(/URL/);
    expect(units).toEqual([]);
  });
});
