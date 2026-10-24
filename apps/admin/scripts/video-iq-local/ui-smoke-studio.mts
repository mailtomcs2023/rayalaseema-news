// Browser smoke of the YouTube studio screens against a local admin dev server:
//   cd apps/admin && bunx tsx scripts/video-iq-local/ui-smoke-studio.mts <creds.json> <clip.mp4> <step> <out-dir>
// step = "catalog" (login, /youtube grid + insights tab, screenshots)
//      | "upload"  (login, /youtube/new, upload the clip via SAS, start, print the run url)
//      | "publish" (login, open <out-dir>/studio-run.json's run, wait READY, Save/Approve/Publish dry-run, Create website article)
import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [credsPath, clip, step, outDir] = process.argv.slice(2);
if (!credsPath || !clip || !step || !outDir) throw new Error("usage: ui-smoke-studio.mts <creds.json> <clip.mp4> catalog|upload|regen|optimise|publish <out-dir>");
const creds = JSON.parse(readFileSync(credsPath, "utf8")) as { email: string; password: string };
const BASE = process.env.ADMIN_BASE_URL || "http://localhost:3001";
const log = (m: string) => console.log(new Date().toISOString().slice(11, 19), m);
const runFile = join(outDir, "studio-run.json");

const browser = await chromium.launch({ timeout: 30_000 });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
try {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.fill("#identifier", creds.email);
  await page.fill("#password", creds.password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
  log("logged in");

  if (step === "catalog") {
    await page.goto(`${BASE}/youtube`, { waitUntil: "networkidle", timeout: 180_000 });
    await page.locator("text=/Catalog synced|No videos in the catalog/").first().waitFor({ timeout: 90_000 });
    const cards = await page.locator("div:has(> a[href*='youtube.com/watch'], > a[href^='/youtube/'])").count();
    log(`catalog: ${cards} cards`);
    await page.screenshot({ path: join(outDir, "studio-1-catalog.png") });
    await page.selectOption("select", "opportunities");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(outDir, "studio-1b-opportunities.png") });
    await page.getByRole("button", { name: "Shorts" }).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(outDir, "studio-1c-shorts.png") });
    await page.getByRole("button", { name: "Channel insights" }).click();
    await page.locator("text=Where views come from").waitFor({ timeout: 60_000 });
    await page.screenshot({ path: join(outDir, "studio-1d-insights.png") });
    log("insights rendered");
  }

  if (step === "upload") {
    await page.goto(`${BASE}/youtube/new`, { waitUntil: "networkidle", timeout: 180_000 });
    await page.setInputFiles("input[type=file]", clip);
    await page.locator("text=uploaded · click to replace").waitFor({ timeout: 300_000 });
    log("clip uploaded to blob via SAS");
    await page.getByTestId("yt-desk-title").fill("ప్రొద్దుటూరులో వైసీపీ అభ్యర్థి ఇంటిపై దాడి");
    await page.getByRole("checkbox").first().check(); // breaking
    await page.screenshot({ path: join(outDir, "studio-2-new.png") });
    await page.getByTestId("yt-start").click();
    await page.waitForURL(/\/youtube\/(?!new$)[a-z0-9]+$/, { timeout: 60_000 });
    const runId = page.url().split("/").pop()!;
    writeFileSync(runFile, JSON.stringify({ runId }));
    log(`run created → ${page.url()}`);
    // The create route kicks the worker at once: the activity feed should
    // show real lines within seconds, no cron needed.
    await page.locator("[data-testid=viq-feed] >> text=/Downloading|Existing channel video/").first().waitFor({ timeout: 60_000 });
    log("feed started");
    await page.waitForTimeout(12_000);
    const feed = await page.getByTestId("viq-feed").innerText();
    log(`feed after 12 s: ${feed.replace(/\s+/g, " ").slice(0, 300)}`);
    await page.screenshot({ path: join(outDir, "studio-3-progress.png") });
    await page.locator("text=/^(Ready to review|Approved|On YouTube|Failed)$/").first().waitFor({ timeout: 300_000 });
    const status = await page.locator("text=/^(Ready to review|Approved|On YouTube|Failed)$/").first().innerText();
    log(`run finished: ${status}`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(outDir, "studio-4-ready.png"), fullPage: true });
    log(`feed final: ${(await page.getByTestId("viq-feed").innerText().catch(() => "(collapsed)")).replace(/\s+/g, " ").slice(0, 600)}`);
  }

  if (step === "regen") {
    if (!existsSync(runFile)) throw new Error("run the upload step first");
    const { runId } = JSON.parse(readFileSync(runFile, "utf8"));
    await page.goto(`${BASE}/youtube/${runId}`, { waitUntil: "networkidle", timeout: 180_000 });
    await page.locator("text=/^(Ready to review|Approved)$/").first().waitFor({ timeout: 300_000 });
    const before = await page.locator("input[name=viq-title]").count();
    await page.getByPlaceholder(/mention Varadarajulu Reddy/).fill("name the candidate and the town, keep it under 90 characters");
    await page.getByRole("button", { name: /Regenerate titles/ }).click();
    await page.locator("text=AI rewrites").waitFor({ timeout: 120_000 });
    const after = await page.locator("input[name=viq-title]").count();
    log(`titles: ${before} → ${after} (AI rewrites added)`);
    const firstAi = await page.locator("label:has(input[name=viq-title])").first().innerText();
    log(`first AI title card: ${firstAi.replace(/\s+/g, " ").slice(0, 220)}`);
    await page.locator("label:has(input[name=viq-title])").first().locator("input").check();
    const descBefore = await page.locator("textarea").first().inputValue();
    await page.getByPlaceholder(/lead with the attack/).fill("4 sentences, name the candidate");
    await page.getByRole("button", { name: /Rewrite description/ }).click();
    await page.locator("text=Undo last AI change").waitFor({ timeout: 120_000 });
    const descAfter = await page.locator("textarea").first().inputValue();
    log(`description changed: ${descBefore !== descAfter} (${descAfter.length} chars)`);
    await page.getByRole("button", { name: /Suggest more tags/ }).click();
    await page.waitForTimeout(100);
    await page.locator("button:has-text('Thinking…')").first().waitFor({ state: "detached", timeout: 120_000 }).catch(() => {});
    const tagsLine = await page.locator("text=/Tags \\(\\d+\\/30/").first().innerText();
    log(`tags line: ${tagsLine}`);
    await page.screenshot({ path: join(outDir, "studio-7-regen.png"), fullPage: true });
    const savedDesc = await page.locator("textarea").first().inputValue();
    const savedTags = await page.locator("text=/Tags \\(\\d+\\/30/").first().innerText();
    await page.getByTestId("viq-save").click();
    await page.locator("text=Choice saved").waitFor({ timeout: 20_000 });
    log("saved the AI-rewritten choice");
    // Owner 2026-10-25: "only the title is getting saved". Reload and compare every field.
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("text=/^(Ready to review|Approved)$/").first().waitFor({ timeout: 120_000 });
    const afterDesc = await page.locator("textarea").first().inputValue();
    const afterTags = await page.locator("text=/Tags \\(\\d+\\/30/").first().innerText();
    log(`after reload: description persisted ${afterDesc === savedDesc} (${afterDesc.length} chars); tags "${afterTags}" (was "${savedTags}")`);
    const api = await page.request.get(`${BASE}/api/video-iq/${runId}`);
    const j: any = await api.json();
    log(`api chosen: title ${j.chosen?.title?.length ?? 0} chars, description ${j.chosen?.description?.length ?? 0} chars (equals model: ${j.chosen?.description === j.suggestions?.description}), tags ${j.chosen?.tags?.length ?? 0} (equals model: ${JSON.stringify(j.chosen?.tags) === JSON.stringify(j.suggestions?.tags)}), chapters ${j.chosen?.chapters?.length ?? 0}, comment ${j.chosen?.comment?.length ?? 0} chars`);
  }

  if (step === "optimise") {
    if (!existsSync(runFile)) throw new Error("run the upload step first");
    const { runId } = JSON.parse(readFileSync(runFile, "utf8"));
    await page.goto(`${BASE}/youtube/${runId}`, { waitUntil: "networkidle", timeout: 180_000 });
    await page.locator("text=/^(Ready to review|Approved)$/").first().waitFor({ timeout: 300_000 });
    const card = page.getByTestId("viq-scorecard");
    log(`scorecard before: ${(await card.innerText()).replace(/\s+/g, " ").slice(0, 160)}`);
    log(`fit reasons: ${(await page.getByTestId("viq-fit-reasons").innerText()).replace(/\s+/g, " ").slice(0, 240)}`);
    // Start from a weak title so the pass has something to lift (the live scorecard must drop first).
    const titleInput = page.locator("input[value*=' | ']").first();
    await titleInput.fill("ఘటన | Evening Update");
    await page.waitForTimeout(300);
    log(`scorecard with weak title: ${(await card.innerText()).replace(/\s+/g, " ").slice(0, 120)}`);
    await page.getByTestId("viq-optimise-all").click();
    const toast = page.locator("text=/Optimised:|Nothing left to optimise/").first();
    await toast.waitFor({ timeout: 600_000 });
    log(`toast: ${(await toast.innerText()).replace(/\s+/g, " ").slice(0, 300)}`);
    log(`scorecard after: ${(await card.innerText()).replace(/\s+/g, " ").slice(0, 160)}`);
    log(`chosen title now: ${await titleInput.inputValue()}`);
    await page.screenshot({ path: join(outDir, "studio-8-optimise.png"), fullPage: true });
    if (await page.getByTestId("viq-save").isEnabled()) {
      await page.getByTestId("viq-save").click();
      await page.locator("text=Choice saved").waitFor({ timeout: 20_000 });
      log("saved the optimised choice");
    }
    log(`scorecard saved: ${(await card.innerText()).replace(/\s+/g, " ").slice(0, 160)}`);
    // Admin override: our own footage lifts the reuse cap on fit.
    if (await page.getByTestId("viq-override").count()) {
      await page.locator("input[placeholder*='audit log']").fill("shot by our Proddatur reporter (smoke)");
      await page.getByTestId("viq-override").click();
      await page.locator("text=/Override recorded/").first().waitFor({ timeout: 30_000 });
      await page.waitForTimeout(1500);
      log(`after override: ${(await card.innerText()).replace(/\s+/g, " ").slice(0, 120)}`);
      log(`fit box: ${(await page.getByTestId("viq-fit-reasons").innerText()).replace(/\s+/g, " ").slice(0, 160)}`);
      await page.screenshot({ path: join(outDir, "studio-9-fit-override.png"), fullPage: true });
    } else log("no override control (not admin, or already overridden)");
  }

  if (step === "publish") {
    if (!existsSync(runFile)) throw new Error("run the upload step first");
    const { runId } = JSON.parse(readFileSync(runFile, "utf8"));
    await page.goto(`${BASE}/youtube/${runId}`, { waitUntil: "networkidle", timeout: 180_000 });
    await page.locator("text=/^(Ready to review|Approved)$/").first().waitFor({ timeout: 300_000 });
    log("workspace READY");
    await page.screenshot({ path: join(outDir, "studio-4-ready.png") });
    const radios = page.locator("input[name=viq-title]");
    const pick = (await radios.nth(1).isChecked()) ? 0 : 1;
    await radios.nth(pick).check();
    await page.getByTestId("viq-publish-section").getByLabel("Private").check();
    await page.getByTestId("viq-save").click();
    await page.locator("text=Choice saved").waitFor({ timeout: 20_000 });
    log(`saved title ${pick + 1}, visibility private`);
    await page.getByTestId("viq-approve").click();
    await page.locator("text=/^Approved$/").first().waitFor({ timeout: 20_000 });
    const publishBtn = page.getByTestId("viq-publish");
    await page.waitForTimeout(800);
    const gate = (await publishBtn.getAttribute("title")) ?? "";
    log(`publish gate: ${gate || "(open)"}`);
    if (/not a fit/i.test(gate)) {
      await page.getByPlaceholder(/Why publish anyway/).fill("studio smoke: owner accepts this clip");
      await page.getByRole("button", { name: "Record override" }).click();
      await page.locator("text=Override recorded").waitFor({ timeout: 20_000 });
    }
    await publishBtn.click({ timeout: 30_000 });
    const dialog = page.getByRole("alertdialog");
    await dialog.waitFor({ timeout: 10_000 });
    log(`dialog: ${(await dialog.innerText()).replace(/\s+/g, " ").slice(0, 160)}`);
    await dialog.getByRole("button", { name: "Publish" }).click();
    await page.locator("text=/Dry run: DRYRUN00000|Published:/").first().waitFor({ timeout: 180_000 });
    log("published (dry run)");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(outDir, "studio-5-applied.png") });
    await page.getByTestId("viq-create-article").click();
    await page.waitForURL(/\/content\//, { timeout: 60_000 });
    log(`create article → ${page.url()}`);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: join(outDir, "studio-6-article.png") });
    const url = await page.inputValue("input[placeholder*='video URL'], input[value*='youtube.com']").catch(() => "");
    log(`article video url field: ${url}`);
  }
} finally {
  await browser.close();
}
