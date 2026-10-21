// Single long-running process (PM2 name "cron") that calls the admin app's
// cron routes on a schedule. Replaces the undocumented external scheduler
// the comments in /api/cron/* assumed. Runs under `bun scripts/cron-runner.ts`
// from apps/admin with the same .env as the app.
//
//   publish-scheduled      every 60 s
//   video-iq               every 120 s   (Video IQ stage worker)
//   trending-poll          every 15 min  (competitor RSS)
//   horoscope, fetch-precious-metals   daily, first tick after 05:30 IST
const BASE = process.env.CRON_BASE_URL || "http://127.0.0.1:3001";
const SECRET = process.env.CRON_SECRET || "";
const TICK_MS = 15_000;
const IST_OFFSET_MS = 5.5 * 3600_000;
const DAILY_AFTER_MINUTES = 5 * 60 + 30; // 05:30 IST

const INTERVAL: Record<string, number> = {
  "publish-scheduled": 60_000,
  "video-iq": 120_000,
  "trending-poll": 15 * 60_000,
  "channel-sync": 30 * 60_000, // our own catalog for /youtube (~12 units per run)
};
const DAILY_IST = ["horoscope", "fetch-precious-metals"];

const istDate = (ms: number) => new Date(ms + IST_OFFSET_MS);

/** Which jobs should run now, given each job's last start time (ms epoch). */
export function dueJobs(now: Date, last: Record<string, number>): string[] {
  const due: string[] = [];
  for (const [job, ms] of Object.entries(INTERVAL)) {
    if (now.getTime() - (last[job] ?? 0) >= ms) due.push(job);
  }
  const ist = istDate(now.getTime());
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  for (const job of DAILY_IST) {
    const l = last[job] ? istDate(last[job]) : null;
    const ranToday = Boolean(l && l.getUTCFullYear() === ist.getUTCFullYear() && l.getUTCMonth() === ist.getUTCMonth() && l.getUTCDate() === ist.getUTCDate());
    if (minutes >= DAILY_AFTER_MINUTES && !ranToday) due.push(job);
  }
  return due.sort();
}

async function run(job: string): Promise<void> {
  const started = Date.now();
  try {
    const r = await fetch(`${BASE}/api/cron/${job}`, { method: "POST", headers: { Authorization: `Bearer ${SECRET}` }, signal: AbortSignal.timeout(290_000) });
    const body = (await r.text()).slice(0, 200).replace(/\s+/g, " ");
    console.log(new Date().toISOString(), job, r.status, `${Date.now() - started}ms`, body);
  } catch (e) {
    console.error(new Date().toISOString(), job, "failed", (e as Error).message);
  }
}

if (import.meta.main) {
  if (!SECRET) {
    console.error("CRON_SECRET missing; cron-runner will not start");
    process.exit(1);
  }
  const last: Record<string, number> = {};
  const inflight = new Set<string>();
  console.log("cron-runner started", BASE, Object.keys(INTERVAL).concat(DAILY_IST).join(","));
  setInterval(() => {
    // Jobs run independently: a slow video-iq tick never delays
    // publish-scheduled, and one job never stacks on itself.
    for (const job of dueJobs(new Date(), last)) {
      if (inflight.has(job)) continue;
      inflight.add(job);
      last[job] = Date.now();
      void run(job).finally(() => inflight.delete(job));
    }
  }, TICK_MS);
}
