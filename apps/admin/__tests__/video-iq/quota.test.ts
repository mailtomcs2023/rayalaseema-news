import { describe, test, expect } from "bun:test";
import { pacificDay, reserveUnits, unitsUsedToday, QuotaBudgetError } from "../../src/lib/video-iq/quota";

function fakePrisma(initial = 0) {
  const rows: Record<string, number> = {};
  rows[pacificDay()] = initial;
  return {
    rows,
    youtubeQuotaDay: {
      findUnique: async ({ where }: any) => (where.date in rows ? { date: where.date, units: rows[where.date] } : null),
      upsert: async ({ where, create, update }: any) => {
        rows[where.date] = (rows[where.date] ?? 0) + (update.units.increment ?? create.units);
        return { date: where.date, units: rows[where.date] };
      },
    },
  };
}

describe("quota", () => {
  test("pacificDay rolls at 07:00 UTC in winter and 08:00 UTC in summer", () => {
    expect(pacificDay(new Date("2026-11-10T06:59:00Z"))).toBe("2026-11-09");
    expect(pacificDay(new Date("2026-11-10T08:01:00Z"))).toBe("2026-11-10");
    expect(pacificDay(new Date("2026-07-10T06:59:00Z"))).toBe("2026-07-09");
    expect(pacificDay(new Date("2026-07-10T07:01:00Z"))).toBe("2026-07-10");
  });

  test("reserve adds units and refuses writes past 9000", async () => {
    const p = fakePrisma(8_900) as any;
    await reserveUnits(p, 50, "videos.update");
    expect(p.rows[pacificDay()]).toBe(8_950);
    await expect(reserveUnits(p, 1600, "videos.insert")).rejects.toBeInstanceOf(QuotaBudgetError);
    expect(p.rows[pacificDay()]).toBe(8_950);
  });

  test("reads are always allowed and still counted", async () => {
    const p = fakePrisma(9_500) as any;
    await reserveUnits(p, 1, "videos.list");
    expect(await unitsUsedToday(p)).toBe(9_501);
  });
});
