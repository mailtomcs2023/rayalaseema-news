# Video IQ Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase A of Video IQ: an editor optimises and publishes a video to YouTube from the CMS with transcript-based titles, SEO, thumbnails and a fit report; the website shows the transcript; a trending desk watches 20 competitor channels with breakout alerts.

**Architecture:** A new workspace package `@rayalaseema/youtube` holds everything pure (places, people, Shorts rule, YouTube API client with quota accounting, DataForSEO client, RSS parser, scoring, hook check, description template, model contract). The admin app adds `src/lib/video-iq/*` for the pieces that touch Azure, ffmpeg, Playwright and Prisma, a stage-machine worker driven by a cron route, panel API routes, the panel UI inside the Content editor, the trending desk, and a PM2-managed cron runner. The web app renders the stored transcript on video pages.

**Tech Stack:** Bun 1.3, TypeScript 5.7, Next.js 16 (app router), Prisma 6 (`prisma db push`), zod 4, Playwright Chromium (already installed on the VM), ffmpeg (new apt package), Azure Speech fast transcription REST, Azure OpenAI chat (`apps/admin/src/lib/ai/client.ts`), YouTube Data API v3 + Analytics v2, DataForSEO REST, `bun test`.

**Spec:** `docs/superpowers/specs/2026-10-21-video-iq-design.md` (sections 1 to 9, 10 Phase A, 12.1, 12.3, 12.5, 12.11).

## Global Constraints

- Package name `@rayalaseema/youtube`, path `packages/youtube`, same `package.json`/`tsconfig.json` shape as `packages/seo-schema`.
- Titles: Telugu hook first, then ` | `, then English headline; total length 100 characters or fewer; English half must contain a person or a place in canonical spelling.
- Category is always `25`; `defaultLanguage` and `defaultAudioLanguage` are always `te`; `selfDeclaredMadeForKids` is always `false`.
- SHORT = (width <= height) AND durationSec <= 180. Everything else is VIDEO.
- Telugu copy is standard Eenadu/Sakshi register, never Rayalaseema dialect.
- The model never receives or invents URLs; code appends the article link and footer.
- YouTube write quota: refuse a publish that would push the Pacific-day ledger over 9,000 units.
- Comments posted to YouTube contain no URLs.
- Cron routes authenticate with `Authorization: Bearer <CRON_SECRET>`; panel routes use `requireAuth([...])` from `apps/admin/src/lib/api-utils.ts`.
- Secrets (`YOUTUBE_OAUTH_REFRESH_TOKEN`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `AZURE_SPEECH_KEY`) are read from `process.env` only; never logged; never written into shell command literals.
- `VIDEO_IQ_YOUTUBE_DRY_RUN=1` makes every YouTube write log instead of send; the whole publish path must work in that mode.
- Tests run with `bun test <dir>`; no network in unit tests (fetch is mocked).
- Commit after every task with the attribution line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Do not push; the final push to `main` triggers production deploy and is a separate owner-approved step.

## Review Focus

1. A title whose Telugu half contains `|` (desk uses it as a separator) must not be split wrongly; `splitTitle` takes the LAST ` | ` as the hook/English boundary. Test in Task 1.
2. An mp4 with no audio track (screen recording) must fail transcription cleanly with status FAILED and error "no audio", not hang. Test in Task 4 (probe reports `hasAudio=false`).
3. A transcript shorter than 20 words (music-only Short) must set `low_confidence=true` and still produce three titles from the desk text. Test in Task 6.
4. The YouTube `quotaExceeded` error during `thumbnails.set` after a successful `videos.insert` must leave the row APPLIED-with-warning, with `videoId` saved, never re-upload the file. Test in Task 13.
5. An RSS feed with a video that has no `media:statistics` element must still be stored with `views=0`, not crash the poller. Test in Task 15.

---

### Task 1: Package scaffold, places, people, Shorts rule, title split

**Files:**
- Create: `packages/youtube/package.json`, `packages/youtube/tsconfig.json`, `packages/youtube/src/index.ts`, `packages/youtube/src/places.ts`, `packages/youtube/src/people.ts`, `packages/youtube/src/format.ts`, `packages/youtube/src/title.ts`
- Test: `packages/youtube/__tests__/places.test.ts`, `packages/youtube/__tests__/format.test.ts`, `packages/youtube/__tests__/title.test.ts`

**Interfaces:**
- Produces: `Place { en, te, district, districtTe }`, `PLACES`, `DISTRICTS`, `detectPlace(title: string): Place | null`, `townsIn(text: string): Place[]`, `isRayalaseema(text: string): boolean`; `Person { en, te, aliases: string[] }`, `PEOPLE`, `canonicalizeNames(text: string): string`, `peopleIn(text: string): Person[]`; `classifyFormat(a: { durationSec: number; width?: number; height?: number }): "SHORT" | "VIDEO"`; `splitTitle(title: string): { hook: string; english: string }`, `joinTitle(hook: string, english: string): string`, `titleLength(t: string): number`.

- [ ] **Step 1: Create the package files**

`packages/youtube/package.json`:
```json
{
  "name": "@rayalaseema/youtube",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": { "lint": "tsc --noEmit", "test": "bun test __tests__/" },
  "dependencies": { "zod": "^4.4.3" },
  "devDependencies": { "typescript": "^5.7.0" }
}
```
`packages/youtube/tsconfig.json`: copy `packages/seo-schema/tsconfig.json` verbatim.

- [ ] **Step 2: Write failing tests**

`packages/youtube/__tests__/places.test.ts`:
```ts
import { describe, test, expect } from "bun:test";
import { detectPlace, townsIn, isRayalaseema } from "../src/places";

describe("places", () => {
  test("picks the earliest town in a multi-story title", () => {
    expect(detectPlace("యాడికిలో కరెంట్ | ప్రొద్దుటూరులో దసరా | కడపలో వర్షం")?.en).toBe("Proddatur");
  });
  test("town beats district HQ when both appear", () => {
    expect(detectPlace("కడప జిల్లా పులివెందులలో ఉద్రిక్తత")?.en).toBe("Pulivendula");
  });
  test("Anantapur short form", () => {
    expect(detectPlace("అనంత లో జవాన్‌పై దాడి")?.en).toBe("Anantapur");
  });
  test("non-local returns null", () => {
    expect(detectPlace("నేపాల్‌లో భయానకం")).toBeNull();
    expect(isRayalaseema("బిహార్‌లో మూఢనమ్మకాలు")).toBe(false);
  });
  test("townsIn lists every town mentioned", () => {
    expect(townsIn("తిరుపతిలో గ్యాస్ లీక్.. కడపలో హత్య").map((p) => p.en)).toEqual(["Tirupati", "Kadapa"]);
  });
});
```
`packages/youtube/__tests__/format.test.ts`:
```ts
import { describe, test, expect } from "bun:test";
import { classifyFormat } from "../src/format";

describe("classifyFormat", () => {
  test("vertical 89s is a SHORT", () => expect(classifyFormat({ durationSec: 89, width: 1080, height: 1920 })).toBe("SHORT"));
  test("vertical 181s is a VIDEO", () => expect(classifyFormat({ durationSec: 181, width: 1080, height: 1920 })).toBe("VIDEO"));
  test("landscape 40s is a VIDEO", () => expect(classifyFormat({ durationSec: 40, width: 1920, height: 1080 })).toBe("VIDEO"));
  test("unknown aspect falls back to 60s rule", () => {
    expect(classifyFormat({ durationSec: 50 })).toBe("SHORT");
    expect(classifyFormat({ durationSec: 61 })).toBe("VIDEO");
  });
});
```
`packages/youtube/__tests__/title.test.ts`:
```ts
import { describe, test, expect } from "bun:test";
import { splitTitle, joinTitle, titleLength } from "../src/title";
import { canonicalizeNames, peopleIn } from "../src/people";

describe("title", () => {
  test("splits on the last separator so Telugu hooks with | survive", () => {
    const t = "ప్రొద్దుటూరులో దాడి | దర్శిలో కూటమి బోణీ | Speed News 19-10-2026";
    expect(splitTitle(t)).toEqual({ hook: "ప్రొద్దుటూరులో దాడి | దర్శిలో కూటమి బోణీ", english: "Speed News 19-10-2026" });
  });
  test("no separator means english is empty", () => {
    expect(splitTitle("కడపలో దారుణం")).toEqual({ hook: "కడపలో దారుణం", english: "" });
  });
  test("join trims and caps at 100", () => {
    expect(joinTitle(" కడపలో దారుణం ", "Kadapa Axe Murder")).toBe("కడపలో దారుణం | Kadapa Axe Murder");
    expect(titleLength(joinTitle("అ".repeat(90), "Kadapa News"))).toBeLessThanOrEqual(100);
  });
  test("canonical names fix common variants", () => {
    expect(canonicalizeNames("Rachamallu Shiva Prasad Reddy vs Varadarajula Reddy")).toBe("Rachamallu Siva Prasad Reddy vs Varadarajulu Reddy");
    expect(peopleIn("రాచమల్లు శివప్రసాద్ రెడ్డి ఫైర్").map((p) => p.en)).toEqual(["Rachamallu Siva Prasad Reddy"]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/youtube && bun test __tests__/`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement**

`packages/youtube/src/places.ts`:
```ts
export type Place = { en: string; te: string; district: string; districtTe: string };
export const DISTRICTS: Record<string, string> = {
  Kadapa: "కడప", Annamayya: "అన్నమయ్య", Kurnool: "కర్నూలు", Nandyal: "నంద్యాల",
  Anantapur: "అనంతపురం", "Sri Sathya Sai": "శ్రీ సత్యసాయి", Tirupati: "తిరుపతి", Chittoor: "చిత్తూరు",
};
const P = (en: string, te: string, district: string): Place => ({ en, te, district, districtTe: DISTRICTS[district] });
// Towns first, district headquarters last, so a town wins over its district name.
export const PLACES: Place[] = [
  P("Proddatur", "ప్రొద్దుటూరు", "Kadapa"), P("Pulivendula", "పులివెందుల", "Kadapa"), P("Jammalamadugu", "జమ్మలమడుగు", "Kadapa"),
  P("Yerraguntla", "యర్రగుంట్ల", "Kadapa"), P("Vempalli", "వెంపల్లి", "Kadapa"), P("Vempalli", "వేంపల్లి", "Kadapa"),
  P("Mydukur", "మైదుకూరు", "Kadapa"), P("Badvel", "బద్వేలు", "Kadapa"), P("Badvel", "బద్వేల్", "Kadapa"), P("Porumamilla", "పోరుమామిళ్ల", "Kadapa"),
  P("Kamalapuram", "కమలాపురం", "Kadapa"), P("Rayachoti", "రాయచోటి", "Annamayya"), P("Madanapalle", "మదనపల్లె", "Annamayya"),
  P("Pileru", "పీలేరు", "Annamayya"), P("Rajampet", "రాజంపేట", "Annamayya"), P("Adoni", "ఆదోని", "Kurnool"),
  P("Yemmiganur", "ఎమ్మిగనూరు", "Kurnool"), P("Nandikotkur", "నందికొట్కూరు", "Kurnool"), P("Pattikonda", "పత్తికొండ", "Kurnool"),
  P("Koilkuntla", "కోవెలకుంట్ల", "Nandyal"), P("Allagadda", "ఆళ్లగడ్డ", "Nandyal"), P("Srisailam", "శ్రీశైలం", "Nandyal"),
  P("Banaganapalle", "బనగానపల్లె", "Nandyal"), P("Dhone", "డోన్", "Nandyal"), P("Tadipatri", "తాడిపత్రి", "Anantapur"),
  P("Guntakal", "గుంతకల్లు", "Anantapur"), P("Kalyandurg", "కళ్యాణదుర్గం", "Anantapur"), P("Uravakonda", "ఉరవకొండ", "Anantapur"),
  P("Yadiki", "యాడికి", "Anantapur"), P("Hindupur", "హిందూపురం", "Sri Sathya Sai"), P("Kadiri", "కదిరి", "Sri Sathya Sai"),
  P("Dharmavaram", "ధర్మవరం", "Sri Sathya Sai"), P("Puttaparthi", "పుట్టపర్తి", "Sri Sathya Sai"), P("Penukonda", "పెనుకొండ", "Sri Sathya Sai"),
  P("Tirumala", "తిరుమల", "Tirupati"), P("Srikalahasti", "శ్రీకాళహస్తి", "Tirupati"), P("Puttur", "పుత్తూరు", "Tirupati"), P("Pakala", "పాకాల", "Tirupati"),
  P("Kuppam", "కుప్పం", "Chittoor"), P("Palamaner", "పలమనేరు", "Chittoor"), P("Punganur", "పుంగనూరు", "Chittoor"), P("Nagari", "నగరి", "Chittoor"),
  P("Kadapa", "కడప", "Kadapa"), P("Kurnool", "కర్నూలు", "Kurnool"), P("Nandyal", "నంద్యాల", "Nandyal"), P("Anantapur", "అనంతపురం", "Anantapur"),
  P("Tirupati", "తిరుపతి", "Tirupati"), P("Chittoor", "చిత్తూరు", "Chittoor"),
];
const ALIASES: Array<[string, string]> = [["అనంత ", "Anantapur"], ["అనంతలో", "Anantapur"], ["రాయలసీమ", "Rayalaseema"]];

function positions(text: string): Array<{ p: Place; at: number }> {
  const lower = text.toLowerCase();
  const out: Array<{ p: Place; at: number }> = [];
  for (const p of PLACES) {
    const cands = [text.indexOf(p.te), lower.indexOf(p.en.toLowerCase())].filter((i) => i >= 0);
    if (cands.length) out.push({ p, at: Math.min(...cands) });
  }
  return out.sort((a, b) => a.at - b.at);
}
export function detectPlace(title: string): Place | null {
  const pos = positions(title);
  if (pos.length) return pos[0].p;
  for (const [alias, en] of ALIASES) if (title.includes(alias)) return PLACES.find((p) => p.en === en) ?? null;
  return null;
}
export function townsIn(text: string): Place[] {
  const seen = new Set<string>();
  return positions(text).filter(({ p }) => (seen.has(p.en) ? false : (seen.add(p.en), true))).map(({ p }) => p);
}
export function isRayalaseema(text: string): boolean {
  return detectPlace(text) !== null || text.includes("రాయలసీమ") || /rayalaseema/i.test(text);
}
```
`packages/youtube/src/people.ts`:
```ts
export type Person = { en: string; te: string; aliases: string[] };
export const PEOPLE: Person[] = [
  { en: "Rachamallu Siva Prasad Reddy", te: "రాచమల్లు శివప్రసాద్ రెడ్డి", aliases: ["Rachamallu Shiva Prasad Reddy", "Rachamallu Sivaprasad Reddy", "Rachamallu Shivaprasad Reddy", "రాచమల్లు శివప్రసాద్‌రెడ్డి", "రాచమల్లు"] },
  { en: "Varadarajulu Reddy", te: "వరదరాజుల రెడ్డి", aliases: ["Varadarajula Reddy", "Varada Rajulu Reddy", "వరదరాజులురెడ్డి"] },
  { en: "Chandrababu Naidu", te: "చంద్రబాబు నాయుడు", aliases: ["Chandrababu", "CBN", "చంద్రబాబు"] },
  { en: "YS Jagan", te: "వైఎస్ జగన్", aliases: ["Y.S. Jagan", "Jagan Mohan Reddy", "YS Jaganmohan Reddy", "జగన్"] },
  { en: "Pawan Kalyan", te: "పవన్ కళ్యాణ్", aliases: ["Pawan Kalyaan", "పవన్ కల్యాణ్", "పవన్"] },
  { en: "Nara Lokesh", te: "నారా లోకేశ్", aliases: ["Lokesh", "లోకేశ్"] },
  { en: "JC Prabhakar Reddy", te: "జేసీ ప్రభాకర్ రెడ్డి", aliases: ["J.C. Prabhakar Reddy", "JC ప్రభాకర్ రెడ్డి"] },
  { en: "JC Asmith Reddy", te: "జేసీ అస్మిత్ రెడ్డి", aliases: ["JC అస్మిత్ రెడ్డి"] },
  { en: "YS Avinash Reddy", te: "వైఎస్ అవినాష్ రెడ్డి", aliases: ["Avinash Reddy", "అవినాష్ రెడ్డి"] },
  { en: "Bhumana Karunakar Reddy", te: "భూమన కరుణాకర్ రెడ్డి", aliases: ["Bhumana"] },
  { en: "Tulasi Reddy", te: "తులసిరెడ్డి", aliases: ["Tulasireddy", "తులసి రెడ్డి"] },
  { en: "Paka Suresh", te: "పాక సురేష్", aliases: [] },
];
export function canonicalizeNames(text: string): string {
  let out = text;
  for (const p of PEOPLE) for (const a of p.aliases) {
    if (/[A-Za-z]/.test(a)) out = out.replace(new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), p.en);
  }
  return out;
}
export function peopleIn(text: string): Person[] {
  return PEOPLE.filter((p) => text.includes(p.te) || text.includes(p.en) || p.aliases.some((a) => text.includes(a)));
}
```
`packages/youtube/src/format.ts`:
```ts
export function classifyFormat(a: { durationSec: number; width?: number; height?: number }): "SHORT" | "VIDEO" {
  if (a.width && a.height) return a.width <= a.height && a.durationSec <= 180 ? "SHORT" : "VIDEO";
  return a.durationSec <= 60 ? "SHORT" : "VIDEO";
}
```
`packages/youtube/src/title.ts`:
```ts
export const TITLE_MAX = 100;
export function splitTitle(title: string): { hook: string; english: string } {
  const at = title.lastIndexOf(" | ");
  if (at === -1) return { hook: title.trim(), english: "" };
  return { hook: title.slice(0, at).trim(), english: title.slice(at + 3).trim() };
}
export function titleLength(t: string): number { return [...t].length; }
export function joinTitle(hook: string, english: string): string {
  let h = hook.trim(), e = english.trim();
  let out = e ? `${h} | ${e}` : h;
  while (titleLength(out) > TITLE_MAX && h.length > 10) { h = h.slice(0, -1).trim(); out = e ? `${h} | ${e}` : h; }
  return out;
}
```
`packages/youtube/src/index.ts`:
```ts
export * from "./places"; export * from "./people"; export * from "./format"; export * from "./title";
```

- [ ] **Step 5: Run tests**

