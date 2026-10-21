import { describe, test, expect } from "bun:test";
import { dueJobs } from "../../scripts/cron-runner";

describe("dueJobs", () => {
  test("interval jobs fire when their interval has elapsed", () => {
    const now = new Date("2026-10-22T06:00:00Z"); // 11:30 IST
    const t = now.getTime();
    const dailiesDone = { horoscope: t - 5 * 3600_000, "fetch-precious-metals": t - 5 * 3600_000 }; // 06:30 IST today
    expect(dueJobs(now, { ...dailiesDone, "video-iq": t - 130_000, "trending-poll": t - 100_000, "publish-scheduled": t - 61_000, "channel-sync": t - 60_000 })).toEqual(["publish-scheduled", "video-iq"]);
    expect(dueJobs(now, { ...dailiesDone, "video-iq": t, "trending-poll": t, "publish-scheduled": t, "channel-sync": t - 31 * 60_000 })).toEqual(["channel-sync"]);
  });
  test("never-run interval jobs fire immediately", () => {
    const now = new Date("2026-10-22T06:00:00Z");
    expect(dueJobs(now, {})).toContain("publish-scheduled");
    expect(dueJobs(now, {})).toContain("trending-poll");
  });
  test("daily jobs fire once after 05:30 IST", () => {
    const now = new Date("2026-10-22T00:05:00Z"); // 05:35 IST
    expect(dueJobs(now, { horoscope: new Date("2026-10-21T00:05:00Z").getTime() })).toContain("horoscope");
    expect(dueJobs(now, { horoscope: new Date("2026-10-22T00:01:00Z").getTime() })).not.toContain("horoscope");
    expect(dueJobs(new Date("2026-10-21T23:50:00Z"), {})).not.toContain("horoscope"); // 05:20 IST, too early
  });
});
