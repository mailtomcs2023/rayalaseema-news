// YouTube Data API quota ledger (spec 4.7). Units are counted per Pacific
// day (the API's reset boundary, 12:30 IST) in YoutubeQuotaDay. Writes that
// would push the day past DAILY_BUDGET are refused before the call is made;
// reads are always allowed so the panel keeps working on a spent day.
export class QuotaBudgetError extends Error {
  constructor() {
    super("YouTube quota budget for today would be exceeded; retry after 12:30 IST");
    this.name = "QuotaBudgetError";
  }
}

export const DAILY_BUDGET = 9_000;
const READS = new Set(["videos.list", "playlistItems.list", "playlists.list", "channels.list", "captions.list"]);

export function pacificDay(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

type QuotaPrisma = {
  youtubeQuotaDay: {
    findUnique: (a: { where: { date: string } }) => Promise<{ units: number } | null>;
    upsert: (a: { where: { date: string }; create: { date: string; units: number }; update: { units: { increment: number } } }) => Promise<unknown>;
  };
};

export async function unitsUsedToday(prisma: QuotaPrisma): Promise<number> {
  return (await prisma.youtubeQuotaDay.findUnique({ where: { date: pacificDay() } }))?.units ?? 0;
}

export async function reserveUnits(prisma: QuotaPrisma, units: number, label: string): Promise<void> {
  if (!READS.has(label)) {
    const used = await unitsUsedToday(prisma);
    if (used + units > DAILY_BUDGET) throw new QuotaBudgetError();
  }
  const date = pacificDay();
  await prisma.youtubeQuotaDay.upsert({ where: { date }, create: { date, units }, update: { units: { increment: units } } });
}