Run: `cd packages/youtube && bun test __tests__/` then `bun install` at the repo root to link the workspace.
Expected: PASS (13 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/youtube
git commit -m "feat(youtube): package scaffold with places, people, Shorts rule, title split

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: YouTube API client with quota accounting and dry-run

**Files:**
- Create: `packages/youtube/src/client.ts`, `packages/youtube/src/costs.ts`
- Modify: `packages/youtube/src/index.ts`
- Test: `packages/youtube/__tests__/client.test.ts`

**Interfaces:**
- Produces: `COSTS: Record<string, number>`; `createYouTubeClient(opts: { refreshToken: string; clientId: string; clientSecret: string; dryRun?: boolean; onUnits?: (units: number, label: string) => Promise<void>; fetchImpl?: typeof fetch }): YouTubeClient` where `YouTubeClient` has `get<T>(path, cost?)`, `write<T>(method, path, body, cost, label)`, `uploadVideo(a: { bytes: Uint8Array | ReadableStream<Uint8Array>; sizeBytes: number; snippet: VideoSnippet; status: VideoStatus }): Promise<string>`, `setThumbnail(videoId, jpeg: Uint8Array): Promise<void>`, `addToPlaylist(playlistId, videoId)`, `setLocalizations(videoId, loc: Record<string, { title: string; description: string }>)`, `updateSnippetStatus(videoId, snippet, status)`, `insertComment(videoId, text)`, `listMyPlaylists(): Promise<Array<{ id: string; title: string }>>`, `listUploads(channelId, max): Promise<string[]>`, `listCaptions(videoId)`, `downloadCaption(captionId): Promise<string>`, `getVideos(ids: string[])`. Errors: `YouTubeQuotaError`, `YouTubeAuthError`.

- [ ] **Step 1: Write failing tests**

`packages/youtube/__tests__/client.test.ts`:
```ts
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

describe("youtube client", () => {
  test("accounts units through onUnits and sends bearer token", async () => {
    const units: Array<[number, string]> = [];
    const { f, calls } = fakeFetch({ "oauth2.googleapis.com/token": tokenOk, "/videos?": () => new Response(JSON.stringify({ items: [] })) });
    const c = createYouTubeClient({ refreshToken: "r", clientId: "i", clientSecret: "s", fetchImpl: f, onUnits: async (u, l) => { units.push([u, l]); } });
    await c.getVideos(["a"]);
    expect(units).toEqual([[1, "videos.list"]]);
    expect(calls.some((x) => x.includes("/videos?"))).toBe(true);
  });
  test("dry run never sends writes but still counts units", async () => {
    const units: number[] = [];
    const { f, calls } = fakeFetch({ "oauth2.googleapis.com/token": tokenOk });
    const c = createYouTubeClient({ refreshToken: "r", clientId: "i", clientSecret: "s", dryRun: true, fetchImpl: f, onUnits: async (u) => { units.push(u); } });
    await c.addToPlaylist("PL1", "vid");
    expect(calls.filter((x) => x.startsWith("POST")).length).toBe(0);
    expect(units).toEqual([50]);
  });
  test("maps quotaExceeded and invalid_grant to typed errors", async () => {
    const { f } = fakeFetch({ "oauth2.googleapis.com/token": tokenOk, "/playlistItems": () => new Response(JSON.stringify({ error: { errors: [{ reason: "quotaExceeded" }] } }), { status: 403 }) });
    const c = createYouTubeClient({ refreshToken: "r", clientId: "i", clientSecret: "s", fetchImpl: f });
    await expect(c.addToPlaylist("PL1", "vid")).rejects.toBeInstanceOf(YouTubeQuotaError);
    const bad = fakeFetch({ "oauth2.googleapis.com/token": () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "invalid_rapt" }), { status: 400 }) });
    const c2 = createYouTubeClient({ refreshToken: "r", clientId: "i", clientSecret: "s", fetchImpl: bad.f });
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
    const c = createYouTubeClient({ refreshToken: "r", clientId: "i", clientSecret: "s", fetchImpl: f });
    const id = await c.uploadVideo({ bytes: new Uint8Array([1, 2, 3]), sizeBytes: 3, snippet: { title: "t", description: "d", tags: [], categoryId: "25", defaultLanguage: "te", defaultAudioLanguage: "te" }, status: { privacyStatus: "private", selfDeclaredMadeForKids: false } });
    expect(id).toBe("NEWID123456");
    expect(calls.some((x) => x.startsWith("PUT https://upload.example/session1"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/youtube && bun test __tests__/client.test.ts`
Expected: FAIL, `../src/client` not found.

- [ ] **Step 3: Implement**

`packages/youtube/src/costs.ts`:
```ts
// Documented quota costs, YouTube Data API v3.
export const COSTS = {
  "videos.list": 1, "playlistItems.list": 1, "playlists.list": 1, "channels.list": 1, "captions.list": 50,
  "captions.download": 200, "captions.insert": 400, "videos.insert": 1600, "videos.update": 50,
  "thumbnails.set": 50, "playlistItems.insert": 50, "playlists.insert": 50, "commentThreads.insert": 50, "search.list": 100,
} as const;
```
`packages/youtube/src/client.ts`:
```ts
import { COSTS } from "./costs";
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos";
export class YouTubeQuotaError extends Error { constructor(m = "YouTube quota exceeded") { super(m); this.name = "YouTubeQuotaError"; } }
export class YouTubeAuthError extends Error { constructor(m: string) { super(m); this.name = "YouTubeAuthError"; } }
export type VideoSnippet = { title: string; description: string; tags: string[]; categoryId: "25"; defaultLanguage: "te"; defaultAudioLanguage: "te" };
export type VideoStatus = { privacyStatus: "public" | "private" | "unlisted"; publishAt?: string; selfDeclaredMadeForKids: false; embeddable?: boolean; license?: "youtube" };
export type ClientOpts = { refreshToken: string; clientId: string; clientSecret: string; dryRun?: boolean; onUnits?: (units: number, label: string) => Promise<void>; fetchImpl?: typeof fetch };

export function createYouTubeClient(o: ClientOpts) {
  const f = o.fetchImpl ?? fetch;
  let cached: { tok: string; exp: number } | null = null;
  const units = async (n: number, label: string) => { if (o.onUnits) await o.onUnits(n, label); };

  async function token(): Promise<string> {
    if (cached && cached.exp > Date.now() + 60_000) return cached.tok;
    const res = await f("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: o.clientId, client_secret: o.clientSecret, refresh_token: o.refreshToken, grant_type: "refresh_token" }) });
    const body = await res.text();
    if (!res.ok) throw new YouTubeAuthError(`token refresh failed: ${res.status} ${body.slice(0, 200)}`);
    const j = JSON.parse(body) as { access_token: string; expires_in: number };
    cached = { tok: j.access_token, exp: Date.now() + j.expires_in * 1000 };
    return cached.tok;
  }
  async function raw(method: string, url: string, body?: BodyInit, headers: Record<string, string> = {}) {
    const res = await f(url, { method, headers: { Authorization: `Bearer ${await token()}`, ...headers }, body, signal: AbortSignal.timeout(120_000) });
    const text = await res.text();
    if (!res.ok) {
      if (text.includes("quotaExceeded") || text.includes("dailyLimitExceeded")) throw new YouTubeQuotaError();
      if (res.status === 401) throw new YouTubeAuthError(`401 ${text.slice(0, 200)}`);
      throw new Error(`${method} ${url} -> ${res.status} ${text.slice(0, 300)}`);
    }
    return { text, headers: res.headers };
  }
  async function get<T>(path: string, cost = 1, label = path.split("?")[0]): Promise<T> {
    await units(cost, label);
    return JSON.parse((await raw("GET", `${API}/${path}`)).text) as T;
  }
  async function write<T>(method: "POST" | "PUT" | "DELETE", path: string, body: unknown, cost: number, label: string): Promise<T | null> {
    await units(cost, label);
    if (o.dryRun) { console.log(`[yt dry-run] ${method} ${path} ${body ? JSON.stringify(body).slice(0, 200) : ""}`); return null; }
    const r = await raw(method, `${API}/${path}`, body ? JSON.stringify(body) : undefined, { "Content-Type": "application/json" });
    return r.text ? (JSON.parse(r.text) as T) : null;
  }
  return {
    get, write,
    async getVideos(ids: string[]) { return get<{ items: any[] }>(`videos?part=snippet,contentDetails,status,statistics&id=${ids.join(",")}`, COSTS["videos.list"], "videos.list"); },
    async listMyPlaylists() {
      const r = await get<{ items: any[] }>("playlists?part=snippet&mine=true&maxResults=50", COSTS["playlists.list"], "playlists.list");
      return r.items.map((p) => ({ id: p.id as string, title: p.snippet.title as string }));
    },
    async listUploads(channelId: string, max = 50) {
      const uploads = "UU" + channelId.slice(2);
      const r = await get<{ items: any[] }>(`playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=${Math.min(max, 50)}`, COSTS["playlistItems.list"], "playlistItems.list");
      return r.items.map((i) => i.contentDetails.videoId as string);
    },
    async listCaptions(videoId: string) { return (await get<{ items: any[] }>(`captions?part=snippet&videoId=${videoId}`, COSTS["captions.list"], "captions.list")).items; },
    async downloadCaption(captionId: string) {
      await units(COSTS["captions.download"], "captions.download");
      return (await raw("GET", `${API}/captions/${captionId}?tfmt=srt`)).text;
    },
    async uploadVideo(a: { bytes: Uint8Array | ReadableStream<Uint8Array>; sizeBytes: number; snippet: VideoSnippet; status: VideoStatus }): Promise<string> {
      await units(COSTS["videos.insert"], "videos.insert");
      if (o.dryRun) { console.log(`[yt dry-run] videos.insert ${a.snippet.title}`); return "DRYRUN00000"; }
      const init = await raw("POST", `${UPLOAD}?uploadType=resumable&part=snippet,status`, JSON.stringify({ snippet: a.snippet, status: a.status }),
        { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/*", "X-Upload-Content-Length": String(a.sizeBytes) });
      const session = init.headers.get("Location");
      if (!session) throw new Error("resumable upload: no session URL");
      const res = await f(session, { method: "PUT", headers: { "Content-Length": String(a.sizeBytes), "Content-Type": "video/*" }, body: a.bytes as BodyInit, // @ts-ignore bun streams
        duplex: "half" });
      const text = await res.text();
      if (!res.ok) throw new Error(`upload PUT -> ${res.status} ${text.slice(0, 300)}`);
      return (JSON.parse(text) as { id: string }).id;
    },
    async setThumbnail(videoId: string, jpeg: Uint8Array) {
      await units(COSTS["thumbnails.set"], "thumbnails.set");
      if (o.dryRun) return;
      await raw("POST", `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media`, jpeg as BodyInit, { "Content-Type": "image/jpeg" });
    },
    async addToPlaylist(playlistId: string, videoId: string) {
      await write("POST", "playlistItems?part=snippet", { snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } }, COSTS["playlistItems.insert"], "playlistItems.insert");
    },
    async setLocalizations(videoId: string, localizations: Record<string, { title: string; description: string }>) {
      await write("PUT", "videos?part=localizations", { id: videoId, localizations }, COSTS["videos.update"], "videos.update");
    },
    async updateSnippetStatus(videoId: string, snippet: VideoSnippet, status: VideoStatus, recordingDetails?: { locationDescription?: string }) {
      await write("PUT", "videos?part=snippet,status,recordingDetails", { id: videoId, snippet, status, ...(recordingDetails ? { recordingDetails } : {}) }, COSTS["videos.update"], "videos.update");
    },
    async insertComment(videoId: string, text: string) {
      if (/https?:\/\//i.test(text)) throw new Error("comments must not contain URLs");
      await write("POST", "commentThreads?part=snippet", { snippet: { videoId, topLevelComment: { snippet: { textOriginal: text } } } }, COSTS["commentThreads.insert"], "commentThreads.insert");
    },
  };
}
export type YouTubeClient = ReturnType<typeof createYouTubeClient>;
```
Add to `index.ts`: `export * from "./client"; export * from "./costs";`

- [ ] **Step 4: Run tests**

Run: `cd packages/youtube && bun test __tests__/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/youtube
git commit -m "feat(youtube): API client with quota accounting, dry-run, resumable upload

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Prisma schema for Video IQ, trending, quota, and the transcript payload field

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (append models and enums; add relation on `Content` after line 1340 `mediaMirrors MediaMirror[]`)
- Modify: `packages/db/src/payload-schemas.ts:24-55` (add optional `transcript` to VIDEO and REEL schemas)
- Test: `packages/db/__tests__/payload-schemas.test.ts` (extend)

**Interfaces:**
- Produces Prisma models `VideoOptimization`, `KeywordVolume`, `YoutubeQuotaDay`, `CompetitorChannel`, `CompetitorVideo`; enums `VideoIqSource { BLOB, YOUTUBE }`, `VideoIqStatus { QUEUED, EXTRACTING, TRANSCRIBING, ANALYZING, READY, APPROVED, PUBLISHING, APPLIED, FAILED }`; `prisma.videoOptimization` etc.

- [ ] **Step 1: Extend the payload test**

Append to `packages/db/__tests__/payload-schemas.test.ts`:
```ts
test("VIDEO and REEL accept an optional transcript", () => {
  expect(videoPayloadSchema.safeParse({ videoUrl: "https://youtu.be/abcdefghijk", transcript: "కడపలో దారుణం" }).success).toBe(true);
  expect(reelPayloadSchema.safeParse({ clipUrl: "https://x.blob.core.windows.net/u/a.mp4", transcript: "" }).success).toBe(true);
  expect(videoPayloadSchema.safeParse({ videoUrl: "https://youtu.be/abcdefghijk", transcript: 5 }).success).toBe(false);
});
```
(Import `videoPayloadSchema, reelPayloadSchema` at the top if not already imported.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/db && bun test __tests__/payload-schemas.test.ts`
Expected: FAIL on the strict schema rejecting `transcript`.

- [ ] **Step 3: Add the field and the models**

In `payload-schemas.ts`, inside both `videoPayloadSchema` and `reelPayloadSchema` objects add:
```ts
  // Cleaned Telugu transcript written by Video IQ; rendered on the video page
  // and emitted in VideoObject JSON-LD. Optional: videos published before
  // Video IQ have none.
  transcript: z.string().max(60000).optional(),
```
Append to `schema.prisma`:
```prisma
enum VideoIqSource { BLOB YOUTUBE }
enum VideoIqStatus { QUEUED EXTRACTING TRANSCRIBING ANALYZING READY APPROVED PUBLISHING APPLIED FAILED }

model VideoOptimization {
  id          String        @id @default(cuid())
  contentId   String
  content     Content       @relation(fields: [contentId], references: [id], onDelete: Cascade)
  source      VideoIqSource
  blobUrl     String?
  videoId     String?
  status      VideoIqStatus @default(QUEUED)
  transcript  Json?
  suggestions Json?
  scores      Json?
  frames      Json?
  thumbnails  Json?
  chosen      Json?
  applied     Json?
  error       String?       @db.Text
  attempts    Int           @default(0)
  createdById String
  createdBy   User          @relation("VideoIqCreator", fields: [createdById], references: [id])
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@index([status, createdAt])
  @@index([contentId, createdAt(sort: Desc)])
  @@map("video_optimizations")
}

model KeywordVolume {
  term        String   @id
  volume      Int?
  competition String?
  fetchedAt   DateTime @default(now())
  @@map("keyword_volumes")
}

model YoutubeQuotaDay {
  date  String @id // YYYY-MM-DD in America/Los_Angeles
  units Int    @default(0)
  @@map("youtube_quota_days")
}

model CompetitorChannel {
  id        String            @id @default(cuid())
  channelId String            @unique
  name      String
  tier      Int               @default(2)
  active    Boolean           @default(true)
  videos    CompetitorVideo[]
  createdAt DateTime          @default(now())
  @@map("competitor_channels")
}

model CompetitorVideo {
  videoId       String            @id
  channelId     String
  channel       CompetitorChannel @relation(fields: [channelId], references: [channelId], onDelete: Cascade)
  title         String
  publishedAt   DateTime
  durationSec   Int?
  isShort       Boolean           @default(false)
  views         Int               @default(0)
  viewSnapshots Json?
  velocity      Float             @default(0)
  outlier       Float             @default(0)
  towns         String[]          @default([])
  topicKey      String?
  fetchedAt     DateTime          @default(now())
  @@index([publishedAt(sort: Desc)])
  @@index([velocity(sort: Desc)])
  @@index([topicKey])
  @@map("competitor_videos")
}
```
On `model Content` add after `mediaMirrors MediaMirror[]`: `  videoOptimizations   VideoOptimization[]`. On `model User` add: `  videoOptimizations VideoOptimization[] @relation("VideoIqCreator")`.

- [ ] **Step 4: Push and generate, run tests**

Run: `cd packages/db && bunx prisma db push && bunx prisma generate && bun test __tests__/`
Expected: db push succeeds against the local database; tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/src/payload-schemas.ts packages/db/__tests__/payload-schemas.test.ts
git commit -m "feat(db): Video IQ, keyword cache, quota ledger, competitor tables; transcript on video payloads

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Media extraction with ffmpeg (probe, audio, frames)

**Files:**
- Create: `apps/admin/src/lib/video-iq/media.ts`
- Test: `apps/admin/__tests__/video-iq/media.test.ts`
- Fixture: `apps/admin/test-fixtures/video-iq/` generated by the test when ffmpeg is present

**Interfaces:**
- Produces: `probe(src: string): Promise<{ durationSec: number; width: number; height: number; hasAudio: boolean }>`, `extractAudioMp3(src: string): Promise<Uint8Array>`, `extractFrames(src: string, times: number[]): Promise<Uint8Array[]>` (JPEG, 1280 wide), `ffmpegAvailable(): Promise<boolean>`. `src` is a local path or an https URL (blob SAS).

- [ ] **Step 1: Write failing tests**

`apps/admin/__tests__/video-iq/media.test.ts`:
```ts
import { describe, test, expect, beforeAll } from "bun:test";
import { mkdirSync, existsSync } from "node:fs";
import { probe, extractAudioMp3, extractFrames, ffmpegAvailable } from "../../src/lib/video-iq/media";

const DIR = "test-fixtures/video-iq";
const SILENT = `${DIR}/silent-landscape.mp4`;
const TONE = `${DIR}/tone-vertical.mp4`;
let have = false;
beforeAll(async () => {
  have = await ffmpegAvailable();
  if (!have) return;
  mkdirSync(DIR, { recursive: true });
  // 3s landscape with no audio track; 3s vertical with a 440Hz tone.
  if (!existsSync(SILENT)) await Bun.$`ffmpeg -y -f lavfi -i color=c=blue:s=640x360:d=3 -c:v libx264 -pix_fmt yuv420p ${SILENT}`.quiet();
  if (!existsSync(TONE)) await Bun.$`ffmpeg -y -f lavfi -i color=c=red:s=360x640:d=3 -f lavfi -i sine=frequency=440:duration=3 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest ${TONE}`.quiet();
});

describe("media", () => {
  test("probe reports duration, aspect, audio presence", async () => {
    if (!have) return console.log("ffmpeg missing, skipped");
    const a = await probe(SILENT); expect(a.hasAudio).toBe(false); expect(a.width).toBe(640); expect(Math.round(a.durationSec)).toBe(3);
    const b = await probe(TONE); expect(b.hasAudio).toBe(true); expect(b.height).toBeGreaterThan(b.width);
  });
  test("audio extraction yields mp3 bytes; frames yield jpegs", async () => {
    if (!have) return;
    const mp3 = await extractAudioMp3(TONE); expect(mp3.byteLength).toBeGreaterThan(1000);
    const frames = await extractFrames(TONE, [0.5, 1.5]); expect(frames.length).toBe(2); expect(frames[0][0]).toBe(0xff); expect(frames[0][1]).toBe(0xd8);
  });
  test("audio extraction on a silent file throws 'no audio'", async () => {
    if (!have) return;
    await expect(extractAudioMp3(SILENT)).rejects.toThrow(/no audio/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/admin && bun test __tests__/video-iq/media.test.ts`
Expected: FAIL, module not found (or skipped lines if ffmpeg is absent locally; install ffmpeg locally for this task).

- [ ] **Step 3: Implement**

`apps/admin/src/lib/video-iq/media.ts`:
```ts
// ffmpeg/ffprobe wrappers. Input may be a local path or an https URL (blob
// SAS); ffmpeg reads both. Output goes to memory, never to the public blob
// container from here (callers upload what they keep).
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile, rm } from "node:fs/promises";

export async function ffmpegAvailable(): Promise<boolean> {
  try { await Bun.$`ffmpeg -version`.quiet(); return true; } catch { return false; }
}

export async function probe(src: string) {
  const out = await Bun.$`ffprobe -v error -print_format json -show_streams -show_format ${src}`.quiet().text();
  const j = JSON.parse(out) as { streams: Array<{ codec_type: string; width?: number; height?: number }>; format: { duration?: string } };
  const v = j.streams.find((s) => s.codec_type === "video");
  return {
    durationSec: Number(j.format.duration ?? 0),
    width: v?.width ?? 0,
    height: v?.height ?? 0,
    hasAudio: j.streams.some((s) => s.codec_type === "audio"),
  };
}

export async function extractAudioMp3(src: string): Promise<Uint8Array> {
  const p = await probe(src);
  if (!p.hasAudio) throw new Error("no audio track in video");
  const out = join(tmpdir(), `viq-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
  try {
    await Bun.$`ffmpeg -y -v error -i ${src} -vn -ac 1 -ar 16000 -b:a 48k ${out}`.quiet();
    return new Uint8Array(await readFile(out));
  } finally { await rm(out, { force: true }); }
}

