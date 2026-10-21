// Local end-to-end dry run (plan Task 18 step 1). Runs the real pipeline
// (ffmpeg → Azure Speech → Azure OpenAI → DataForSEO → Playwright) against a
// sample channel video on disk, then publishes with the YouTube client in
// dry-run mode. Usage:
//   cd apps/admin && bunx tsx scripts/video-iq-local/dry-run.mts <path-to.mp4>
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
process.env.VIDEO_IQ_YOUTUBE_DRY_RUN = "1";
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

const src = process.argv[2];
if (!src || !existsSync(src)) throw new Error("usage: dry-run.mts <video.mp4>");
const log: string[] = [];
const say = (s: string) => { console.log(s); log.push(s); };

const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
if (!admin) throw new Error("no ADMIN user");
const content = await prisma.content.upsert({
  where: { slug: "viq-dry-run" },
  create: { type: "VIDEO", status: "PUBLISHED", publishedAt: new Date(), slug: "viq-dry-run", title: "ప్రొద్దుటూరులో వైసీపీ అభ్యర్థి ఇంటిపై దాడి", summary: "నీలకంఠరావుపేటలో పోలీసుల ఫ్లాగ్ మార్చ్; ప్రొద్దుటూరులో వైసీపీ అభ్యర్థి ఇంటిపై దాడి.", authorId: admin.id, payload: { videoUrl: "https://example.blob.core.windows.net/uploads/dry-run.mp4", duration: 274 } },
  update: { payload: { videoUrl: "https://example.blob.core.windows.net/uploads/dry-run.mp4", duration: 274 } },
});
await prisma.videoOptimization.deleteMany({ where: { contentId: content.id } });
let row: any = await prisma.videoOptimization.create({ data: { contentId: content.id, source: "BLOB", blobUrl: src, createdById: admin.id } });
say(`row ${row.id} content ${content.id}`);

const dfs = process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD ? createDataForSeo({ login: process.env.DATAFORSEO_LOGIN, password: process.env.DATAFORSEO_PASSWORD }) : null;
const youtube = getYouTube(prisma);
const deps = { prisma, media, transcribe, analyze, keywords, thumbnail, youtube, dfs, blob: { uploadBuffer } };

for (let i = 0; i < 4; i++) {
  const t0 = Date.now();
  const before = row.status;
  await runStage(row, deps as any);
  row = await prisma.videoOptimization.findUnique({ where: { id: row.id } });
  say(`${before} → ${row.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s${row.error ? ` | error: ${row.error}` : ""}`);
  if (row.status === "FAILED") break;
}
const s: any = row.suggestions;
if (row.status === "READY") {
  const t: any = row.transcript;
  say(`transcript: ${t?.words} words, ${t?.segments?.length} segments, ${t?.durationSec}s`);
  say(`first segment: ${t?.segments?.[0]?.text?.slice(0, 120)}`);
  say(`format ${s.format} | low_confidence ${s.low_confidence} | hook late=${s.hook?.late} startsAt=${s.hook?.startsAt} (${s.hook?.reason})`);
  s.titles.forEach((x: any, i: number) => say(`title ${i + 1}: ${x.text}  [${[...x.text].length}] (${x.why})`));
  say(`thumbnail headline: ${s.thumbnail?.headline_te} | concept: ${s.thumbnail?.concept}`);
  say(`fit: ${JSON.stringify(s.fit)}`);
  say(`entities: ${JSON.stringify(s.entities)}`);
  say(`tags (${s.tags.length}): ${s.tags.join(", ")}`);
  say(`chapters: ${s.chapters.map((c: any) => `${c.start} ${c.title_te}`).join(" | ")}`);
  say(`playlists: ${s.playlists.join(", ")} | comment: ${s.pinned_comment}`);
  say(`keywords: ${s.keywords?.unavailable ? "UNAVAILABLE " + s.keywords.unavailable : `${s.keywords.terms.length} terms, ${s.keywords.suggested.length} ideas, ${s.keywords.serp.length} serp`}`);
  for (const k of (s.keywords?.terms ?? []).slice(0, 8)) say(`  vol ${k.term}: ${k.volume}`);
  for (const h of (s.keywords?.serp ?? []).slice(0, 5)) say(`  serp #${h.rank} ${h.channel}: ${h.title.slice(0, 70)}`);
  say(`scores: ${JSON.stringify(row.scores)}`);
  say(`thumbnails: ${(row.thumbnails ?? []).map((x: any) => x.renderedUrl ? "rendered" : "raw").join(", ")}`);
  say(`description:\n${s.description}`);

  const chosen = defaultChosen(row);
  await prisma.videoOptimization.update({ where: { id: row.id }, data: { chosen, status: "APPROVED" } });
  const t0 = Date.now();
  const r = await publishOptimization(row.id, {
    prisma, youtube,
    fetchBlob: async (url: string) => {
      if (url.startsWith("http")) { const res = await fetch(url); const b = new Uint8Array(await res.arrayBuffer()); return { bytes: b, size: b.byteLength }; }
      const b = new Uint8Array(readFileSync(url)); return { bytes: b, size: b.byteLength };
    },
    sitemapUrlFor: async () => null,
  });
  say(`publish (dry run) in ${((Date.now() - t0) / 1000).toFixed(1)}s → videoId ${r.videoId}, warnings: ${JSON.stringify(r.warnings)}`);
  row = await prisma.videoOptimization.findUnique({ where: { id: row.id } });
  const c2 = await prisma.content.findUnique({ where: { id: content.id }, select: { payload: true } });
  const sp = await prisma.socialPost.findUnique({ where: { contentId_platform: { contentId: content.id, platform: "YOUTUBE" } } });
  say(`row status ${row.status} | payload.videoId ${(c2?.payload as any)?.videoId} | payload.transcript ${String((c2?.payload as any)?.transcript ?? "").length} chars | socialPost ${sp?.status} ${sp?.postUrl}`);
  say(`final description sent:\n${(row.applied as any)?.title}\n---`);
  const q = await prisma.youtubeQuotaDay.findMany();
  say(`quota ledger: ${JSON.stringify(q)}`);
}
writeFileSync((process.argv[3] ?? join(process.cwd(), "test-fixtures", "dry-run-result.txt")), log.join("\n"));
await prisma.$disconnect();
