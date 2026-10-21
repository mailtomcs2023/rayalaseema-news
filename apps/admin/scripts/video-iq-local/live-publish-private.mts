// Acceptance step 3 helper: run the real pipeline on a video already on blob
// and publish it to the channel as a PRIVATE video (content stays DRAFT), with
// no playlists, so the real resumable upload, thumbnails.set, localisation and
// comment paths are exercised without anything public changing. The owner
// can make it public or delete it in Studio afterwards.
//   cd apps/admin && bunx tsx scripts/video-iq-local/live-publish-private.mts <blob-mp4-url> <slug> [result.txt]
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function loadEnv(file: string, only?: string[]) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (only && !only.includes(m[1])) continue;
    if (process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}
const ROOT = join(process.cwd(), "..", "..");
loadEnv(join(process.cwd(), ".env"));
loadEnv(join(ROOT, "apps", "web", ".env"), ["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION"]);
loadEnv(join(ROOT, ".env.local"), ["YOUTUBE_OAUTH_REFRESH_TOKEN", "DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"]);
const oauth = JSON.parse(readFileSync(join(ROOT, ".oauth-client.local.json"), "utf8"));
const client = oauth.installed ?? oauth.web;
process.env.GOOGLE_OAUTH_CLIENT_ID ||= client.client_id;
process.env.GOOGLE_OAUTH_CLIENT_SECRET ||= client.client_secret;
process.env.VIDEO_IQ_YOUTUBE_DRY_RUN = "0"; // LIVE
process.env.AZURE_OPENAI_COMPOSE_DEPLOYMENT ||= process.env.AZURE_OPENAI_DEPLOYMENT || "gpt51";

const { prisma } = await import("@rayalaseema/db");
const { createDataForSeo } = await import("@rayalaseema/youtube");
const media = await import("../../src/lib/video-iq/media");
const transcribe = await import("../../src/lib/video-iq/transcribe");
const analyze = await import("../../src/lib/video-iq/analyze");
const keywords = await import("../../src/lib/video-iq/keywords");
const thumbnail = await import("../../src/lib/video-iq/thumbnail");
const { runStage } = await import("../../src/lib/video-iq/worker");
const { getYouTube } = await import("../../src/lib/video-iq/youtube");
const { publishOptimization } = await import("../../src/lib/video-iq/publish");
const { defaultChosen } = await import("../../src/components/video-iq/panel-logic");
const { uploadBuffer } = await import("../../src/lib/blob");

const [src, slug, resultPath] = process.argv.slice(2);
if (!src || !/^https:\/\//.test(src) || !slug) throw new Error("usage: live-publish-private.mts <blob-mp4-url> <slug> [result.txt]");
const log: string[] = [];
const say = (s: string) => { console.log(s); log.push(s); };

const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
if (!admin) throw new Error("no ADMIN user");
const content = await prisma.content.upsert({
  where: { slug },
  create: { type: "VIDEO", status: "DRAFT", slug, title: "ప్రొద్దుటూరులో వైసీపీ అభ్యర్థి ఇంటిపై దాడి", summary: "నీలకంఠరావుపేటలో పోలీసుల ఫ్లాగ్ మార్చ్; ప్రొద్దుటూరులో వైసీపీ అభ్యర్థి ఇంటిపై దాడి.", authorId: admin.id, payload: { videoUrl: src, duration: 60 } },
  update: { status: "DRAFT", payload: { videoUrl: src, duration: 60 } },
});
await prisma.videoOptimization.deleteMany({ where: { contentId: content.id } });
let row: any = await prisma.videoOptimization.create({ data: { contentId: content.id, source: "BLOB", blobUrl: src, createdById: admin.id } });
say(`row ${row.id} content ${content.id} (DRAFT → upload will be PRIVATE)`);

const dfs = process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD ? createDataForSeo({ login: process.env.DATAFORSEO_LOGIN, password: process.env.DATAFORSEO_PASSWORD }) : null;
const youtube = getYouTube(prisma);
const deps = { prisma, media, transcribe, analyze, keywords, thumbnail, youtube, dfs, blob: { uploadBuffer } };

for (let i = 0; i < 6 && !["READY", "FAILED"].includes(row.status); i++) {
  const t0 = Date.now();
  const before = row.status;
  await runStage(row, deps as any);
  row = await prisma.videoOptimization.findUnique({ where: { id: row.id } });
  say(`${before} → ${row.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s${row.error ? ` | ${row.error.slice(0, 120)}` : ""}`);
}
if (row.status !== "READY") throw new Error(`pipeline ended in ${row.status}`);
const s: any = row.suggestions;
say(`titles: ${s.titles.map((t: any) => t.text).join(" || ")}`);
say(`fit ${s.fit.verdict} | keywords ${s.keywords?.unavailable ? "unavailable" : "ok"} | scores ${JSON.stringify(row.scores)}`);

const chosen = { ...defaultChosen(row), playlists: [] as string[] }; // no public playlist entries for a private test video
await prisma.videoOptimization.update({ where: { id: row.id }, data: { chosen, status: "APPROVED" } });
say(`publishing LIVE (private) with title: ${chosen.title}`);
const t0 = Date.now();
const r = await publishOptimization(row.id, {
  prisma, youtube,
  fetchBlob: async (url: string) => { const res = await fetch(url); if (!res.ok) throw new Error(`fetch ${res.status}`); const b = new Uint8Array(await res.arrayBuffer()); return { bytes: b, size: b.byteLength }; },
  sitemapUrlFor: async () => null,
});
say(`published in ${((Date.now() - t0) / 1000).toFixed(1)}s → https://www.youtube.com/watch?v=${r.videoId} warnings: ${JSON.stringify(r.warnings)}`);

// Read back from the API (1 unit).
const v = (await youtube.getVideos([r.videoId])).items?.[0];
say(`api: title="${v?.snippet?.title}" privacy=${v?.status?.privacyStatus} category=${v?.snippet?.categoryId} lang=${v?.snippet?.defaultLanguage}/${v?.snippet?.defaultAudioLanguage} tags=${v?.snippet?.tags?.length} thumb=${v?.snippet?.thumbnails?.maxres ? "maxres" : Object.keys(v?.snippet?.thumbnails ?? {}).join(",")} embeddable=${v?.status?.embeddable} kids=${v?.status?.selfDeclaredMadeForKids}`);
const loc = await youtube.get<any>(`videos?part=localizations&id=${r.videoId}`, "videos.list");
say(`localizations: ${Object.keys(loc.items?.[0]?.localizations ?? {}).join(",")}`);
const comments = await youtube.get<any>(`commentThreads?part=snippet&videoId=${r.videoId}&maxResults=5`, "videos.list").catch((e: Error) => ({ error: e.message }));
say(`comments: ${comments.items ? comments.items.length + " → " + String(comments.items[0]?.snippet?.topLevelComment?.snippet?.textOriginal ?? "").slice(0, 60) : comments.error?.slice(0, 120)}`);
const q = await prisma.youtubeQuotaDay.findMany();
say(`quota ledger: ${JSON.stringify(q)}`);
if (resultPath) writeFileSync(resultPath, log.join("\n"));
await prisma.$disconnect();