export async function extractFrames(src: string, times: number[]): Promise<Uint8Array[]> {
  const frames: Uint8Array[] = [];
  for (const t of times) {
    const out = join(tmpdir(), `viq-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
    try {
      await Bun.$`ffmpeg -y -v error -ss ${t} -i ${src} -frames:v 1 -vf scale=1280:-2 -q:v 3 ${out}`.quiet();
      frames.push(new Uint8Array(await readFile(out)));
    } finally { await rm(out, { force: true }); }
  }
  return frames;
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/admin && bun test __tests__/video-iq/media.test.ts`
Expected: PASS (3 tests) with ffmpeg installed.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/lib/video-iq/media.ts apps/admin/__tests__/video-iq/media.test.ts
printf 'test-fixtures/\n' >> apps/admin/.gitignore
git add apps/admin/.gitignore
git commit -m "feat(video-iq): ffmpeg probe, audio and frame extraction

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Transcription (Azure fast transcription) and caption SRT parsing

**Files:**
- Create: `apps/admin/src/lib/video-iq/transcribe.ts`, `packages/youtube/src/srt.ts`
- Modify: `packages/youtube/src/index.ts`
- Test: `apps/admin/__tests__/video-iq/transcribe.test.ts`, `packages/youtube/__tests__/srt.test.ts`

**Interfaces:**
- Produces: `Transcript { locale: string; durationSec: number; segments: Array<{ start: number; end: number; text: string }>; words?: number }`; `transcribeAudio(mp3: Uint8Array, opts: { phrases: string[]; fetchImpl?: typeof fetch }): Promise<Transcript>` (env `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`); `parseSrt(srt: string): Transcript["segments"]`; `transcriptFromCaptions(client: YouTubeClient, videoId: string): Promise<Transcript | null>` (null when no `te` track yet); `plainText(t: Transcript): string`.

- [ ] **Step 1: Write failing tests**

`packages/youtube/__tests__/srt.test.ts`:
```ts
import { describe, test, expect } from "bun:test";
import { parseSrt } from "../src/srt";
const SRT = `1\n00:00:01,000 --> 00:00:03,500\nప్రొద్దుటూరులో ఉద్రిక్తత\n\n2\n00:00:03,500 --> 00:00:06,000\nవైసీపీ అభ్యర్థి ఇంటిపై దాడి\n`;
describe("parseSrt", () => {
  test("parses cues to seconds", () => {
    expect(parseSrt(SRT)).toEqual([{ start: 1, end: 3.5, text: "ప్రొద్దుటూరులో ఉద్రిక్తత" }, { start: 3.5, end: 6, text: "వైసీపీ అభ్యర్థి ఇంటిపై దాడి" }]);
  });
  test("empty input gives empty list", () => expect(parseSrt("")).toEqual([]));
});
```
`apps/admin/__tests__/video-iq/transcribe.test.ts`:
```ts
import { describe, test, expect } from "bun:test";
import { transcribeAudio, plainText } from "../../src/lib/video-iq/transcribe";

describe("transcribeAudio", () => {
  test("posts multipart with locale te-IN and phrase list, maps phrases to segments", async () => {
    process.env.AZURE_SPEECH_KEY = "k"; process.env.AZURE_SPEECH_REGION = "centralindia";
    let seenUrl = ""; let seenDef = "";
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seenUrl = url;
      const fd = init.body as FormData; seenDef = String(fd.get("definition"));
      return new Response(JSON.stringify({ durationMilliseconds: 6000, phrases: [{ offsetMilliseconds: 1000, durationMilliseconds: 2500, text: "రాచమల్లు ఫైర్" }, { offsetMilliseconds: 3500, durationMilliseconds: 2500, text: "వరదరాజుల రెడ్డిపై" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const t = await transcribeAudio(new Uint8Array([1, 2, 3]), { phrases: ["రాచమల్లు"], fetchImpl });
    expect(seenUrl).toContain("centralindia.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe");
    expect(seenDef).toContain('"locales":["te-IN"]'); expect(seenDef).toContain("రాచమల్లు");
    expect(t.segments).toEqual([{ start: 1, end: 3.5, text: "రాచమల్లు ఫైర్" }, { start: 3.5, end: 6, text: "వరదరాజుల రెడ్డిపై" }]);
    expect(t.durationSec).toBe(6);
    expect(plainText(t)).toBe("రాచమల్లు ఫైర్ వరదరాజుల రెడ్డిపై");
  });
  test("non-200 throws with the status", async () => {
    const fetchImpl = (async () => new Response("bad", { status: 400 })) as unknown as typeof fetch;
    await expect(transcribeAudio(new Uint8Array([1]), { phrases: [], fetchImpl })).rejects.toThrow(/400/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/youtube && bun test __tests__/srt.test.ts; cd ../../apps/admin && bun test __tests__/video-iq/transcribe.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`packages/youtube/src/srt.ts`:
```ts
export type Segment = { start: number; end: number; text: string };
const ts = (s: string) => { const m = s.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000 : 0; };
export function parseSrt(srt: string): Segment[] {
  const out: Segment[] = [];
  for (const block of srt.replace(/\r/g, "").trim().split(/\n\n+/)) {
    const lines = block.split("\n").filter(Boolean);
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i === -1) continue;
    const [a, b] = lines[i].split("-->");
    const text = lines.slice(i + 1).join(" ").trim();
    if (text) out.push({ start: ts(a), end: ts(b), text });
  }
  return out;
}
```
Add `export * from "./srt";` to `index.ts`.

`apps/admin/src/lib/video-iq/transcribe.ts`:
```ts
import { parseSrt, type Segment, type YouTubeClient } from "@rayalaseema/youtube";
export type Transcript = { locale: string; durationSec: number; segments: Segment[]; words?: number };
export function plainText(t: Transcript): string { return t.segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim(); }

export async function transcribeAudio(mp3: Uint8Array, opts: { phrases: string[]; fetchImpl?: typeof fetch }): Promise<Transcript> {
  const key = process.env.AZURE_SPEECH_KEY; const region = process.env.AZURE_SPEECH_REGION || "centralindia";
  if (!key) throw new Error("AZURE_SPEECH_KEY not configured");
  const fd = new FormData();
  fd.append("audio", new Blob([mp3], { type: "audio/mpeg" }), "audio.mp3");
  fd.append("definition", JSON.stringify({ locales: ["te-IN"], profanityFilterMode: "None", phraseList: { phrases: opts.phrases.slice(0, 500) } }));
  const res = await (opts.fetchImpl ?? fetch)(`https://${region}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15`,
    { method: "POST", headers: { "Ocp-Apim-Subscription-Key": key }, body: fd, signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`speech transcription failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as { durationMilliseconds: number; phrases: Array<{ offsetMilliseconds: number; durationMilliseconds: number; text: string }> };
  const segments = (j.phrases ?? []).map((p) => ({ start: p.offsetMilliseconds / 1000, end: (p.offsetMilliseconds + p.durationMilliseconds) / 1000, text: p.text.trim() })).filter((s) => s.text);
  return { locale: "te-IN", durationSec: j.durationMilliseconds / 1000, segments, words: segments.reduce((n, s) => n + s.text.split(/\s+/).length, 0) };
}

export async function transcriptFromCaptions(client: YouTubeClient, videoId: string): Promise<Transcript | null> {
  const tracks = await client.listCaptions(videoId);
  const te = tracks.find((t: any) => t.snippet.language === "te" && t.snippet.trackKind !== "asr") ?? tracks.find((t: any) => t.snippet.language === "te");
  if (!te) return null;
  const segments = parseSrt(await client.downloadCaption(te.id));
  const durationSec = segments.length ? segments[segments.length - 1].end : 0;
  return { locale: "te-IN", durationSec, segments, words: segments.reduce((n, s) => n + s.text.split(/\s+/).length, 0) };
}
```

- [ ] **Step 4: Run tests**

Run both test files as in Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/youtube/src/srt.ts packages/youtube/src/index.ts packages/youtube/__tests__/srt.test.ts apps/admin/src/lib/video-iq/transcribe.ts apps/admin/__tests__/video-iq/transcribe.test.ts
git commit -m "feat(video-iq): Azure fast transcription te-IN with phrase list; SRT caption parsing

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Model contract, prompt, analyzer, hook check

**Files:**
- Create: `packages/youtube/src/contract.ts`, `packages/youtube/src/hook.ts`, `apps/admin/src/lib/video-iq/prompt.ts`, `apps/admin/src/lib/video-iq/analyze.ts`
- Modify: `packages/youtube/src/index.ts`
- Test: `packages/youtube/__tests__/contract.test.ts`, `packages/youtube/__tests__/hook.test.ts`, `apps/admin/__tests__/video-iq/analyze.test.ts`

**Interfaces:**
- Produces: zod `suggestionsSchema` and type `Suggestions` (exact fields from spec 4.3 plus `playlists: string[]`); `hookCheck(segments: Segment[], isShort: boolean): { late: boolean; startsAt: number; reason: string }`; `buildMessages(input: AnalyzeInput): ChatMessage[]`; `analyzeVideo(input: AnalyzeInput, deps?: { chatJson?: typeof chatJsonWithRetry }): Promise<Suggestions>` where `AnalyzeInput = { format: "SHORT" | "VIDEO"; transcript: Transcript | null; deskTitle: string; deskDescription: string; district?: string; keywordTerms: string[]; playlists: string[]; dateDdMmYyyy: string; breaking: boolean }`.

- [ ] **Step 1: Write failing tests**

`packages/youtube/__tests__/contract.test.ts`:
```ts
import { describe, test, expect } from "bun:test";
import { suggestionsSchema } from "../src/contract";
export const SAMPLE = {
  format: "VIDEO", summary_te: "ప్రొద్దుటూరు మున్సిపల్ ఎన్నికలపై రాచమల్లు ఫైర్.", summary_en: "Rachamallu Siva Prasad Reddy slams Varadarajulu Reddy in Proddatur.",
  titles: [{ text: "వరదరాజుల రెడ్డిపై రాచమల్లు ఫైర్ | Rachamallu Siva Prasad Reddy vs Varadarajulu Reddy", why: "names" }, { text: "a | b", why: "" }, { text: "c | d", why: "" }],
  description: "desc", tags: ["proddatur news", "ప్రొద్దుటూరు న్యూస్"], hashtags: [], chapters: [{ start: "00:00", title_te: "పరిచయం" }, { start: "01:10", title_te: "ఆరోపణలు" }, { start: "05:00", title_te: "హెచ్చరిక" }],
  pinned_comment: "మీ అభిప్రాయం?", playlists: ["Politics", "District Stories"], thumbnail: { headline_te: "ఏకగ్రీవాలపై రాచమల్లు ఫైర్", concept: "face + burning papers" },
  entities: { people: ["Rachamallu Siva Prasad Reddy"], places: ["Proddatur"], parties: ["YSRCP", "TDP"], topics: ["municipal elections"] },
  fit: { district: "Kadapa", local_relevance: 0.95, reused_content_risk: "low", verdict: "fit", reason_te: "" }, low_confidence: false,
};
describe("suggestionsSchema", () => {
  test("accepts the sample", () => expect(suggestionsSchema.safeParse(SAMPLE).success).toBe(true));
  test("rejects a title over 100 chars and a wrong verdict", () => {
    expect(suggestionsSchema.safeParse({ ...SAMPLE, titles: [{ text: "x".repeat(101), why: "" }, SAMPLE.titles[1], SAMPLE.titles[2]] }).success).toBe(false);
    expect(suggestionsSchema.safeParse({ ...SAMPLE, fit: { ...SAMPLE.fit, verdict: "maybe" } }).success).toBe(false);
  });
  test("requires exactly three titles", () => expect(suggestionsSchema.safeParse({ ...SAMPLE, titles: SAMPLE.titles.slice(0, 2) }).success).toBe(false));
});
```
`packages/youtube/__tests__/hook.test.ts`:
```ts
import { describe, test, expect } from "bun:test";
import { hookCheck } from "../src/hook";
describe("hookCheck", () => {
  test("greeting first means late hook with the real start time", () => {
    const r = hookCheck([{ start: 0, end: 4, text: "రాయలసీమ న్యూస్‌కు స్వాగతం" }, { start: 4, end: 9, text: "ప్రొద్దుటూరులో వైసీపీ అభ్యర్థి ఇంటిపై దాడి" }], false);
    expect(r.late).toBe(true); expect(r.startsAt).toBe(4);
  });
  test("news in the first segment is fine", () => {
    expect(hookCheck([{ start: 0, end: 3, text: "కడపలో దారుణం.. అన్నను గొడ్డలితో హత్య" }], false).late).toBe(false);
  });
  test("shorts use a 2 second window", () => {
    expect(hookCheck([{ start: 0, end: 2.5, text: "నమస్కారం" }, { start: 2.5, end: 5, text: "కడపలో దారుణం" }], true).late).toBe(true);
  });
});
```
`apps/admin/__tests__/video-iq/analyze.test.ts`:
```ts
import { describe, test, expect } from "bun:test";
import { analyzeVideo, buildMessages } from "../../src/lib/video-iq/analyze";
import { SAMPLE } from "../../../../packages/youtube/__tests__/contract.test";

const input = { format: "VIDEO" as const, transcript: { locale: "te-IN", durationSec: 600, segments: [{ start: 0, end: 5, text: "రాచమల్లు ఫైర్" }], words: 2 }, deskTitle: "రాచమల్లు ప్రెస్ మీట్", deskDescription: "", district: "Kadapa", keywordTerms: ["proddatur news"], playlists: ["Politics", "District Stories", "Shorts"], dateDdMmYyyy: "20-10-2026", breaking: false };

describe("analyzeVideo", () => {
  test("prompt carries transcript, rules, playlists, no URLs", () => {
    const msgs = buildMessages(input); const all = msgs.map((m) => m.content).join("\n");
    expect(all).toContain("రాచమల్లు ఫైర్"); expect(all).toContain("Politics"); expect(all).toContain("100"); expect(all).not.toMatch(/https?:\/\//);
  });
  test("returns validated suggestions from the model JSON", async () => {
    const chatJson = (async () => SAMPLE) as any;
    const s = await analyzeVideo(input, { chatJson });
    expect(s.titles.length).toBe(3); expect(s.fit.verdict).toBe("fit");
  });
  test("short transcript forces low_confidence and still yields titles", async () => {
    const chatJson = (async () => ({ ...SAMPLE, low_confidence: false })) as any;
    const s = await analyzeVideo({ ...input, transcript: { locale: "te-IN", durationSec: 30, segments: [{ start: 0, end: 2, text: "సంగీతం" }], words: 1 } }, { chatJson });
    expect(s.low_confidence).toBe(true); expect(s.titles.length).toBe(3);
  });
  test("invalid model output throws a readable error", async () => {
    const chatJson = (async () => ({ nope: 1 })) as any;
    await expect(analyzeVideo(input, { chatJson })).rejects.toThrow(/model output invalid/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run the three test files. Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`packages/youtube/src/contract.ts`:
```ts
import { z } from "zod";
const title = z.object({ text: z.string().min(5).max(100), why: z.string().max(300) });
export const suggestionsSchema = z.object({
  format: z.enum(["SHORT", "VIDEO"]),
  summary_te: z.string().max(600), summary_en: z.string().max(400),
  titles: z.array(title).length(3),
  description: z.string().max(4500),
  tags: z.array(z.string().max(60)).min(5).max(30),
  hashtags: z.array(z.string().regex(/^#\S+$/)).max(5),
  chapters: z.array(z.object({ start: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/), title_te: z.string().max(80) })).max(12),
  pinned_comment: z.string().max(500).refine((s) => !/https?:\/\//i.test(s), "no URLs in comments"),
  playlists: z.array(z.string()).max(9),
  thumbnail: z.object({ headline_te: z.string().max(60), concept: z.string().max(300) }),
  entities: z.object({ people: z.array(z.string()), places: z.array(z.string()), parties: z.array(z.string()), topics: z.array(z.string()) }),
  fit: z.object({ district: z.string().nullable(), local_relevance: z.number().min(0).max(1), reused_content_risk: z.enum(["low", "medium", "high"]), verdict: z.enum(["fit", "borderline", "not_fit"]), reason_te: z.string().max(400) }),
  low_confidence: z.boolean(),
});
export type Suggestions = z.infer<typeof suggestionsSchema>;
```
`packages/youtube/src/hook.ts`:
```ts
import type { Segment } from "./srt";
const INTRO = /స్వాగతం|నమస్కారం|రాయలసీమ న్యూస్|welcome|subscribe|సబ్‌స్క్రైబ్|హలో/i;
export function hookCheck(segments: Segment[], isShort: boolean) {
  const window = isShort ? 2 : 5;
  const early = segments.filter((s) => s.start < window);
  const words = early.map((s) => s.text).join(" ").trim();
  const bad = !words || INTRO.test(words) || words.split(/\s+/).length < 3;
  if (!bad) return { late: false, startsAt: 0, reason: "" };
  const first = segments.find((s) => s.start >= window && !INTRO.test(s.text) && s.text.split(/\s+/).length >= 3);
  return { late: true, startsAt: first ? Math.round(first.start) : window, reason: words ? "opens with greeting or branding" : "no speech in the opening" };
}
```
Add `export * from "./contract"; export * from "./hook";` to `index.ts`.

`apps/admin/src/lib/video-iq/prompt.ts`:
```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
// The owner's rewrite prompt lives in docs so editors can read it; loaded once.
let cached: string | null = null;
export function ownerPrompt(): string {
  if (cached) return cached;
  try { cached = readFileSync(join(process.cwd(), "..", "..", "docs", "youtube", "metadata-rewrite-prompt.md"), "utf8").split("---").slice(1).join("---").trim(); }
  catch { cached = "You are a Telugu news YouTube SEO copywriter for Rayalaseema News."; }
  return cached;
}
export const RULES = `
Rules that override everything above:
- Every title is "<Telugu hook, first story only> | <English headline>". Total length 100 characters or fewer. The English headline must contain a person or a place in these spellings when they appear: Rachamallu Siva Prasad Reddy, Varadarajulu Reddy, Chandrababu Naidu, YS Jagan, Pawan Kalyan, Nara Lokesh, JC Prabhakar Reddy, YS Avinash Reddy; places Proddatur, Kadapa, Kurnool, Nandyal, Anantapur, Tirupati, Chittoor, Pulivendula, Jammalamadugu, Rayachoti, Madanapalle, Pileru, Adoni, Tadipatri, Hindupur, Srikalahasti.
- Telugu is standard Eenadu/Sakshi register. No Rayalaseema dialect. No "బ్రేకింగ్" unless the item is marked breaking. No clock-time claims.
- Never write a URL anywhere. Code adds links.
- Chapters only for VIDEO: first at 00:00, 3 to 8 entries, at least 10 seconds apart, Telugu titles from the transcript.
- hashtags only for SHORT: 3 to 5, English or Telugu, place first.
- playlists: rank ONLY from the given list, best fit first, at most 3; empty when verdict is not_fit.
- fit.local_relevance: 1 = a Rayalaseema or AP story with a named place; 0 = unrelated to AP. reused_content_risk high when the transcript suggests third-party footage, other-language source captions, or national/international clips.
- If the transcript is missing or under 20 words, set low_confidence true and build from the desk title.
Return ONLY the JSON object with keys: format, summary_te, summary_en, titles[3]{text,why}, description, tags, hashtags, chapters[{start,title_te}], pinned_comment, playlists, thumbnail{headline_te,concept}, entities{people,places,parties,topics}, fit{district,local_relevance,reused_content_risk,verdict,reason_te}, low_confidence.`;
```
`apps/admin/src/lib/video-iq/analyze.ts`:
```ts
import { chatJsonWithRetry, type ChatMessage } from "@/lib/ai/client";
import { suggestionsSchema, type Suggestions } from "@rayalaseema/youtube";
import type { Transcript } from "./transcribe";
import { ownerPrompt, RULES } from "./prompt";

export type AnalyzeInput = { format: "SHORT" | "VIDEO"; transcript: Transcript | null; deskTitle: string; deskDescription: string; district?: string; keywordTerms: string[]; playlists: string[]; dateDdMmYyyy: string; breaking: boolean };
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function buildMessages(i: AnalyzeInput): ChatMessage[] {
  const lines = i.transcript ? i.transcript.segments.map((s) => `[${mmss(s.start)}] ${s.text}`).join("\n") : "(no transcript)";
  const user = [
    `FORMAT: ${i.format}`, `DATE: ${i.dateDdMmYyyy}`, `BREAKING: ${i.breaking ? "yes" : "no"}`, `DISTRICT (desk): ${i.district ?? "unknown"}`,
    `DESK TITLE: ${i.deskTitle}`, `DESK DESCRIPTION: ${i.deskDescription.slice(0, 1500)}`,
    `KEYWORDS WITH DEMAND: ${i.keywordTerms.join(", ")}`, `PLAYLISTS (rank from these only): ${i.playlists.join(" | ")}`,
    `TRANSCRIPT (${i.transcript?.words ?? 0} words):`, lines.slice(0, 48_000),
  ].join("\n");
  return [{ role: "system", content: `${ownerPrompt()}\n${RULES}` }, { role: "user", content: user }];
}

export async function analyzeVideo(i: AnalyzeInput, deps: { chatJson?: typeof chatJsonWithRetry } = {}): Promise<Suggestions> {
  const chatJson = deps.chatJson ?? chatJsonWithRetry;
  const raw = await chatJson<unknown>({ deployment: process.env.AZURE_OPENAI_COMPOSE_DEPLOYMENT || "gpt51", messages: buildMessages(i), temperature: 0.3 }, [1500, 3000]);
  const parsed = suggestionsSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`model output invalid: ${parsed.error.issues.slice(0, 3).map((e) => `${e.path.join(".")} ${e.message}`).join("; ")}`);
  const s = parsed.data;
  const thin = !i.transcript || (i.transcript.words ?? 0) < 20;
  return { ...s, low_confidence: s.low_confidence || thin, format: i.format };
}
```

- [ ] **Step 4: Run tests**

Run the three test files. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/youtube/src/contract.ts packages/youtube/src/hook.ts packages/youtube/src/index.ts packages/youtube/__tests__/contract.test.ts packages/youtube/__tests__/hook.test.ts apps/admin/src/lib/video-iq/prompt.ts apps/admin/src/lib/video-iq/analyze.ts apps/admin/__tests__/video-iq/analyze.test.ts
git commit -m "feat(video-iq): model contract, analyzer prompt, hook check

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Keyword intelligence (DataForSEO client in the package, cache, enrichment)

**Files:**
- Create: `packages/youtube/src/dataforseo.ts`, `apps/admin/src/lib/video-iq/keywords.ts`
- Modify: `packages/youtube/src/index.ts`
- Test: `packages/youtube/__tests__/dataforseo.test.ts`, `apps/admin/__tests__/video-iq/keywords.test.ts`

**Interfaces:**
- Produces: `createDataForSeo(o: { login: string; password: string; fetchImpl?: typeof fetch })` with `searchVolume(terms: string[]): Promise<Array<{ term: string; volume: number | null; competition: string | null }>>`, `suggestions(seed: string, limit?: number)`, `related(seed: string, limit?: number)`, `youtubeSerp(keyword: string): Promise<Array<{ rank: number; channel: string; title: string; views: number | null; published: string | null; url: string }>>`; `enrichKeywords(s: Suggestions, deps: { prisma: PrismaLike; dfs: DataForSeo | null; now?: Date }): Promise<KeywordBlock>` where `KeywordBlock = { terms: Array<{ term: string; volume: number | null; competition: string | null }>; suggested: Array<{ term: string; volume: number | null }>; serp: Array<...>; unavailable?: string }`; `englishTerms(s: Suggestions): string[]`.

- [ ] **Step 1: Write failing tests**

`packages/youtube/__tests__/dataforseo.test.ts`:
```ts
import { describe, test, expect } from "bun:test";
import { createDataForSeo } from "../src/dataforseo";
const ok = (result: unknown) => new Response(JSON.stringify({ status_code: 20000, tasks: [{ status_code: 20000, result }] }));
describe("dataforseo", () => {
  test("searchVolume posts India + partners and maps rows", async () => {
    let body = "";
    const fetchImpl = (async (_u: string, init: RequestInit) => { body = String(init.body); return ok([{ keyword: "proddatur news", search_volume: 1000, competition: "LOW" }]); }) as any;
    const d = createDataForSeo({ login: "l", password: "p", fetchImpl });
    expect(await d.searchVolume(["proddatur news"])).toEqual([{ term: "proddatur news", volume: 1000, competition: "LOW" }]);
    expect(body).toContain('"location_code":2356'); expect(body).toContain('"search_partners":true');
  });
  test("youtubeSerp maps items and omits depth", async () => {
    let body = "";
    const fetchImpl = (async (_u: string, init: RequestInit) => { body = String(init.body); return ok([{ items: [{ rank_absolute: 1, channel_name: "Sakshi TV", title: "x", views_count: 5, publication_date: "1 day ago", url: "u" }] }]); }) as any;
    const d = createDataForSeo({ login: "l", password: "p", fetchImpl });
    expect(await d.youtubeSerp("proddatur news")).toEqual([{ rank: 1, channel: "Sakshi TV", title: "x", views: 5, published: "1 day ago", url: "u" }]);
    expect(body).not.toContain("depth");
  });
  test("API error surfaces status message", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ status_code: 40101, status_message: "Access denied. Your IP is not whitelisted." }), { status: 401 })) as any;
    await expect(createDataForSeo({ login: "l", password: "p", fetchImpl }).searchVolume(["a"])).rejects.toThrow(/not whitelisted/);
  });
});
```
`apps/admin/__tests__/video-iq/keywords.test.ts`:
```ts
import { describe, test, expect } from "bun:test";
import { enrichKeywords, englishTerms } from "../../src/lib/video-iq/keywords";
import { SAMPLE } from "../../../../packages/youtube/__tests__/contract.test";

function fakePrisma(rows: Record<string, { volume: number | null; competition: string | null; fetchedAt: Date }>) {
  return { keywordVolume: {
    findMany: async ({ where }: any) => (where.term.in as string[]).filter((t) => rows[t]).map((t) => ({ term: t, ...rows[t] })),
    upsert: async ({ where, create }: any) => { rows[where.term] = { volume: create.volume, competition: create.competition, fetchedAt: create.fetchedAt }; return create; },
  } };
}
describe("enrichKeywords", () => {
  test("englishTerms pulls english phrases from titles and tags, lower-cased, unique", () => {
    const t = englishTerms(SAMPLE as any);
    expect(t).toContain("rachamallu siva prasad reddy vs varadarajulu reddy"); expect(t).toContain("proddatur news"); expect(new Set(t).size).toBe(t.length);
  });
  test("uses cache when fresh, calls dfs only for missing terms, stores results", async () => {
    const rows: any = { "proddatur news": { volume: 1000, competition: "LOW", fetchedAt: new Date() } };
    const asked: string[][] = [];
    const dfs = { searchVolume: async (terms: string[]) => { asked.push(terms); return terms.map((term) => ({ term, volume: 7, competition: "LOW" })); }, suggestions: async () => [{ term: "proddatur news today", volume: 320 }], related: async () => [], youtubeSerp: async () => [] } as any;
    const block = await enrichKeywords(SAMPLE as any, { prisma: fakePrisma(rows) as any, dfs });
    expect(asked[0]).not.toContain("proddatur news");
    expect(block.terms.find((t) => t.term === "proddatur news")?.volume).toBe(1000);
    expect(block.suggested[0].term).toBe("proddatur news today");
    expect(rows["rachamallu siva prasad reddy vs varadarajulu reddy"].volume).toBe(7);
  });
  test("dfs null marks the block unavailable and returns cached terms only", async () => {
    const block = await enrichKeywords(SAMPLE as any, { prisma: fakePrisma({}) as any, dfs: null });
    expect(block.unavailable).toMatch(/not configured/); expect(block.serp).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run both. Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`packages/youtube/src/dataforseo.ts`: port of `scripts/seo/dataforseo.ts` with credentials passed in (no file reading), `youtubeSerp` without `depth`, and errors carrying `status_message`. Signature exactly as in Interfaces; `INDIA = 2356`. Keep the four functions; each wraps one POST to `https://api.dataforseo.com/v3/<path>` with `Authorization: Basic base64(login:password)`, 60 s timeout, and throws `new Error(\`${path}: ${json.status_message ?? res.status} / ${task?.status_message ?? ""}\`)` when `json.status_code !== 20000 || task?.status_code !== 20000`.

`apps/admin/src/lib/video-iq/keywords.ts`:
```ts
import type { Suggestions, DataForSeo } from "@rayalaseema/youtube";
import { splitTitle } from "@rayalaseema/youtube";
export type KeywordBlock = { terms: Array<{ term: string; volume: number | null; competition: string | null }>; suggested: Array<{ term: string; volume: number | null }>; serp: Array<{ rank: number; channel: string; title: string; views: number | null; published: string | null; url: string }>; unavailable?: string };
type PrismaLike = { keywordVolume: { findMany: (a: any) => Promise<any[]>; upsert: (a: any) => Promise<any> } };
const THIRTY_DAYS = 30 * 86400_000;

export function englishTerms(s: Suggestions): string[] {
  const out = new Set<string>();
  for (const t of s.titles) { const e = splitTitle(t.text).english.toLowerCase().replace(/[^a-z0-9 ,:\-']/g, " ").replace(/\s+/g, " ").trim(); if (e) out.add(e); }
  for (const tag of s.tags) if (/^[a-z0-9 \-']+$/i.test(tag)) out.add(tag.toLowerCase().trim());
  return [...out].filter(Boolean).slice(0, 60);
}
export async function enrichKeywords(s: Suggestions, deps: { prisma: PrismaLike; dfs: DataForSeo | null; now?: Date }): Promise<KeywordBlock> {
  const now = deps.now ?? new Date();
  const terms = englishTerms(s);
  const cached = await deps.prisma.keywordVolume.findMany({ where: { term: { in: terms } } });
  const fresh = new Map(cached.filter((r) => now.getTime() - new Date(r.fetchedAt).getTime() < THIRTY_DAYS).map((r) => [r.term, r]));
  const missing = terms.filter((t) => !fresh.has(t));
  const block: KeywordBlock = { terms: terms.map((t) => ({ term: t, volume: fresh.get(t)?.volume ?? null, competition: fresh.get(t)?.competition ?? null })), suggested: [], serp: [] };
  if (!deps.dfs) { block.unavailable = "DataForSEO not configured"; return block; }
  try {
    if (missing.length) {
      const rows = await deps.dfs.searchVolume(missing);
      for (const r of rows) {
        await deps.prisma.keywordVolume.upsert({ where: { term: r.term.toLowerCase() }, create: { term: r.term.toLowerCase(), volume: r.volume, competition: r.competition, fetchedAt: now }, update: { volume: r.volume, competition: r.competition, fetchedAt: now } });
        const slot = block.terms.find((t) => t.term === r.term.toLowerCase()); if (slot) { slot.volume = r.volume; slot.competition = r.competition; }
      }
    }
    const seed = s.entities.people[0] ?? s.entities.places[0];
    if (seed) block.suggested = [...(await deps.dfs.suggestions(seed, 20)), ...(await deps.dfs.related(seed, 10))].filter((x) => x.term).slice(0, 25);
    block.serp = await deps.dfs.youtubeSerp(splitTitle(s.titles[0].text).english || s.summary_en);
  } catch (e) { block.unavailable = String((e as Error).message).slice(0, 200); }
  return block;
}
```
Export `DataForSeo` type (`ReturnType<typeof createDataForSeo>`) from the package and add `export * from "./dataforseo";` to `index.ts`.

- [ ] **Step 4: Run tests**

Run both. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/youtube/src/dataforseo.ts packages/youtube/src/index.ts packages/youtube/__tests__/dataforseo.test.ts apps/admin/src/lib/video-iq/keywords.ts apps/admin/__tests__/video-iq/keywords.test.ts
git commit -m "feat(video-iq): DataForSEO client, 30-day keyword cache, SERP and suggestions enrichment

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Deterministic scoring and the description template

**Files:**
- Create: `packages/youtube/src/score.ts`, `packages/youtube/src/description.ts`
- Modify: `packages/youtube/src/index.ts`
- Test: `packages/youtube/__tests__/score.test.ts`, `packages/youtube/__tests__/description.test.ts`

**Interfaces:**
- Produces: `scoreTitle(title: string, a: { entities: Suggestions["entities"]; breaking: boolean; volumes: Map<string, number | null> }): number`, `scoreDescription(d: string): number`, `scoreTags(tags: string[]): number`, `scoreThumbnail(a: { headline: string; hasFrame: boolean; bytes?: number; width?: number; height?: number }): number`, `scoreFit(f: Suggestions["fit"]): number`, `overall(s: { title; thumbnail; description; tags; fit }): number`, `Scores` type; `buildDescription(a: { hook: string; enLine?: string; articleUrl?: string | null; placeLine?: string | null; story?: string; hashtags?: string[]; site: string; subscribeUrl: string }): string`, `placeLine(p: Place | null, today: boolean): string | null`.

- [ ] **Step 1: Write failing tests**

`packages/youtube/__tests__/score.test.ts`:
```ts
import { describe, test, expect } from "bun:test";
import { scoreTitle, scoreDescription, scoreTags, scoreThumbnail, scoreFit, overall } from "../src/score";
const ents = { people: ["Rachamallu Siva Prasad Reddy"], places: ["Proddatur"], parties: [], topics: [] };
describe("score", () => {
  test("good title scores high, over-long and english-less titles lose points", () => {
    const vols = new Map([["proddatur news", 1000]]);
    expect(scoreTitle("రాచమల్లు ఫైర్ | Rachamallu Siva Prasad Reddy Proddatur News", { entities: ents, breaking: false, volumes: vols })).toBeGreaterThanOrEqual(90);
    expect(scoreTitle("రాచమల్లు ఫైర్", { entities: ents, breaking: false, volumes: vols })).toBeLessThanOrEqual(55);
    expect(scoreTitle("అ".repeat(95) + " | Proddatur", { entities: ents, breaking: false, volumes: vols })).toBeLessThan(80);
    expect(scoreTitle("బ్రేకింగ్ | Proddatur News", { entities: ents, breaking: false, volumes: vols })).toBeLessThan(scoreTitle("రాచమల్లు | Proddatur News", { entities: ents, breaking: false, volumes: vols }));
  });
  test("description, tags, thumbnail, fit, overall", () => {
    expect(scoreDescription("hook line\nProddatur News | ప్రొద్దుటూరు న్యూస్\nbody")).toBe(100);
    expect(scoreDescription("https://instagram.com/x\nnothing")).toBeLessThanOrEqual(50);
    expect(scoreTags(Array.from({ length: 16 }, (_, i) => (i % 2 ? `tag${i}` : `ట్యాగ్${i}`)))).toBe(100);
    expect(scoreTags(["a", "b"])).toBeLessThanOrEqual(75);
    expect(scoreThumbnail({ headline: "ఏకగ్రీవాలపై రాచమల్లు ఫైర్", hasFrame: true, bytes: 500_000, width: 1280, height: 720 })).toBe(100);
    expect(scoreThumbnail({ headline: "ఒకటి రెండు మూడు నాలుగు ఐదు ఆరు", hasFrame: false })).toBeLessThanOrEqual(34);
    expect(scoreFit({ district: "Kadapa", local_relevance: 0.9, reused_content_risk: "high", verdict: "borderline", reason_te: "" })).toBe(40);
    expect(overall({ title: 100, thumbnail: 100, description: 100, tags: 100, fit: 100 })).toBe(100);
  });
});
```
`packages/youtube/__tests__/description.test.ts`:
```ts
import { describe, test, expect } from "bun:test";
import { buildDescription, placeLine } from "../src/description";
import { PLACES } from "../src/places";
describe("description", () => {
  test("assembles hook, english line, link, place line, story, hashtags, footer", () => {
    const d = buildDescription({ hook: "హుక్", enLine: "English line", articleUrl: "https://rayalaseemanews.com/videos/x", placeLine: "Proddatur News | ప్రొద్దుటూరు న్యూస్", story: "కథ", hashtags: ["#ProddaturNews"], site: "https://rayalaseemanews.com", subscribeUrl: "https://www.youtube.com/@rayalaseemanewstv?sub_confirmation=1" });
    expect(d.split("\n")[0]).toBe("హుక్"); expect(d).toContain("పూర్తి వార్త: https://rayalaseemanews.com/videos/x"); expect(d).toContain("#ProddaturNews"); expect(d.endsWith("sub_confirmation=1")).toBe(true);
  });
  test("placeLine differs for town vs district HQ and today flag", () => {
    expect(placeLine(PLACES.find((p) => p.en === "Proddatur")!, true)).toBe("Proddatur News Today | ప్రొద్దుటూరు న్యూస్ | Kadapa District News | Rayalaseema News");
    expect(placeLine(PLACES.find((p) => p.en === "Kadapa")!, false)).toBe("Kadapa News | కడప న్యూస్ | Rayalaseema News");
    expect(placeLine(null, false)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run both. Expected: FAIL.

- [ ] **Step 3: Implement**

`packages/youtube/src/score.ts`:
```ts
import { splitTitle, titleLength } from "./title";
import type { Suggestions } from "./contract";
const hasTelugu = (s: string) => /[\u0C00-\u0C7F]/.test(s);
const hasEnglish = (s: string) => /[A-Za-z]{3,}/.test(s);
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function scoreTitle(title: string, a: { entities: Suggestions["entities"]; breaking: boolean; volumes: Map<string, number | null> }): number {
  let s = 100;
  if (titleLength(title) > 100) s -= 20;
  const { english } = splitTitle(title);
  if (!hasEnglish(english)) s -= 25;
  const names = [...a.entities.people, ...a.entities.places].map((x) => x.toLowerCase());
  if (!names.some((n) => title.toLowerCase().includes(n))) s -= 20;
  if (/బ్రేకింగ్|breaking/i.test(title) && !a.breaking) s -= 15;
  if (/\b\d{1,2}\s?(am|pm)\b|గంటలకు/i.test(title)) s -= 10;
  let bonus = 0;
  for (const [term, v] of a.volumes) if (v && english.toLowerCase().includes(term)) bonus = Math.max(bonus, Math.min(15, Math.log10(v) * 5));
  return clamp(s + bonus);
}
export function scoreDescription(d: string): number {
  let s = 100; const first = d.split("\n")[0] ?? "";
  if (!first.trim() || /https?:\/\//.test(first)) s -= 25;
  if (!/ News(?: Today)? \| /.test(d)) s -= 25;
  if (d.length > 5000) s -= 25;
  if (/instagram\.com|facebook\.com|twitter\.com|x\.com\//i.test(d)) s -= 25;
  return clamp(s);
}
export function scoreTags(tags: string[]): number {
  let s = 100;
  if (tags.length < 15 || tags.length > 25) s -= 25;
  if (!tags.some(hasTelugu) || !tags.some(hasEnglish)) s -= 25;
  if (tags.join(",").length > 450) s -= 25;
  return clamp(s);
}
export function scoreThumbnail(a: { headline: string; hasFrame: boolean; bytes?: number; width?: number; height?: number }): number {
  let s = 100;
  if (a.headline.trim().split(/\s+/).length > 5) s -= 33;
  if (!a.hasFrame) s -= 33;
  if (a.bytes && a.bytes > 2_000_000) s -= 33;
  if (a.width && a.height && (a.width !== 1280 || a.height !== 720)) s -= 33;
  return clamp(s);
}
export function scoreFit(f: Suggestions["fit"]): number {
  const base = f.local_relevance * 100;
  return clamp(f.reused_content_risk === "high" ? Math.min(40, base) : base);
}
export type Scores = { title: number; thumbnail: number; description: number; tags: number; fit: number; overall: number };
export function overall(s: Omit<Scores, "overall">): number {
  return clamp((s.title * 35 + s.thumbnail * 25 + s.description * 15 + s.tags * 10 + s.fit * 15) / 100);
}
```
`packages/youtube/src/description.ts`:
```ts
import type { Place } from "./places";
export function placeLine(p: Place | null, today: boolean): string | null {
  if (!p) return null;
  const t = today ? " Today" : "";
  return p.en === p.district ? `${p.en} News${t} | ${p.te} న్యూస్ | Rayalaseema News` : `${p.en} News${t} | ${p.te} న్యూస్ | ${p.district} District News | Rayalaseema News`;
}
export function buildDescription(a: { hook: string; enLine?: string; articleUrl?: string | null; placeLine?: string | null; story?: string; hashtags?: string[]; site: string; subscribeUrl: string }): string {
  const parts = [a.hook.trim(), a.enLine?.trim() || null, a.articleUrl ? `పూర్తి వార్త: ${a.articleUrl}` : null, a.placeLine || null, "",
    a.story?.trim() || null, a.story ? "" : null, a.hashtags?.length ? a.hashtags.join(" ") : null, a.hashtags?.length ? "" : null,
    "రాయలసీమ న్యూస్ | Rayalaseema News", `🌐 ${a.site}`, `సబ్‌స్క్రైబ్ చేయండి: ${a.subscribeUrl}`];
  return parts.filter((x): x is string => x !== null).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
```
Add `export * from "./score"; export * from "./description";` to `index.ts`.

- [ ] **Step 4: Run tests**

Run both. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/youtube
git commit -m "feat(youtube): deterministic scoring and description template

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Thumbnail renderer (Playwright over the brand template)

**Files:**
- Create: `apps/admin/src/lib/video-iq/thumbnail.ts`, `apps/admin/src/lib/video-iq/thumbnail.html`, `apps/admin/public/brand/rsn-logo.png` (copy of the RSN logo from `D:\Downloads\RSN-NEW-LOGOS\RSN`, the circular red mark, 256 px), `apps/admin/public/brand/NotoSansTelugu-Bold.ttf` (copy from `packages/db`/e-paper font set used in `apps/admin/src/lib/epaper/telugu-fonts.ts`; reuse that path if it already ships a bold Telugu TTF)
- Test: `apps/admin/__tests__/video-iq/thumbnail.test.ts`

**Interfaces:**
- Produces: `renderThumbnail(a: { frame: Uint8Array | string; headline: string; breaking: boolean; logoPath?: string }): Promise<{ jpeg: Uint8Array; width: 1280; height: 720 }>`; `jpegUnder2MB(buf: Uint8Array): boolean`.

- [ ] **Step 1: Write failing test**

`apps/admin/__tests__/video-iq/thumbnail.test.ts`:
```ts
import { describe, test, expect } from "bun:test";
import { renderThumbnail } from "../../src/lib/video-iq/thumbnail";
// 1x1 red PNG
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
describe("renderThumbnail", () => {
  test("renders 1280x720 jpeg under 2MB with the headline", async () => {
    let r; try { r = await renderThumbnail({ frame: PNG, headline: "ఏకగ్రీవాలపై రాచమల్లు ఫైర్", breaking: false }); } catch (e) { if (String(e).includes("Executable doesn't exist")) return console.log("chromium missing, skipped"); throw e; }
    expect(r.width).toBe(1280); expect(r.height).toBe(720); expect(r.jpeg.byteLength).toBeGreaterThan(5000); expect(r.jpeg.byteLength).toBeLessThan(2_000_000);
    expect(r.jpeg[0]).toBe(0xff); expect(r.jpeg[1]).toBe(0xd8);
  }, 60_000);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/admin && bun test __tests__/video-iq/thumbnail.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`apps/admin/src/lib/video-iq/thumbnail.html` (template with `{{FRAME}}`, `{{HEADLINE}}`, `{{LOGO}}`, `{{BADGE}}` placeholders):
```html
<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"NotoTe";src:url("{{FONT}}") format("truetype");font-weight:700}
html,body{margin:0;width:1280px;height:720px;overflow:hidden;background:#000}
.bg{position:absolute;inset:0;background:url("{{FRAME}}") center/cover no-repeat}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.05) 0%,rgba(0,0,0,.15) 45%,rgba(0,0,0,.85) 100%)}
.logo{position:absolute;top:28px;left:32px;width:96px;height:96px;background:url("{{LOGO}}") center/contain no-repeat}
.badge{position:absolute;top:40px;right:40px;background:#d81f26;color:#fff;font:700 34px/1 "NotoTe",sans-serif;padding:12px 22px;border-radius:8px;display:{{BADGE}}}
.h{position:absolute;left:48px;right:48px;bottom:56px;color:#fff;font:700 var(--fs) "NotoTe",sans-serif;line-height:1.15;text-shadow:0 4px 18px rgba(0,0,0,.9);word-break:break-word}
.h b{color:#ffd400}
</style></head><body>
<div class="bg"></div><div class="shade"></div><div class="logo"></div><div class="badge">బ్రేకింగ్</div>
<div class="h" id="h">{{HEADLINE}}</div>
<script>
// Shrink the headline until it fits two lines.
const h=document.getElementById("h");let fs=118;h.style.setProperty("--fs",fs+"px");
while(h.scrollHeight>fs*2.5&&fs>56){fs-=4;h.style.setProperty("--fs",fs+"px");}
</script></body></html>
```
`apps/admin/src/lib/video-iq/thumbnail.ts`:
```ts
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const TEMPLATE = readFileSync(join(process.cwd(), "src", "lib", "video-iq", "thumbnail.html"), "utf8");
const b64 = (u: Uint8Array, mime: string) => `data:${mime};base64,${Buffer.from(u).toString("base64")}`;
export function jpegUnder2MB(buf: Uint8Array): boolean { return buf.byteLength <= 2_000_000; }

export async function renderThumbnail(a: { frame: Uint8Array | string; headline: string; breaking: boolean; logoPath?: string; fontPath?: string }) {
  const logo = b64(readFileSync(a.logoPath ?? join(process.cwd(), "public", "brand", "rsn-logo.png")), "image/png");
  const font = b64(readFileSync(a.fontPath ?? join(process.cwd(), "public", "brand", "NotoSansTelugu-Bold.ttf")), "font/ttf");
  const frame = typeof a.frame === "string" ? a.frame : b64(a.frame, a.frame[0] === 0x89 ? "image/png" : "image/jpeg");
  const html = TEMPLATE.replace("{{FRAME}}", frame).replace("{{LOGO}}", logo).replace("{{FONT}}", font).replace("{{BADGE}}", a.breaking ? "block" : "none")
    .replace("{{HEADLINE}}", a.headline.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!)));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    let quality = 90; let jpeg = new Uint8Array(await page.screenshot({ type: "jpeg", quality }));
    while (!jpegUnder2MB(jpeg) && quality > 50) { quality -= 10; jpeg = new Uint8Array(await page.screenshot({ type: "jpeg", quality })); }
    return { jpeg, width: 1280 as const, height: 720 as const };
  } finally { await browser.close(); }
}
```
Copy the logo and the bold Telugu font into `apps/admin/public/brand/` (the e-paper renderer already ships a Telugu font; reuse that file by copying it; check `apps/admin/src/lib/epaper/telugu-fonts.ts` for its path).

- [ ] **Step 4: Run test**

Run: `cd apps/admin && bun test __tests__/video-iq/thumbnail.test.ts`
Expected: PASS (or the explicit chromium-missing skip line locally).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/lib/video-iq/thumbnail.ts apps/admin/src/lib/video-iq/thumbnail.html apps/admin/public/brand apps/admin/__tests__/video-iq/thumbnail.test.ts
git commit -m "feat(video-iq): Playwright thumbnail renderer on the RSN brand template

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Quota ledger, YouTube client factory, worker stage machine, cron route

**Files:**
- Create: `apps/admin/src/lib/video-iq/quota.ts`, `apps/admin/src/lib/video-iq/youtube.ts`, `apps/admin/src/lib/video-iq/worker.ts`, `apps/admin/src/app/api/cron/video-iq/route.ts`
- Test: `apps/admin/__tests__/video-iq/quota.test.ts`, `apps/admin/__tests__/video-iq/worker.test.ts`

**Interfaces:**
- Produces: `pacificDay(d?: Date): string`, `reserveUnits(prisma, units: number, label: string): Promise<void>` (throws `QuotaBudgetError` when day total would exceed 9,000 for writes), `unitsUsedToday(prisma): Promise<number>`; `getYouTube(prisma): YouTubeClient` (env-driven, dryRun from `VIDEO_IQ_YOUTUBE_DRY_RUN`, onUnits → ledger); `runStage(row: VideoOptimization, deps: Deps): Promise<void>` and `processQueue(deps: Deps, limit = 3): Promise<{ processed: string[] }>` where `Deps = { prisma; media; transcribe; analyze; keywords; thumbnail; youtube; blob; now?: () => Date }` (each a module-shaped object so tests can fake them); cron route `POST /api/cron/video-iq` → `{ processed: string[] }`.

- [ ] **Step 1: Write failing tests**

`apps/admin/__tests__/video-iq/quota.test.ts`:
```ts
import { describe, test, expect } from "bun:test";
import { pacificDay, reserveUnits, QuotaBudgetError } from "../../src/lib/video-iq/quota";
function fakePrisma(initial = 0) {
  const rows: Record<string, number> = {}; const d = pacificDay(); rows[d] = initial;
  return { rows, youtubeQuotaDay: { findUnique: async ({ where }: any) => (where.date in rows ? { date: where.date, units: rows[where.date] } : null), upsert: async ({ where, create, update }: any) => { rows[where.date] = (rows[where.date] ?? 0) + (update.units.increment ?? create.units); return { date: where.date, units: rows[where.date] }; } } };
}
describe("quota", () => {
  test("pacificDay rolls at 07:00 UTC in winter", () => {
    expect(pacificDay(new Date("2026-11-10T06:59:00Z"))).toBe("2026-11-09"); expect(pacificDay(new Date("2026-11-10T08:01:00Z"))).toBe("2026-11-10");
  });
  test("reserve adds units and refuses writes past 9000", async () => {
    const p = fakePrisma(8_900) as any;
    await reserveUnits(p, 50, "videos.update"); expect(p.rows[pacificDay()]).toBe(8_950);
    await expect(reserveUnits(p, 1600, "videos.insert")).rejects.toBeInstanceOf(QuotaBudgetError);
    await reserveUnits(p, 1, "videos.list"); // reads always allowed
  });
});
```
`apps/admin/__tests__/video-iq/worker.test.ts`:
```ts
import { describe, test, expect } from "bun:test";
import { runStage } from "../../src/lib/video-iq/worker";
import { SAMPLE } from "../../../../packages/youtube/__tests__/contract.test";

function deps(over: Partial<any> = {}) {
  const updates: any[] = [];
  const row: any = { id: "r1", contentId: "c1", source: "BLOB", blobUrl: "https://blob/x.mp4", status: "QUEUED", attempts: 0, transcript: null, suggestions: null, frames: null, thumbnails: null, scores: null };
  const prisma = { videoOptimization: { update: async ({ data }: any) => { Object.assign(row, data); updates.push(data); return row; } }, content: { findUnique: async () => ({ id: "c1", title: "రాచమల్లు ప్రెస్ మీట్", summary: "", body: "", breaking: false, constituency: { district: { nameEn: "Kadapa" } } }), update: async () => ({}) }, keywordVolume: { findMany: async () => [], upsert: async () => ({}) } };
  const d = {
    prisma, row, updates,
    media: { probe: async () => ({ durationSec: 600, width: 1920, height: 1080, hasAudio: true }), extractAudioMp3: async () => new Uint8Array([1]), extractFrames: async () => [new Uint8Array([0xff, 0xd8]), new Uint8Array([0xff, 0xd8]), new Uint8Array([0xff, 0xd8])] },
    transcribe: { transcribeAudio: async () => ({ locale: "te-IN", durationSec: 600, segments: [{ start: 0, end: 5, text: "రాచమల్లు ఫైర్ వరదరాజుల రెడ్డిపై" }], words: 4 }), transcriptFromCaptions: async () => null },
    analyze: { analyzeVideo: async () => SAMPLE },
    keywords: { enrichKeywords: async () => ({ terms: [{ term: "proddatur news", volume: 1000, competition: "LOW" }], suggested: [], serp: [] }) },
    thumbnail: { renderThumbnail: async () => ({ jpeg: new Uint8Array([0xff, 0xd8, 1, 2]), width: 1280, height: 720 }) },
    blob: { uploadBuffer: async (_b: Buffer, ext: string) => `https://blob/${Math.random().toString(36).slice(2)}.${ext}`, uploadPrivate: async () => "https://blob/private/audio.mp3" },
    youtube: { listMyPlaylists: async () => [{ id: "PL1", title: "Politics" }, { id: "PL2", title: "District Stories" }], listCaptions: async () => [], downloadCaption: async () => "" },
    ...over,
  };
  return d;
}
describe("worker stages", () => {
  test("QUEUED → EXTRACTING → TRANSCRIBING → ANALYZING → READY with artifacts", async () => {
    const d = deps();
    await runStage(d.row, d as any); expect(d.row.status).toBe("EXTRACTING"); expect(d.row.frames.length).toBe(3);
    await runStage(d.row, d as any); expect(d.row.status).toBe("TRANSCRIBING"); expect(d.row.transcript.segments.length).toBe(1);
    await runStage(d.row, d as any); expect(d.row.status).toBe("ANALYZING"); expect(d.row.suggestions.titles.length).toBe(3); expect(d.row.suggestions.keywords.terms[0].volume).toBe(1000);
    await runStage(d.row, d as any); expect(d.row.status).toBe("READY"); expect(d.row.scores.overall).toBeGreaterThan(0); expect(d.row.thumbnails.length).toBe(3);
  });
  test("no audio marks FAILED with 'no audio'", async () => {
    const d = deps({ media: { probe: async () => ({ durationSec: 10, width: 640, height: 360, hasAudio: false }), extractAudioMp3: async () => { throw new Error("no audio track in video"); }, extractFrames: async () => [] } });
    await runStage(d.row, d as any); await runStage(d.row, d as any);
    expect(d.row.status).toBe("FAILED"); expect(d.row.error).toMatch(/no audio/);
  });
  test("YOUTUBE source without captions stays TRANSCRIBING with a retry note", async () => {
    const d = deps(); d.row.source = "YOUTUBE"; d.row.videoId = "abc"; d.row.blobUrl = null;
    await runStage(d.row, d as any); expect(d.row.status).toBe("TRANSCRIBING");
    await runStage(d.row, d as any); expect(d.row.status).toBe("TRANSCRIBING"); expect(d.row.error).toMatch(/captions not ready/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run both. Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/admin/src/lib/video-iq/quota.ts`:
```ts
export class QuotaBudgetError extends Error { constructor() { super("YouTube quota budget for today would be exceeded; retry after 12:30 IST"); this.name = "QuotaBudgetError"; } }
export const DAILY_BUDGET = 9_000;
const READS = new Set(["videos.list", "playlistItems.list", "playlists.list", "channels.list", "captions.list"]);
export function pacificDay(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
type P = { youtubeQuotaDay: { findUnique: (a: any) => Promise<{ units: number } | null>; upsert: (a: any) => Promise<any> } };
export async function unitsUsedToday(prisma: P): Promise<number> { return (await prisma.youtubeQuotaDay.findUnique({ where: { date: pacificDay() } }))?.units ?? 0; }
export async function reserveUnits(prisma: P, units: number, label: string): Promise<void> {
  if (!READS.has(label)) { const used = await unitsUsedToday(prisma); if (used + units > DAILY_BUDGET) throw new QuotaBudgetError(); }
  await prisma.youtubeQuotaDay.upsert({ where: { date: pacificDay() }, create: { date: pacificDay(), units }, update: { units: { increment: units } } });
}
```
`apps/admin/src/lib/video-iq/youtube.ts`:
```ts
import { createYouTubeClient, type YouTubeClient } from "@rayalaseema/youtube";
import { reserveUnits } from "./quota";
export const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || "UCFZ-DcNTGQsTBpCmZk1MflA";
export function youtubeConfigured(): boolean { return Boolean(process.env.YOUTUBE_OAUTH_REFRESH_TOKEN && process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET); }
export function getYouTube(prisma: any): YouTubeClient {
  if (!youtubeConfigured()) throw new Error("YouTube credentials not configured (YOUTUBE_OAUTH_REFRESH_TOKEN, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET)");
  return createYouTubeClient({ refreshToken: process.env.YOUTUBE_OAUTH_REFRESH_TOKEN!, clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!, clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    dryRun: process.env.VIDEO_IQ_YOUTUBE_DRY_RUN === "1", onUnits: (u, label) => reserveUnits(prisma, u, label) });
}
```
`apps/admin/src/lib/video-iq/worker.ts`:
```ts
import { classifyFormat, detectPlace, hookCheck, scoreTitle, scoreDescription, scoreTags, scoreThumbnail, scoreFit, overall, peopleIn, PLACES, PEOPLE } from "@rayalaseema/youtube";
import type { Transcript } from "./transcribe";
export type Deps = { prisma: any; media: typeof import("./media"); transcribe: typeof import("./transcribe"); analyze: typeof import("./analyze"); keywords: typeof import("./keywords"); thumbnail: typeof import("./thumbnail"); youtube: any; blob: { uploadBuffer: (b: Buffer, ext: string, contentType: string) => Promise<string>; uploadPrivate: (b: Buffer, name: string) => Promise<string> }; dfs?: any; now?: () => Date };
const PHRASES = [...PLACES.map((p) => p.te), ...PEOPLE.map((p) => p.te), ...PEOPLE.flatMap((p) => p.aliases.filter((a) => /[\u0C00-\u0C7F]/.test(a)))];
const ddmmyyyy = (d: Date) => `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;

async function set(d: Deps, row: any, data: Record<string, unknown>) { Object.assign(row, data); await d.prisma.videoOptimization.update({ where: { id: row.id }, data }); }
async function fail(d: Deps, row: any, error: string) { await set(d, row, { status: "FAILED", error: error.slice(0, 2000), attempts: (row.attempts ?? 0) + 1 }); }

export async function runStage(row: any, d: Deps): Promise<void> {
  try {
    switch (row.status) {
      case "QUEUED": {
        if (row.source === "YOUTUBE") { await set(d, row, { status: "TRANSCRIBING", frames: [{ t: 0, url: `https://i.ytimg.com/vi/${row.videoId}/maxresdefault.jpg` }], error: null }); return; }
        const p = await d.media.probe(row.blobUrl);
        if (p.durationSec > 3600) return fail(d, row, "video longer than 60 minutes");
        const times = [0.1, 0.4, 0.7].map((f) => Math.max(0.5, p.durationSec * f));
        const frames = await d.media.extractFrames(row.blobUrl, times);
        const urls: Array<{ t: number; url: string }> = [];
        for (let i = 0; i < frames.length; i++) urls.push({ t: times[i], url: await d.blob.uploadBuffer(Buffer.from(frames[i]), "jpg", "image/jpeg") });
        await d.prisma.content.update({ where: { id: row.contentId }, data: {} }).catch(() => {});
        await set(d, row, { status: "EXTRACTING", frames: urls, suggestions: { probe: p }, error: null });
        return;
      }
      case "EXTRACTING": {
        const mp3 = await d.media.extractAudioMp3(row.blobUrl);
        const t = await d.transcribe.transcribeAudio(mp3, { phrases: PHRASES });
        await set(d, row, { status: "TRANSCRIBING", transcript: t, error: null });
        return;
      }
      case "TRANSCRIBING": {
        let t: Transcript | null = row.transcript;
        if (!t && row.source === "YOUTUBE") {
          t = await d.transcribe.transcriptFromCaptions(d.youtube, row.videoId);
          if (!t) { await set(d, row, { error: "captions not ready; retrying every 30 minutes", attempts: (row.attempts ?? 0) + 1 }); return; }
          await set(d, row, { transcript: t });
        }
        const content = await d.prisma.content.findUnique({ where: { id: row.contentId }, include: { constituency: { include: { district: true } } } });
        const probe = row.suggestions?.probe ?? { durationSec: t?.durationSec ?? 0 };
        const format = classifyFormat({ durationSec: probe.durationSec, width: probe.width, height: probe.height });
        const playlists = (await d.youtube.listMyPlaylists()).map((p: any) => p.title);
        const place = detectPlace(content.title);
        const s = await d.analyze.analyzeVideo({ format, transcript: t, deskTitle: content.title, deskDescription: content.summary || content.body || "", district: content.constituency?.district?.nameEn ?? place?.district, keywordTerms: [place ? `${place.en.toLowerCase()} news` : "", `${(place?.district ?? "").toLowerCase()} news today`].filter(Boolean), playlists, dateDdMmYyyy: ddmmyyyy((d.now ?? (() => new Date()))()), breaking: Boolean(content.breaking) });
        const keywords = await d.keywords.enrichKeywords(s, { prisma: d.prisma, dfs: d.dfs ?? null });
        const hook = hookCheck(t?.segments ?? [], format === "SHORT");
        await set(d, row, { status: "ANALYZING", suggestions: { ...s, keywords, hook, probe }, error: null });
        return;
      }
      case "ANALYZING": {
        const s = row.suggestions; const frames: Array<{ t: number; url: string }> = row.frames ?? [];
        const thumbs: Array<{ headline: string; frameUrl: string; renderedUrl: string | null; bytes?: number }> = [];
        if (s.format !== "SHORT") for (const f of frames) {
          try { const r = await d.thumbnail.renderThumbnail({ frame: f.url, headline: s.thumbnail.headline_te, breaking: false }); thumbs.push({ headline: s.thumbnail.headline_te, frameUrl: f.url, renderedUrl: await d.blob.uploadBuffer(Buffer.from(r.jpeg), "jpg", "image/jpeg"), bytes: r.jpeg.byteLength }); }
          catch (e) { thumbs.push({ headline: s.thumbnail.headline_te, frameUrl: f.url, renderedUrl: null }); }
        }
        const volumes = new Map<string, number | null>((s.keywords?.terms ?? []).map((k: any) => [k.term, k.volume]));
        const title = Math.max(...s.titles.map((t: any) => scoreTitle(t.text, { entities: s.entities, breaking: false, volumes })));
        const thumbnail = s.format === "SHORT" ? 100 : scoreThumbnail({ headline: s.thumbnail.headline_te, hasFrame: thumbs.some((x) => x.renderedUrl), bytes: thumbs[0]?.bytes, width: 1280, height: 720 });
        const scores = { title, thumbnail, description: scoreDescription(s.description), tags: scoreTags(s.tags), fit: scoreFit(s.fit) };
        await set(d, row, { status: "READY", thumbnails: thumbs, scores: { ...scores, overall: overall(scores) }, error: null });
        return;
      }
      default: return;
    }
  } catch (e) {
    const msg = (e as Error).message || String(e);
    if ((row.attempts ?? 0) + 1 >= 3 || /no audio|longer than|model output invalid/.test(msg)) await fail(d, row, msg);
    else await set(d, row, { error: msg.slice(0, 2000), attempts: (row.attempts ?? 0) + 1 });
  }
}

export async function processQueue(d: Deps, limit = 3): Promise<{ processed: string[] }> {
  const stale = new Date(Date.now() - 90_000);
  const rows = await d.prisma.videoOptimization.findMany({ where: { status: { in: ["QUEUED", "EXTRACTING", "TRANSCRIBING", "ANALYZING"] }, updatedAt: { lt: stale } }, orderBy: { createdAt: "asc" }, take: limit });
  for (const r of rows) await runStage(r, d);
  return { processed: rows.map((r: any) => r.id) };
}
```
`apps/admin/src/app/api/cron/video-iq/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import * as media from "@/lib/video-iq/media"; import * as transcribe from "@/lib/video-iq/transcribe"; import * as analyze from "@/lib/video-iq/analyze";
import * as keywords from "@/lib/video-iq/keywords"; import * as thumbnail from "@/lib/video-iq/thumbnail";
import { getYouTube, youtubeConfigured } from "@/lib/video-iq/youtube"; import { processQueue } from "@/lib/video-iq/worker";
import { uploadBuffer } from "@/lib/blob"; import { createDataForSeo } from "@rayalaseema/youtube";
export const maxDuration = 300;
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dfs = process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD ? createDataForSeo({ login: process.env.DATAFORSEO_LOGIN, password: process.env.DATAFORSEO_PASSWORD }) : null;
  const youtube = youtubeConfigured() ? getYouTube(prisma) : { listMyPlaylists: async () => [], listCaptions: async () => [], downloadCaption: async () => "" };
  const result = await processQueue({ prisma, media, transcribe, analyze, keywords, thumbnail, youtube, dfs, blob: { uploadBuffer: (b, ext, ct) => uploadBuffer(b, ext, ct), uploadPrivate: async (b, name) => uploadBuffer(b, name.split(".").pop() || "bin", "application/octet-stream") } });
  return NextResponse.json(result);
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/admin && bun test __tests__/video-iq/`
Expected: PASS for quota and worker (6 tests), earlier suites still green.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/lib/video-iq/quota.ts apps/admin/src/lib/video-iq/youtube.ts apps/admin/src/lib/video-iq/worker.ts apps/admin/src/app/api/cron/video-iq/route.ts apps/admin/__tests__/video-iq/quota.test.ts apps/admin/__tests__/video-iq/worker.test.ts
git commit -m "feat(video-iq): quota ledger, env YouTube client, stage worker, cron route

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Panel API routes (create, read, choose, approve, override)

**Files:**
- Create: `apps/admin/src/app/api/video-iq/route.ts`, `apps/admin/src/app/api/video-iq/[id]/route.ts`, `apps/admin/src/app/api/video-iq/[id]/approve/route.ts`, `apps/admin/src/app/api/video-iq/[id]/override/route.ts`, `apps/admin/src/lib/video-iq/chosen.ts`
- Test: `apps/admin/__tests__/video-iq/chosen.test.ts`

**Interfaces:**
- Produces: `POST /api/video-iq { contentId }` → creates a QUEUED row from the Content payload (`videoUrl`/`clipUrl` blob → BLOB; YouTube URL or `videoId` → YOUTUBE), returns `{ id }`; `GET /api/video-iq/[id]` → row; `PATCH /api/video-iq/[id] { chosen }` → validates with `chosenSchema` and stores; `POST /api/video-iq/[id]/approve` → requires chosen, fit not `not_fit` unless `chosen.override`, sets APPROVED, creates `SocialPost(YOUTUBE, QUEUED)`; `POST /api/video-iq/[id]/override { note }` (ADMIN) → stores `chosen.override = { note, by, at }`. `chosenSchema` (zod): `{ title: string ≤100 with " | "; thumbnailIndex: number | null; thumbnailUrl: string | null; description: string ≤5000; tags: string[] 5..30; chapters; hashtags; playlists: string[] ≤3; comment: string no URLs; override?: {...} }`; `finalizeChosen(row, chosen, article: { url: string | null; place: Place | null; today: boolean }): Chosen` (appends article link, place line, footer through `buildDescription`).

- [ ] **Step 1: Write failing test**

`apps/admin/__tests__/video-iq/chosen.test.ts`:
```ts
import { describe, test, expect } from "bun:test";
import { chosenSchema, finalizeChosen } from "../../src/lib/video-iq/chosen";
import { PLACES } from "@rayalaseema/youtube";
const base = { title: "రాచమల్లు ఫైర్ | Rachamallu Siva Prasad Reddy Proddatur", thumbnailIndex: 0, thumbnailUrl: "https://blob/t.jpg", description: "హుక్\n\nకథ", tags: ["a", "b", "c", "d", "e"], chapters: [], hashtags: [], playlists: ["Politics"], comment: "మీ అభిప్రాయం?" };
describe("chosen", () => {
  test("accepts a valid choice, rejects URL in comment and missing separator", () => {
    expect(chosenSchema.safeParse(base).success).toBe(true);
    expect(chosenSchema.safeParse({ ...base, comment: "see https://x.y" }).success).toBe(false);
    expect(chosenSchema.safeParse({ ...base, title: "రాచమల్లు ఫైర్" }).success).toBe(false);
  });
  test("finalizeChosen appends link, place line and footer once", () => {
    const c = finalizeChosen({ suggestions: { summary_en: "EN" } } as any, chosenSchema.parse(base), { url: "https://rayalaseemanews.com/videos/x", place: PLACES.find((p) => p.en === "Proddatur")!, today: true });
    expect(c.description).toContain("పూర్తి వార్త: https://rayalaseemanews.com/videos/x"); expect(c.description).toContain("Proddatur News Today"); expect((c.description.match(/sub_confirmation=1/g) ?? []).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/admin && bun test __tests__/video-iq/chosen.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/admin/src/lib/video-iq/chosen.ts`:
```ts
import { z } from "zod";
import { buildDescription, placeLine, splitTitle, type Place } from "@rayalaseema/youtube";
export const SITE = "https://rayalaseemanews.com"; export const SUBSCRIBE = "https://www.youtube.com/@rayalaseemanewstv?sub_confirmation=1";
export const chosenSchema = z.object({
  title: z.string().min(5).max(100).refine((t) => t.includes(" | "), "title needs 'Telugu hook | English headline'"),
  thumbnailIndex: z.number().int().min(0).nullable(), thumbnailUrl: z.string().url().nullable(),
  description: z.string().max(5000), tags: z.array(z.string().max(60)).min(5).max(30),
  chapters: z.array(z.object({ start: z.string(), title_te: z.string() })).max(12), hashtags: z.array(z.string()).max(5),
  playlists: z.array(z.string()).max(3), comment: z.string().max(500).refine((s) => !/https?:\/\//i.test(s), "no URLs"),
  override: z.object({ note: z.string().min(5), by: z.string(), at: z.string() }).optional(),
}).strict();
export type Chosen = z.infer<typeof chosenSchema>;
export function finalizeChosen(row: { suggestions: any }, c: Chosen, a: { url: string | null; place: Place | null; today: boolean }): Chosen {
  const lines = c.description.split("\n"); const hook = lines[0] ?? splitTitle(c.title).hook; const story = lines.slice(1).join("\n").replace(/పూర్తి వార్త:.*|రాయలసీమ న్యూస్ \| Rayalaseema News|🌐 .*|సబ్‌స్క్రైబ్ చేయండి:.*/g, "").trim();
  const chapters = c.chapters.length ? c.chapters.map((ch) => `${ch.start} ${ch.title_te}`).join("\n") : "";
  const description = buildDescription({ hook, enLine: row.suggestions?.summary_en, articleUrl: a.url, placeLine: placeLine(a.place, a.today), story: [story, chapters].filter(Boolean).join("\n\n"), hashtags: c.hashtags, site: SITE, subscribeUrl: SUBSCRIBE });
  return { ...c, description };
}
```
Routes (all use `requireAuth`, `isAuthError`, `apiError` from `@/lib/api-utils`):

`apps/admin/src/app/api/video-iq/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
const yt = (u: string) => u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1] ?? null;
export async function POST(req: NextRequest) {
  const auth = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR"]); if (isAuthError(auth)) return auth;
  try {
    const { contentId } = await req.json();
    const c = await prisma.content.findUnique({ where: { id: contentId }, select: { id: true, type: true, payload: true } });
    if (!c || (c.type !== "VIDEO" && c.type !== "REEL")) return NextResponse.json({ error: "content is not a video" }, { status: 400 });
    const p = (c.payload ?? {}) as any; const url: string = p.videoUrl || p.clipUrl || "";
    const videoId: string | null = p.videoId || yt(url);
    const source = videoId ? "YOUTUBE" : "BLOB";
    if (source === "BLOB" && !/blob\.core\.windows\.net/.test(url)) return NextResponse.json({ error: "video must be on blob storage or YouTube" }, { status: 400 });
    const row = await prisma.videoOptimization.create({ data: { contentId, source, blobUrl: source === "BLOB" ? url : null, videoId, createdById: auth.user.id } });
    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (e) { return apiError(e); }
}
```
`apps/admin/src/app/api/video-iq/[id]/route.ts`: `GET` returns `prisma.videoOptimization.findUnique({ where: { id } })` (404 if missing); `PATCH` parses body with `chosenSchema.safeParse`, 400 with issues on failure, otherwise `update({ data: { chosen } })` and returns the row. `POST .../approve/route.ts`: loads the row; 409 unless status READY/APPROVED; 400 if `!row.chosen`; 403 if `row.suggestions.fit.verdict === "not_fit"` and no `chosen.override`; then `update({ status: "APPROVED" })`, `prisma.socialPost.upsert({ where: { contentId_platform: { contentId: row.contentId, platform: "YOUTUBE" } }, create: { contentId: row.contentId, platform: "YOUTUBE", status: "QUEUED" }, update: { status: "QUEUED", error: null } })`, `logAudit({ ... action: "video_iq.approve" ... })`, return row. `POST .../override/route.ts`: `requireAuth(["ADMIN"])`, body `{ note }`, merges `chosen.override = { note, by: auth.user.id, at: new Date().toISOString() }`.

- [ ] **Step 4: Run tests and a manual smoke**

Run: `cd apps/admin && bun test __tests__/video-iq/chosen.test.ts` → PASS. Start `bun run dev` and `curl -X POST localhost:3001/api/video-iq -H 'content-type: application/json' -d '{"contentId":"<a VIDEO content id>"}' --cookie "<session>"` → 201 `{id}`.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/api/video-iq apps/admin/src/lib/video-iq/chosen.ts apps/admin/__tests__/video-iq/chosen.test.ts
git commit -m "feat(video-iq): panel API routes for create, read, choose, approve, override

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Publish flow (server) and the publish route

**Files:**
- Create: `apps/admin/src/lib/video-iq/publish.ts`, `apps/admin/src/app/api/video-iq/[id]/publish/route.ts`
- Test: `apps/admin/__tests__/video-iq/publish.test.ts`

**Interfaces:**
- Produces: `publishOptimization(id: string, deps: { prisma; youtube: YouTubeClient; fetchBlob: (url: string) => Promise<{ bytes: Uint8Array; size: number }>; sitemapUrlFor: (videoId: string | null, slug: string | null) => Promise<string | null>; now?: () => Date }): Promise<{ videoId: string; warnings: string[] }>`; route `POST /api/video-iq/[id]/publish` (EDITOR+) → `{ videoId, url, warnings }`.

- [ ] **Step 1: Write failing tests**

`apps/admin/__tests__/video-iq/publish.test.ts`:
```ts
import { describe, test, expect } from "bun:test";
import { publishOptimization } from "../../src/lib/video-iq/publish";
import { YouTubeQuotaError } from "@rayalaseema/youtube";
import { SAMPLE } from "../../../../packages/youtube/__tests__/contract.test";

function world(over: Partial<any> = {}) {
  const row: any = { id: "r1", contentId: "c1", source: "BLOB", blobUrl: "https://blob/x.mp4", videoId: null, status: "APPROVED", suggestions: SAMPLE, thumbnails: [{ renderedUrl: "https://blob/t.jpg" }],
    chosen: { title: "రాచమల్లు ఫైర్ | Rachamallu Siva Prasad Reddy Proddatur", thumbnailIndex: 0, thumbnailUrl: "https://blob/t.jpg", description: "d", tags: ["a", "b", "c", "d", "e"], chapters: [], hashtags: [], playlists: ["Politics"], comment: "మీ అభిప్రాయం?" } };
  const calls: string[] = [];
  const content: any = { id: "c1", slug: "s", status: "PUBLISHED", scheduledAt: null, payload: {} };
  const prisma = { videoOptimization: { findUnique: async () => row, update: async ({ data }: any) => { Object.assign(row, data); return row; } }, content: { findUnique: async () => content, update: async ({ data }: any) => { Object.assign(content, data); return content; } }, socialPost: { upsert: async ({ create, update }: any) => { calls.push(`social:${(update ?? create).status}`); return {}; } } };
  const youtube = { uploadVideo: async () => { calls.push("insert"); return "VID12345678"; }, setThumbnail: async () => { calls.push("thumb"); }, listMyPlaylists: async () => [{ id: "PL1", title: "Politics" }], addToPlaylist: async (p: string) => { calls.push(`pl:${p}`); }, setLocalizations: async () => { calls.push("loc"); }, updateSnippetStatus: async () => { calls.push("update"); }, insertComment: async () => { calls.push("comment"); } };
  return { row, content, calls, prisma, youtube: { ...youtube, ...over.youtube }, fetchBlob: async () => ({ bytes: new Uint8Array([1]), size: 1 }), sitemapUrlFor: async () => null, ...over };
}
describe("publishOptimization", () => {
  test("BLOB: inserts, thumbnail, playlist, localisation, comment; writes payload and SocialPost", async () => {
    const w = world();
    const r = await publishOptimization("r1", w as any);
    expect(r.videoId).toBe("VID12345678"); expect(w.calls).toEqual(["insert", "thumb", "pl:PL1", "loc", "comment", "social:POSTED"]);
    expect(w.content.payload.videoId).toBe("VID12345678"); expect(w.content.payload.thumbnailUrl).toBe("https://blob/t.jpg"); expect(w.row.status).toBe("APPLIED");
  });
  test("quota error after insert keeps videoId, warns, never re-uploads", async () => {
    const w = world({ youtube: { setThumbnail: async () => { throw new YouTubeQuotaError(); } } });
    const r = await publishOptimization("r1", w as any);
    expect(r.videoId).toBe("VID12345678"); expect(r.warnings.join()).toMatch(/quota/); expect(w.row.status).toBe("APPLIED"); expect(w.row.videoId).toBe("VID12345678");
    expect(w.calls.filter((c) => c === "insert").length).toBe(1);
  });
  test("YOUTUBE source updates snippet instead of inserting", async () => {
    const w = world(); w.row.source = "YOUTUBE"; w.row.videoId = "OLD12345678"; w.row.blobUrl = null;
    await publishOptimization("r1", w as any);
    expect(w.calls[0]).toBe("update"); expect(w.calls).not.toContain("insert");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/admin && bun test __tests__/video-iq/publish.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`apps/admin/src/lib/video-iq/publish.ts`:
```ts
import { YouTubeQuotaError, detectPlace, type YouTubeClient, type VideoSnippet, type VideoStatus } from "@rayalaseema/youtube";
import { finalizeChosen, chosenSchema, SITE } from "./chosen";
type Deps = { prisma: any; youtube: YouTubeClient; fetchBlob: (url: string) => Promise<{ bytes: Uint8Array; size: number }>; sitemapUrlFor: (videoId: string | null, slug: string | null) => Promise<string | null>; now?: () => Date };

export async function publishOptimization(id: string, d: Deps): Promise<{ videoId: string; warnings: string[] }> {
  const row = await d.prisma.videoOptimization.findUnique({ where: { id } });
  if (!row || row.status !== "APPROVED") throw new Error("row is not APPROVED");
  const content = await d.prisma.content.findUnique({ where: { id: row.contentId } });
  const chosen0 = chosenSchema.parse(row.chosen);
  const url = (await d.sitemapUrlFor(row.videoId, content.slug)) ?? (content.slug && content.status === "PUBLISHED" ? `${SITE}/videos/${content.slug}` : null);
  const today = row.source === "BLOB";
  const chosen = finalizeChosen(row, chosen0, { url, place: detectPlace(chosen0.title), today });
  const snippet: VideoSnippet = { title: chosen.title, description: chosen.description, tags: chosen.tags, categoryId: "25", defaultLanguage: "te", defaultAudioLanguage: "te" };
  const status: VideoStatus = content.status === "SCHEDULED" && content.scheduledAt ? { privacyStatus: "private", publishAt: new Date(content.scheduledAt).toISOString(), selfDeclaredMadeForKids: false, embeddable: true, license: "youtube" } : { privacyStatus: content.status === "PUBLISHED" ? "public" : "private", selfDeclaredMadeForKids: false, embeddable: true, license: "youtube" };
  const warnings: string[] = []; const applied: Record<string, unknown> = { at: (d.now ?? (() => new Date()))().toISOString(), title: chosen.title };
  await d.prisma.videoOptimization.update({ where: { id }, data: { status: "PUBLISHING", error: null } });

  let videoId = row.videoId as string | null;
  const place = detectPlace(chosen.title);
  if (row.source === "BLOB") {
    const file = await d.fetchBlob(row.blobUrl);
    videoId = await d.youtube.uploadVideo({ bytes: file.bytes, sizeBytes: file.size, snippet, status });
    await d.prisma.videoOptimization.update({ where: { id }, data: { videoId } }); // saved before anything else can fail
    applied.inserted = true;
  } else {
    await d.youtube.updateSnippetStatus(videoId!, snippet, status, place ? { locationDescription: place.en } : undefined);
    applied.updated = true;
  }
  const step = async (label: string, fn: () => Promise<void>) => { try { await fn(); applied[label] = true; } catch (e) { warnings.push(`${label}: ${e instanceof YouTubeQuotaError ? "quota exhausted, retry tomorrow" : (e as Error).message.slice(0, 200)}`); } };
  await step("thumbnail", async () => { if (row.suggestions.format !== "SHORT" && chosen.thumbnailUrl) { const t = await d.fetchBlob(chosen.thumbnailUrl); await d.youtube.setThumbnail(videoId!, t.bytes); } });
  await step("playlists", async () => { const mine = await d.youtube.listMyPlaylists(); for (const name of chosen.playlists.slice(0, 2)) { const pl = mine.find((p) => p.title === name); if (pl) await d.youtube.addToPlaylist(pl.id, videoId!); } });
  await step("localizations", async () => { await d.youtube.setLocalizations(videoId!, { en: { title: chosen.title, description: [row.suggestions.summary_en, `🌐 ${SITE}`].join("\n") } }); });
  await step("comment", async () => { if (chosen.comment) await d.youtube.insertComment(videoId!, chosen.comment); });

  const payload = { ...(content.payload ?? {}), videoId, thumbnailUrl: chosen.thumbnailUrl ?? content.payload?.thumbnailUrl, transcript: row.transcript?.segments?.map((s: any) => s.text).join(" ") ?? content.payload?.transcript, ...(row.source === "BLOB" ? { videoUrl: `https://www.youtube.com/watch?v=${videoId}` } : {}) };
  await d.prisma.content.update({ where: { id: row.contentId }, data: { payload } });
  await d.prisma.socialPost.upsert({ where: { contentId_platform: { contentId: row.contentId, platform: "YOUTUBE" } }, create: { contentId: row.contentId, platform: "YOUTUBE", status: "POSTED", postUrl: `https://www.youtube.com/watch?v=${videoId}`, postedAt: new Date() }, update: { status: "POSTED", postUrl: `https://www.youtube.com/watch?v=${videoId}`, postedAt: new Date(), error: null } });
  await d.prisma.videoOptimization.update({ where: { id }, data: { status: "APPLIED", videoId, applied: { ...applied, warnings }, error: warnings.length ? warnings.join(" | ") : null } });
  return { videoId: videoId!, warnings };
}
```
`apps/admin/src/app/api/video-iq/[id]/publish/route.ts`: `requireAuth(["ADMIN", "EDITOR"])`; builds deps with `getYouTube(prisma)`, `fetchBlob = async (u) => { const r = await fetch(u); const b = new Uint8Array(await r.arrayBuffer()); return { bytes: b, size: b.byteLength }; }`, `sitemapUrlFor` = the sitemap lookup ported from `scripts/google/yt-video-fix.ts` (`articleUrlFromSitemap`), calls `publishOptimization`, catches `QuotaBudgetError` → 429 with the message and resets status to APPROVED, other errors → status FAILED with message, 500. Logs `logAudit({ action: "video_iq.publish", ... })`. Returns `{ videoId, url: https://www.youtube.com/watch?v=<id>, warnings }`.

- [ ] **Step 4: Run tests**

Run: `cd apps/admin && bun test __tests__/video-iq/publish.test.ts` → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/lib/video-iq/publish.ts apps/admin/src/app/api/video-iq/[id]/publish/route.ts apps/admin/__tests__/video-iq/publish.test.ts
git commit -m "feat(video-iq): publish to YouTube with thumbnail, playlists, localisation, comment; SocialPost + payload writeback

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Video IQ panel UI in the Content editor

**Files:**
- Create: `apps/admin/src/components/video-iq/panel.tsx`, `apps/admin/src/components/video-iq/score-pill.tsx`, `apps/admin/src/components/video-iq/use-optimization.ts`
- Modify: `apps/admin/src/components/content-payload-editor.tsx:40-90` (render `<VideoIqPanel contentId={contentId} />` under the VIDEO and REEL subforms when `contentId` exists)
- Test: `apps/admin/__tests__/video-iq/panel-logic.test.ts` (pure helpers only: `defaultChosen(row)` and `canPublish(row, role)`)

**Interfaces:**
- Produces: `VideoIqPanel({ contentId })` React client component; `defaultChosen(row): Chosen` (title = titles[0], thumbnailIndex = first rendered, description = suggestions.description, tags, chapters, hashtags, playlists top 2, comment = pinned_comment); `canPublish(row, role): { ok: boolean; reason?: string }`.

- [ ] **Step 1: Write failing test**

`apps/admin/__tests__/video-iq/panel-logic.test.ts`:
```ts
import { describe, test, expect } from "bun:test";
import { defaultChosen, canPublish } from "../../src/components/video-iq/use-optimization";
import { SAMPLE } from "../../../../packages/youtube/__tests__/contract.test";
const row: any = { status: "READY", suggestions: SAMPLE, thumbnails: [{ renderedUrl: null }, { renderedUrl: "https://blob/t2.jpg" }], chosen: null };
describe("panel logic", () => {
  test("defaultChosen picks title 1, first rendered thumbnail, top 2 playlists", () => {
    const c = defaultChosen(row);
    expect(c.title).toBe(SAMPLE.titles[0].text); expect(c.thumbnailIndex).toBe(1); expect(c.thumbnailUrl).toBe("https://blob/t2.jpg"); expect(c.playlists).toEqual(["Politics", "District Stories"]); expect(c.comment).toBe(SAMPLE.pinned_comment);
  });
  test("canPublish blocks not_fit without override and non-editors", () => {
    expect(canPublish({ ...row, status: "APPROVED", chosen: defaultChosen(row) }, "EDITOR").ok).toBe(true);
    expect(canPublish({ ...row, status: "APPROVED", chosen: defaultChosen(row), suggestions: { ...SAMPLE, fit: { ...SAMPLE.fit, verdict: "not_fit" } } }, "EDITOR").reason).toMatch(/not a fit/);
    expect(canPublish({ ...row, status: "APPROVED", chosen: defaultChosen(row) }, "SUB_EDITOR").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL.

- [ ] **Step 3: Implement**

`apps/admin/src/components/video-iq/use-optimization.ts`:
```ts
"use client";
import { useCallback, useEffect, useState } from "react";
export function defaultChosen(row: any) {
  const s = row.suggestions; const ti = (row.thumbnails ?? []).findIndex((t: any) => t.renderedUrl);
  return { title: s.titles[0].text, thumbnailIndex: ti >= 0 ? ti : null, thumbnailUrl: ti >= 0 ? row.thumbnails[ti].renderedUrl : null, description: s.description, tags: s.tags, chapters: s.chapters, hashtags: s.hashtags, playlists: (s.playlists ?? []).slice(0, 2), comment: s.pinned_comment };
}
export function canPublish(row: any, role: string): { ok: boolean; reason?: string } {
  if (!["ADMIN", "EDITOR"].includes(role)) return { ok: false, reason: "editor or admin only" };
  if (row.status !== "APPROVED") return { ok: false, reason: "approve first" };
  if (row.suggestions?.fit?.verdict === "not_fit" && !row.chosen?.override) return { ok: false, reason: "not a fit for this channel; admin override needed" };
  return { ok: true };
}
export function useOptimization(contentId: string) {
  const [row, setRow] = useState<any>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const load = useCallback(async () => { const r = await fetch(`/api/video-iq?contentId=${contentId}`); if (r.ok) setRow(await r.json()); }, [contentId]);
  useEffect(() => { load(); const t = setInterval(() => { if (row && !["READY", "APPROVED", "APPLIED", "FAILED"].includes(row.status)) load(); }, 10_000); return () => clearInterval(t); }, [load, row?.status]);
  const call = async (path: string, init?: RequestInit) => { setBusy(true); setErr(""); try { const r = await fetch(path, { headers: { "content-type": "application/json" }, ...init }); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); await load(); return j; } catch (e) { setErr((e as Error).message); throw e; } finally { setBusy(false); } };
  return { row, busy, err, reload: load,
    optimize: () => call("/api/video-iq", { method: "POST", body: JSON.stringify({ contentId }) }),
    save: (chosen: unknown) => call(`/api/video-iq/${row.id}`, { method: "PATCH", body: JSON.stringify({ chosen }) }),
    approve: () => call(`/api/video-iq/${row.id}/approve`, { method: "POST" }),
    override: (note: string) => call(`/api/video-iq/${row.id}/override`, { method: "POST", body: JSON.stringify({ note }) }),
    publish: () => call(`/api/video-iq/${row.id}/publish`, { method: "POST" }) };
}
```
Add `GET /api/video-iq?contentId=` to `apps/admin/src/app/api/video-iq/route.ts`: returns the latest row for the content (`findFirst orderBy createdAt desc`), 204 when none.

`apps/admin/src/components/video-iq/panel.tsx`: a client component with the tabs from spec 4.6. Layout rules: header row with `ScorePill` for overall and a status badge; buttons Optimize / Re-run / Save / Approve / Publish wired to the hook; tabs Title, Thumbnail, SEO, Review, Publish. Title tab: three radio cards (text, why, per-title score computed client side with `scoreTitle` from the package, volume chips for English terms from `suggestions.keywords.terms`), editable text input with live `titleLength`. Thumbnail tab: grid of `thumbnails[]` (rendered or frame), radio select, file upload input that POSTs to `/api/upload/image` (existing image upload route used by `ImageUpload`) and sets `thumbnailUrl`. SEO tab: description textarea, tags chips editor, chapters list editor, hashtags, playlists checkboxes (from `suggestions.playlists`, max 3), comment textarea, Keyword ideas list (`keywords.suggested`, buttons "add tag" and "use in title" which replaces the English half via `joinTitle(splitTitle(title).hook, term)`), Who ranks today table (`keywords.serp`), and the `unavailable` note when present. Review tab: transcript lines with `mm:ss`, entities chips, hook check banner (`hook.late` → amber with "news starts at mm:ss"), fit card (verdict colour, reason_te, local_relevance, reused_content_risk), admin override form when verdict is not_fit. Publish tab: summary of what will be written (title, description preview, tags count, playlists, comment), quota estimate (1,900 for BLOB, 250 for YOUTUBE), warnings from `applied.warnings` after publish, link to the watch page when APPLIED. Use the project's existing `toast.tsx` for feedback and `confirm-dialog.tsx` before Publish. Role comes from `useSession()` (`next-auth/react`) as in `sidebar.tsx`.

`apps/admin/src/components/video-iq/score-pill.tsx`: `ScorePill({ value, label })` renders a rounded pill coloured green ≥ 80, amber ≥ 60, red below.

In `content-payload-editor.tsx`, inside the VIDEO and REEL branches after the existing fields: `{contentId && <VideoIqPanel contentId={contentId} />}` (the component already receives `contentId` for `VideoUpload`; confirm the prop name there and thread it through).

- [ ] **Step 4: Run the test and a manual check**

Run: `cd apps/admin && bun test __tests__/video-iq/panel-logic.test.ts` → PASS. `bun run dev`, open a VIDEO content item, click Optimize, call the cron route by hand four times (`curl -X POST -H "Authorization: Bearer $CRON_SECRET" localhost:3001/api/cron/video-iq`), watch the panel reach READY with three titles, scores and thumbnails.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/components/video-iq apps/admin/src/components/content-payload-editor.tsx apps/admin/src/app/api/video-iq/route.ts apps/admin/__tests__/video-iq/panel-logic.test.ts
git commit -m "feat(video-iq): editor panel with title, thumbnail, SEO, review and publish tabs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Transcript on the website video page and in VideoObject JSON-LD

**Files:**
- Modify: `packages/seo-schema/src/video-object.ts` (add optional `transcript` input → `"transcript"` property, trimmed to 5,000 chars), `apps/web/src/lib/video-queries.ts:106-146` (return `transcript` from payload), `apps/web/src/app/videos/[slug]/page.tsx` (collapsible transcript section under the player; pass `transcript` to `buildVideoObjectSchema`)
- Test: `packages/seo-schema/__tests__/video-object.test.ts` (extend or create)

**Interfaces:**
- Consumes: `Content.payload.transcript` (Task 3).
- Produces: `buildVideoObjectSchema({ ..., transcript?: string | null })`; `getVideoBySlug()` result gains `transcript: string | null`.

- [ ] **Step 1: Write failing test**

Append to (or create) `packages/seo-schema/__tests__/video-object.test.ts`:
```ts
import { describe, test, expect } from "bun:test";
import { buildVideoObjectSchema } from "../src/video-object";
const base = { title: "t", description: "d", videoId: "abcdefghijk", publishedAt: "2026-10-20T00:00:00Z", pageUrl: "https://rayalaseemanews.com/videos/x", publisher: { name: "Rayalaseema News", logoUrl: "https://rayalaseemanews.com/logo.png", siteUrl: "https://rayalaseemanews.com" } };
describe("VideoObject transcript", () => {
  test("includes transcript when given, trimmed to 5000 chars", () => {
    const s = buildVideoObjectSchema({ ...base, transcript: "అ".repeat(6000) }) as any;
    expect(s.transcript.length).toBe(5000);
  });
  test("omits transcript when empty", () => { expect("transcript" in (buildVideoObjectSchema({ ...base, transcript: "" }) as any)).toBe(false); });
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL (transcript not emitted).

- [ ] **Step 3: Implement**

In `video-object.ts` add `transcript?: string | null` to `VideoObjectInput` and, after `contentUrl`, `...(input.transcript?.trim() ? { transcript: input.transcript.replace(/\s+/g, " ").trim().slice(0, 5000) } : {})`. In `video-queries.ts` `getVideoBySlug`, return `transcript: typeof p.transcript === "string" ? p.transcript : null`. In the page, pass `transcript: video.transcript` into `buildVideoObjectSchema` and render after the player:
```tsx
{video.transcript && (
  <details className="mt-6 rounded-lg border border-neutral-200 p-4">
    <summary className="cursor-pointer font-semibold">వీడియో ట్రాన్స్‌క్రిప్ట్ (Transcript)</summary>
    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-800">{video.transcript}</p>
  </details>
)}
```

- [ ] **Step 4: Run tests and check in the browser**

Run: `cd packages/seo-schema && bun test __tests__/` → PASS. Set a `transcript` on a local VIDEO row's payload, open its page on `localhost:3000`, confirm the details element renders Telugu correctly (font check per the house rule) and the JSON-LD contains `transcript`.

- [ ] **Step 5: Commit**

```bash
git add packages/seo-schema/src/video-object.ts packages/seo-schema/__tests__/video-object.test.ts apps/web/src/lib/video-queries.ts "apps/web/src/app/videos/[slug]/page.tsx"
git commit -m "feat(web): transcript on video pages and in VideoObject JSON-LD

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: Trending desk: RSS parser, poller, velocity, outlier, clustering, cron route

**Files:**
- Create: `packages/youtube/src/rss.ts`, `packages/youtube/src/trending.ts`, `apps/admin/src/lib/video-iq/trending.ts`, `apps/admin/src/app/api/cron/trending-poll/route.ts`, `packages/db/prisma/seed-competitors.ts`
- Modify: `packages/youtube/src/index.ts`
- Test: `packages/youtube/__tests__/rss.test.ts`, `packages/youtube/__tests__/trending.test.ts`

**Interfaces:**
- Produces: `parseYouTubeRss(xml: string): Array<{ videoId: string; title: string; publishedAt: string; views: number }>`; `velocity(views: number, publishedAt: Date, now: Date): number` (views per hour, min age 0.25 h); `outlier(views: number, ageHours: number, history: Array<{ views: number; ageHours: number }>): number` (views ÷ median views of history items within ±50% age; 1 when no history); `topicKey(title: string): string` (lower-cased, people and places canonical, top 3 content tokens sorted); `pollCompetitors(deps: { prisma; fetchImpl?; youtube; now?: () => Date }): Promise<{ channels: number; newVideos: number }>`; `breakouts(prisma, now): Promise<Array<{ topicKey: string; channels: number; towns: string[]; sample: string }>>`; cron route `POST /api/cron/trending-poll`.

- [ ] **Step 1: Write failing tests**

`packages/youtube/__tests__/rss.test.ts`:
```ts
import { describe, test, expect } from "bun:test";
import { parseYouTubeRss } from "../src/rss";
const XML = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
<entry><yt:videoId>abcdefghijk</yt:videoId><title>రాచమల్లు ఫైర్ | Rachamallu</title><published>2026-10-20T07:30:00+00:00</published><media:group><media:community><media:statistics views="108888"/></media:community></media:group></entry>
<entry><yt:videoId>zzzzzzzzzzz</yt:videoId><title>No stats here</title><published>2026-10-20T08:00:00+00:00</published><media:group></media:group></entry>
</feed>`;
describe("parseYouTubeRss", () => {
  test("maps entries with and without statistics", () => {
    expect(parseYouTubeRss(XML)).toEqual([{ videoId: "abcdefghijk", title: "రాచమల్లు ఫైర్ | Rachamallu", publishedAt: "2026-10-20T07:30:00+00:00", views: 108888 }, { videoId: "zzzzzzzzzzz", title: "No stats here", publishedAt: "2026-10-20T08:00:00+00:00", views: 0 }]);
  });
});
```
`packages/youtube/__tests__/trending.test.ts`:
```ts
import { describe, test, expect } from "bun:test";
import { velocity, outlier, topicKey } from "../src/trending";
describe("trending math", () => {
  test("velocity is views per hour with a 15 minute floor", () => {
    expect(velocity(1200, new Date("2026-10-20T00:00:00Z"), new Date("2026-10-20T02:00:00Z"))).toBe(600);
    expect(velocity(100, new Date("2026-10-20T00:00:00Z"), new Date("2026-10-20T00:01:00Z"))).toBe(400);
  });
  test("outlier compares to median of similar-age history, 1 with none", () => {
    expect(outlier(5000, 10, [{ views: 1000, ageHours: 9 }, { views: 1200, ageHours: 11 }, { views: 800, ageHours: 30 }])).toBe(5000 / 1100);
    expect(outlier(5000, 10, [])).toBe(1);
  });
  test("topicKey canonicalises names and clusters same story", () => {
    expect(topicKey("రాచమల్లు స్ట్రాంగ్ వార్నింగ్ | Rachamallu Shiva Prasad Reddy Proddatur")).toBe(topicKey("Rachamallu Siva Prasad Reddy warning Proddatur TDP"));
  });
});
```

- [ ] **Step 2: Run to verify they fail** → FAIL.

- [ ] **Step 3: Implement**

`packages/youtube/src/rss.ts`:
```ts
export type RssVideo = { videoId: string; title: string; publishedAt: string; views: number };
const grab = (block: string, re: RegExp) => block.match(re)?.[1] ?? "";
export function parseYouTubeRss(xml: string): RssVideo[] {
  return xml.split("<entry>").slice(1).map((e) => ({
    videoId: grab(e, /<yt:videoId>([^<]+)<\/yt:videoId>/),
    title: grab(e, /<title>([\s\S]*?)<\/title>/).replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").trim(),
    publishedAt: grab(e, /<published>([^<]+)<\/published>/),
    views: Number(grab(e, /<media:statistics views="(\d+)"/) || 0),
  })).filter((v) => v.videoId);
}
```
`packages/youtube/src/trending.ts`:
```ts
import { canonicalizeNames, PEOPLE } from "./people";
import { PLACES } from "./places";
export function velocity(views: number, publishedAt: Date, now: Date): number {
  const h = Math.max(0.25, (now.getTime() - publishedAt.getTime()) / 36e5); return Math.round(views / h);
}
export function outlier(views: number, ageHours: number, history: Array<{ views: number; ageHours: number }>): number {
  const sim = history.filter((h) => h.ageHours >= ageHours * 0.5 && h.ageHours <= ageHours * 1.5).map((h) => h.views).sort((a, b) => a - b);
  if (!sim.length) return 1; const med = sim[Math.floor(sim.length / 2)]; return med ? views / med : 1;
}
const STOP = new Set(["news", "live", "today", "breaking", "latest", "telugu", "tv", "updates", "update", "video", "the", "on", "in", "of", "to", "and", "vs", "at", "with", "for", "by", "ap", "big", "strong", "warning", "sensational", "comments", "fire"]);
export function topicKey(title: string): string {
  let t = canonicalizeNames(title);
  for (const p of PEOPLE) { if (t.includes(p.te)) t += ` ${p.en}`; }
  for (const p of PLACES) { if (t.includes(p.te)) t += ` ${p.en}`; }
  const toks = t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  const names = [...PEOPLE.map((p) => p.en.toLowerCase()), ...PLACES.map((p) => p.en.toLowerCase())].filter((n) => t.toLowerCase().includes(n));
  const key = [...new Set([...names, ...toks])].sort().slice(0, 3);
  return key.join("+");
}
```
Add `export * from "./rss"; export * from "./trending";` to `index.ts`.

`apps/admin/src/lib/video-iq/trending.ts`:
```ts
import { parseYouTubeRss, velocity, outlier, topicKey, townsIn, classifyFormat } from "@rayalaseema/youtube";
type Deps = { prisma: any; fetchImpl?: typeof fetch; youtube: { getVideos: (ids: string[]) => Promise<{ items: any[] }> } | null; now?: () => Date };
const secs = (iso: string) => { const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) || []; return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)); };

export async function pollCompetitors(d: Deps): Promise<{ channels: number; newVideos: number }> {
  const now = (d.now ?? (() => new Date()))(); const f = d.fetchImpl ?? fetch;
  const channels = await d.prisma.competitorChannel.findMany({ where: { active: true } });
  let newVideos = 0; const fresh: Array<{ id: string; channelId: string }> = [];
  for (const ch of channels) {
    const res = await f(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.channelId}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!res || !res.ok) continue;
    for (const v of parseYouTubeRss(await res.text())) {
      const publishedAt = new Date(v.publishedAt); const ageHours = (now.getTime() - publishedAt.getTime()) / 36e5;
      const history = (await d.prisma.competitorVideo.findMany({ where: { channelId: ch.channelId, publishedAt: { gte: new Date(now.getTime() - 30 * 86400_000) } }, select: { views: true, publishedAt: true } })).map((h: any) => ({ views: h.views, ageHours: (now.getTime() - new Date(h.publishedAt).getTime()) / 36e5 }));
      const existing = await d.prisma.competitorVideo.findUnique({ where: { videoId: v.videoId } });
      const snapshots = [...(existing?.viewSnapshots ?? []), { at: now.toISOString(), views: v.views }].slice(-48);
      const data = { channelId: ch.channelId, title: v.title, publishedAt, views: v.views, viewSnapshots: snapshots, velocity: velocity(v.views, publishedAt, now), outlier: outlier(v.views, ageHours, history), towns: townsIn(v.title).map((p) => p.en), topicKey: topicKey(v.title), fetchedAt: now };
      await d.prisma.competitorVideo.upsert({ where: { videoId: v.videoId }, create: { videoId: v.videoId, ...data }, update: data });
      if (!existing) { newVideos++; fresh.push({ id: v.videoId, channelId: ch.channelId }); }
    }
  }
  if (d.youtube && fresh.length) for (let i = 0; i < fresh.length; i += 50) {
    const { items } = await d.youtube.getVideos(fresh.slice(i, i + 50).map((x) => x.id));
    for (const it of items) { const dur = secs(it.contentDetails.duration); const t = it.snippet.thumbnails?.maxres ?? it.snippet.thumbnails?.high; await d.prisma.competitorVideo.update({ where: { videoId: it.id }, data: { durationSec: dur, isShort: classifyFormat({ durationSec: dur, width: t?.width, height: t?.height }) === "SHORT", views: Number(it.statistics?.viewCount ?? 0) } }); }
  }
  return { channels: channels.length, newVideos };
}
export async function breakouts(prisma: any, now = new Date()) {
  const since = new Date(now.getTime() - 3600_000);
  const rows = await prisma.competitorVideo.findMany({ where: { publishedAt: { gte: since } }, select: { topicKey: true, channelId: true, towns: true, title: true, outlier: true } });
  const byTopic = new Map<string, any[]>(); for (const r of rows) if (r.topicKey) byTopic.set(r.topicKey, [...(byTopic.get(r.topicKey) ?? []), r]);
  const out = [];
  for (const [topicKey, vids] of byTopic) { const channels = new Set(vids.map((v) => v.channelId)).size; const towns = [...new Set(vids.flatMap((v) => v.towns))]; if ((channels >= 3 && towns.length) || vids.some((v) => v.outlier >= 10 && v.towns.length)) out.push({ topicKey, channels, towns, sample: vids[0].title }); }
  return out;
}
```
`apps/admin/src/app/api/cron/trending-poll/route.ts`: same auth as the other cron route; calls `pollCompetitors({ prisma, youtube: youtubeConfigured() ? getYouTube(prisma) : null })` then `breakouts(prisma)`; returns `{ channels, newVideos, breakouts }`.

`packages/db/prisma/seed-competitors.ts`: upserts the twenty `CompetitorChannel` rows by channel id. Resolve ids once with `channels?forHandle=` using `scripts/google/user-oauth.ts` (`ytApi`) and hard-code the results in the seed: handles `@sakshitv`, `@SakshiTVLive`, `@SakshiTVPolitics`, `@tv9telugulive`, `@NtvTelugu`, `@ABNTeluguTV`, `@etvandhrapradesh`, `@tv5news`, `@hmtvnews`, `@10TVNewsTelugu`, `@MahaaNews`, `@CVRNewsOfficial`, `@BigTVTelugu`, `@iNewsTelugu`, `@Prime9News`, `@99TVTelugu`, `@SumanTVNews`, `@DialNews`, `@ItsUTVNews`, `@pennerunews` (verify each resolves; replace any that does not with the channel id found through `search?type=channel`). Add a root script entry `"db:seed:competitors": "bun packages/db/prisma/seed-competitors.ts"`.

- [ ] **Step 4: Run tests and a live poll**

Run: `cd packages/youtube && bun test __tests__/` → PASS. Run the seed, then `curl -X POST -H "Authorization: Bearer $CRON_SECRET" localhost:3001/api/cron/trending-poll` → `{ channels: 20, newVideos: >0 }`.

- [ ] **Step 5: Commit**

```bash
git add packages/youtube apps/admin/src/lib/video-iq/trending.ts apps/admin/src/app/api/cron/trending-poll/route.ts packages/db/prisma/seed-competitors.ts package.json
git commit -m "feat(trending): competitor RSS poller with velocity, outlier, topic clustering, breakout detection

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: Trending desk screen, Create story, dashboard breakout flag

**Files:**
- Create: `apps/admin/src/app/(dashboard)/trending/page.tsx`, `apps/admin/src/components/trending/trending-table.tsx`, `apps/admin/src/app/api/trending/route.ts`, `apps/admin/src/app/api/trending/create-story/route.ts`, `apps/admin/src/app/api/trending/breakouts/route.ts`
- Modify: `apps/admin/src/components/sidebar.tsx:31-78` (add `{ name: "Trending", href: "/trending", roles: ALL, icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" }` after Content), `apps/admin/src/app/(dashboard)/page.tsx` (dashboard: breakout banner fetched from `/api/trending/breakouts`)
- Test: `apps/admin/__tests__/video-iq/create-story.test.ts` (pure helper `storyDraftFrom(video, cluster)`)

**Interfaces:**
- Produces: `GET /api/trending?window=6h|24h|7d&kind=all|short|long&local=1&sort=velocity|outlier` → `{ items: CompetitorVideo[], clusters: Array<{ topicKey, channels, towns, titles: string[], patterns: string[] }> }`; `POST /api/trending/create-story { videoId }` → creates a DRAFT Content (type VIDEO) with `storyDraftFrom()` and returns `{ contentId }`; `storyDraftFrom(video: { title; towns: string[]; topicKey }, cluster: { titles: string[] } | null): { title: string; summary: string; editorNote: string }`; `titlePatterns(titles: string[]): string[]` (shared English and Telugu phrases of 2+ words appearing in at least 2 titles).

- [ ] **Step 1: Write failing test**

`apps/admin/__tests__/video-iq/create-story.test.ts`:
```ts
import { describe, test, expect } from "bun:test";
import { storyDraftFrom, titlePatterns } from "../../src/lib/video-iq/story-draft";
describe("create story", () => {
  test("titlePatterns finds phrases shared by two or more titles", () => {
    const p = titlePatterns(["Rachamallu Siva Prasad Reddy Shocking Comments On Varadarajulu", "రాచమల్లు స్ట్రాంగ్ వార్నింగ్ | Rachamallu Siva Prasad Reddy", "High Tension in Proddatur | Rachamallu Siva Prasad Reddy"]);
    expect(p).toContain("rachamallu siva prasad reddy");
  });
  test("draft carries topic, towns, the own-footage line and no competitor footage reference as a URL", () => {
    const d = storyDraftFrom({ title: "Rachamallu Protest At Proddatur Municipal Office", towns: ["Proddatur"], topicKey: "proddatur+rachamallu siva prasad reddy" }, { titles: ["x", "y"] });
    expect(d.title).toContain("Proddatur"); expect(d.editorNote).toMatch(/own footage/i); expect(d.editorNote).not.toMatch(/https?:\/\//);
  });
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL.

- [ ] **Step 3: Implement**

`apps/admin/src/lib/video-iq/story-draft.ts`:
```ts
export function titlePatterns(titles: string[]): string[] {
  const grams = new Map<string, number>();
  for (const t of titles) {
    const toks = t.toLowerCase().replace(/[|:,.!?]/g, " ").split(/\s+/).filter(Boolean); const seen = new Set<string>();
    for (let n = 2; n <= 4; n++) for (let i = 0; i + n <= toks.length; i++) { const g = toks.slice(i, i + n).join(" "); if (!seen.has(g)) { seen.add(g); grams.set(g, (grams.get(g) ?? 0) + 1); } }
  }
  return [...grams].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).map(([g]) => g).slice(0, 10);
}
export function storyDraftFrom(video: { title: string; towns: string[]; topicKey: string | null }, cluster: { titles: string[] } | null) {
  const town = video.towns[0] ?? "Rayalaseema";
  const patterns = cluster ? titlePatterns(cluster.titles) : [];
  return {
    title: `${town}: ${video.title.split("|")[0].trim()}`.slice(0, 120),
    summary: "",
    editorNote: [`Trending desk lead. Topic: ${video.topicKey ?? "n/a"}. Town: ${town}.`, patterns.length ? `Title patterns winning today: ${patterns.slice(0, 5).join(" / ")}.` : "", "Own footage only. The competitor video is a reference for the story, never to be re-uploaded or clipped."].filter(Boolean).join("\n"),
  };
}
```
`GET /api/trending`: `requireAuth(ALL staff)`; window → `publishedAt >= now - {6h,24h,7d}`; kind → `isShort`; local → `towns` non-empty (`NOT: { towns: { isEmpty: true } }`); sort by `velocity` or `outlier` desc, take 100; clusters = group by `topicKey` with `titles`, `channels` count, `towns`, and `patterns = titlePatterns(titles)`. `POST /api/trending/create-story`: loads the competitor video and its cluster, calls `storyDraftFrom`, `prisma.content.create({ data: { type: "VIDEO", status: "DRAFT", title, summary, editorNote, authorId: auth.user.id, payload: { videoUrl: "" }, language: "TELUGU" } })` (payload left for the editor; validation on PUT will require a real URL before publish), returns `{ contentId }`. `GET /api/trending/breakouts`: returns `breakouts(prisma)`.

`trending/page.tsx` + `trending-table.tsx`: filter bar (window, kind, local toggle, sort), two views toggled by a tab: Videos (table: channel, title, age, views, velocity, outlier badge ≥3 amber ≥10 red, towns chips, "Create story" button → POST then `router.push('/content/<id>')`) and Clusters (cards: topic, channels count, towns, top 3 titles, patterns chips). Dashboard page: fetch `/api/trending/breakouts` on load; when non-empty render a red banner "Breakout: <sample> on <towns> across <channels> channels" linking to `/trending?window=6h&local=1`.

- [ ] **Step 4: Run test and check the screen**

Run: `cd apps/admin && bun test __tests__/video-iq/create-story.test.ts` → PASS. Open `/trending` after a poll; filters change results; Create story lands in the editor with the note.

- [ ] **Step 5: Commit**

```bash
git add "apps/admin/src/app/(dashboard)/trending" apps/admin/src/components/trending apps/admin/src/app/api/trending apps/admin/src/lib/video-iq/story-draft.ts apps/admin/src/components/sidebar.tsx "apps/admin/src/app/(dashboard)/page.tsx" apps/admin/__tests__/video-iq/create-story.test.ts
git commit -m "feat(trending): desk screen with velocity/outlier views, clusters, create-story, breakout banner

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: Cron runner under PM2, deploy changes, env, secrets, docs

**Files:**
- Create: `apps/admin/scripts/cron-runner.ts`, `docs/video-iq.md`
- Modify: `.github/workflows/deploy.yml:160-290` (ffmpeg install next to the Playwright install; three YouTube lines, two DataForSEO lines, `YOUTUBE_CHANNEL_ID`, `AZURE_SPEECH_REGION`, `VIDEO_IQ_YOUTUBE_DRY_RUN` into `apps/admin/.env`; `pm2 restart cron || pm2 start "bun scripts/cron-runner.ts" --name cron --cwd /home/azureuser/app/apps/admin`), `apps/admin/.env.example`, `.env.example`
- Test: `apps/admin/__tests__/video-iq/cron-runner.test.ts` (schedule logic `dueJobs(now, lastRun)`)

**Interfaces:**
- Produces: `dueJobs(now: Date, last: Record<string, number>): string[]` with jobs `video-iq` every 120 s, `trending-poll` every 900 s, `publish-scheduled` every 60 s, `horoscope` and `fetch-precious-metals` daily 05:30 IST (existing routes finally get a caller); runner POSTs `http://127.0.0.1:3001/api/cron/<job>` with the bearer.

- [ ] **Step 1: Write failing test**

`apps/admin/__tests__/video-iq/cron-runner.test.ts`:
```ts
import { describe, test, expect } from "bun:test";
import { dueJobs } from "../../scripts/cron-runner";
describe("dueJobs", () => {
  test("interval jobs fire when their interval elapsed", () => {
    const now = new Date("2026-10-22T06:00:00Z"); const t = now.getTime();
    expect(dueJobs(now, { "video-iq": t - 130_000, "trending-poll": t - 100_000, "publish-scheduled": t - 61_000 })).toEqual(["publish-scheduled", "video-iq"]);
  });
  test("daily jobs fire once after 05:30 IST", () => {
    const now = new Date("2026-10-22T00:05:00Z"); // 05:35 IST
    expect(dueJobs(now, { horoscope: new Date("2026-10-21T00:05:00Z").getTime() })).toContain("horoscope");
    expect(dueJobs(now, { horoscope: new Date("2026-10-22T00:01:00Z").getTime() })).not.toContain("horoscope");
  });
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL.

- [ ] **Step 3: Implement**

`apps/admin/scripts/cron-runner.ts`:
```ts
// Single long-running process (PM2 name "cron") that calls the admin app's
// cron routes on a schedule. Replaces the undocumented external scheduler.
const BASE = process.env.CRON_BASE_URL || "http://127.0.0.1:3001";
const SECRET = process.env.CRON_SECRET || "";
const INTERVAL: Record<string, number> = { "publish-scheduled": 60_000, "video-iq": 120_000, "trending-poll": 900_000 };
const DAILY_IST = ["horoscope", "fetch-precious-metals"]; // 05:30 IST
export function dueJobs(now: Date, last: Record<string, number>): string[] {
  const due: string[] = [];
  for (const [job, ms] of Object.entries(INTERVAL)) if (now.getTime() - (last[job] ?? 0) >= ms) due.push(job);
  const ist = new Date(now.getTime() + 5.5 * 3600_000); const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  for (const job of DAILY_IST) { const l = last[job] ? new Date(last[job] + 5.5 * 3600_000) : null; const ranToday = l && l.getUTCDate() === ist.getUTCDate() && l.getUTCMonth() === ist.getUTCMonth(); if (minutes >= 330 && !ranToday) due.push(job); }
  return due.sort();
}
if (import.meta.main) {
  const last: Record<string, number> = {};
  setInterval(async () => {
    for (const job of dueJobs(new Date(), last)) {
      last[job] = Date.now();
      try { const r = await fetch(`${BASE}/api/cron/${job}`, { method: "POST", headers: { Authorization: `Bearer ${SECRET}` }, signal: AbortSignal.timeout(290_000) }); console.log(new Date().toISOString(), job, r.status, (await r.text()).slice(0, 200)); }
      catch (e) { console.error(new Date().toISOString(), job, "failed", (e as Error).message); }
    }
  }, 15_000);
  console.log("cron-runner started");
}
```
`deploy.yml` edits (exact lines near 168 and inside the admin env heredoc near 192 to 244):
```
            echo "=== Install ffmpeg (Video IQ) ==="
            sudo apt-get install -y ffmpeg || true
```
and in `apps/admin/.env`:
```
            YOUTUBE_CHANNEL_ID="UCFZ-DcNTGQsTBpCmZk1MflA"
            YOUTUBE_OAUTH_REFRESH_TOKEN="${{ secrets.YOUTUBE_OAUTH_REFRESH_TOKEN }}"
            GOOGLE_OAUTH_CLIENT_ID="${{ secrets.GOOGLE_OAUTH_CLIENT_ID }}"
            GOOGLE_OAUTH_CLIENT_SECRET="${{ secrets.GOOGLE_OAUTH_CLIENT_SECRET }}"
            DATAFORSEO_LOGIN="${{ secrets.DATAFORSEO_LOGIN }}"
            DATAFORSEO_PASSWORD="${{ secrets.DATAFORSEO_PASSWORD }}"
            AZURE_SPEECH_REGION="centralindia"
            VIDEO_IQ_YOUTUBE_DRY_RUN="${{ vars.VIDEO_IQ_YOUTUBE_DRY_RUN || '1' }}"
```
and after the admin PM2 line:
```
            pm2 restart cron 2>/dev/null || pm2 start "bun scripts/cron-runner.ts" --name "cron" --cwd /home/azureuser/app/apps/admin
```
Set the GitHub secrets from local files without printing values (run from the repo root, PowerShell):
```powershell
(Get-Content .env.local | Select-String '^YOUTUBE_OAUTH_REFRESH_TOKEN=').Line.Split('=',2)[1] | gh secret set YOUTUBE_OAUTH_REFRESH_TOKEN
(Get-Content .oauth-client.local.json | ConvertFrom-Json).installed.client_id | gh secret set GOOGLE_OAUTH_CLIENT_ID
(Get-Content .oauth-client.local.json | ConvertFrom-Json).installed.client_secret | gh secret set GOOGLE_OAUTH_CLIENT_SECRET
# DataForSEO: after the owner rotates the password, from env vars set outside this session
$env:DFS_LOGIN | gh secret set DATAFORSEO_LOGIN; $env:DFS_PASSWORD | gh secret set DATAFORSEO_PASSWORD
gh variable set VIDEO_IQ_YOUTUBE_DRY_RUN --body 1
```
`docs/video-iq.md`: how to run locally (ffmpeg, env vars, calling the cron route by hand), the stage machine, the dry-run flag, how to flip `VIDEO_IQ_YOUTUBE_DRY_RUN` to 0 after the first real test, the quota ledger, the DataForSEO IP whitelist (add the VM's public IP, obtained with `curl -s https://api.ipify.org` on the VM via `az vm run-command`), and the quota extension form link `https://support.google.com/youtube/contact/yt_api_form`.

- [ ] **Step 4: Run tests**

Run: `cd apps/admin && bun test __tests__/` → all PASS. `cd packages/youtube && bun test __tests__/` → PASS. `bun run lint` at root → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/scripts/cron-runner.ts apps/admin/__tests__/video-iq/cron-runner.test.ts .github/workflows/deploy.yml apps/admin/.env.example .env.example docs/video-iq.md
git commit -m "feat(video-iq): PM2 cron runner, deploy ffmpeg and env, docs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 18: End-to-end acceptance (dry run, then one real video)

**Files:**
- Create: `apps/admin/test-fixtures/video-iq/README.md` (how the fixture was produced), `docs/youtube/video-iq-acceptance-2026-10.md` (filled in during the run)

**Interfaces:** none new; this task proves the whole chain.

- [ ] **Step 1: Local dry run**

With `VIDEO_IQ_YOUTUBE_DRY_RUN=1`, `AZURE_SPEECH_KEY`, Azure OpenAI env, and local DB: create a VIDEO content row with a real 60 to 120 second Telugu news mp4 on blob (upload through the editor). Click Optimize. Call the cron route until READY. Record in the acceptance doc: stage durations, transcript word count, the three titles, scores, hook check, fit verdict, keyword block state (unavailable until the IP is whitelisted is acceptable). Approve and Publish: expect `[yt dry-run]` log lines for insert, thumbnail, playlist, localisation, comment and a `DRYRUN00000` video id; `SocialPost` POSTED; payload updated.

- [ ] **Step 2: Deploy with dry run on**

Owner pushes `main`. On the VM confirm: `pm2 list` shows `cron`; `pm2 logs cron` shows `video-iq 200` and `trending-poll 200` lines; `/trending` fills within 15 minutes; a Content row optimised in production reaches READY.

- [ ] **Step 3: First real publish**

Owner sets `VIDEO_IQ_YOUTUBE_DRY_RUN` to `0` (GitHub variable) and redeploys. Editor runs one real press-meet video through the panel. Owner reviews title and thumbnail in the panel before Publish (standing rule). After publish verify on YouTube: title, thumbnail, chapters shown in the player, playlist membership, English localisation visible with `hl=en`, comment present, category News, language Telugu. Record the quota units used from `youtube_quota_days`. Confirm the website video page shows the transcript and the JSON-LD contains it (`curl -s <page> | grep -o '"transcript"'`).

- [ ] **Step 4: Sign off**

Fill `docs/youtube/video-iq-acceptance-2026-10.md` with the evidence from steps 1 to 3 and the list of Phase B and C items that start next. Commit:
```bash
git add docs/youtube/video-iq-acceptance-2026-10.md apps/admin/test-fixtures/video-iq/README.md
git commit -m "docs(video-iq): phase A acceptance evidence

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage (Phase A):** 3.1 VideoOptimization → T3; 3.2 payload/SocialPost → T3, T12; 3.2a KeywordVolume → T3, T7; 3.3 places/people → T1; 4.1 extract → T4, T10; 4.2 transcribe + captions → T5, T10; 4.3 analyze contract/prompt → T6; 4.3a keyword intelligence → T7, T10; 4.4 score → T8, T10; 4.5 thumbnails → T9, T10; 4.6 panel → T11, T13; 4.7 publish incl. quota ledger (`YoutubeQuotaDay`) → T3, T10, T12; 5 prompt/model → T6; 6 error table → T4 (no audio), T5 (speech errors), T10 (retries, captions wait), T12 (quota after insert), T2 (auth error); 7 security → T2, T10, T11, T17; 8 testing → every task plus T18; 9 deployment → T17; 12.1 Shorts rule → T1, T10, T15; 12.3 hook check → T6, T10, T13; 12.5 transcript on site → T3, T12, T14; 12.11 trending desk → T15, T16. Phase B/C items (12.2, 12.4, 12.6, 12.7, 12.8, 12.9, 12.10, 4.8 sweep, weekly report) are explicitly scoped to the next plans, as the spec's section 10 states.

**Placeholder scan:** none; every code step carries the code; UI tasks describe exact components, props, endpoints and behaviours.

**Type consistency:** `Transcript` (T5) is what T6, T10, T12 consume; `Suggestions` (T6) feeds T7, T8, T10, T11, T13; `Chosen` (T11) feeds T12 and T13; `YouTubeClient` methods named in T2 are the ones called in T5, T10, T12, T15; `KeywordBlock` (T7) is stored under `suggestions.keywords` (T10) and read in T13.

**Review Focus coverage:** item 1 → T1 title test; item 2 → T4 and T10 "no audio" tests; item 3 → T6 low-confidence test; item 4 → T12 quota-after-insert test; item 5 → T15 RSS test with a missing statistics element.
