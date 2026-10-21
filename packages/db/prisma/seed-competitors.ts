// Seed the trending desk's watched channels (spec 12.11). Idempotent upsert
// by channel id; re-run after editing. Ids were resolved on 2026-10-22 with
// channels.list?forHandle=. Handles that did not resolve are listed at the
// bottom so the owner can add them from the admin once the right handle is
// known.
//
//   bun packages/db/prisma/seed-competitors.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// tier 1 = statewide leaders (highest reach), tier 2 = mid-size, tier 3 = regional.
const CHANNELS: Array<{ channelId: string; name: string; tier: number }> = [
  { channelId: "UCPXTXMecYqnRKNdqdVOGSFg", name: "TV9 Telugu Live", tier: 1 },
  { channelId: "UCumtYpCY26F6Jr3satUgMvA", name: "NTV Telugu", tier: 1 },
  { channelId: "UCJi8M0hRKjz8SLPvJKEVTOg", name: "ETV Andhra Pradesh", tier: 1 },
  { channelId: "UC_2irx_BQR7RsBKmUV9fePQ", name: "ABN Telugu", tier: 1 },
  { channelId: "UCAR3h_9fLV82N2FH4cE4RKw", name: "TV5 News", tier: 1 },
  { channelId: "UCfymZbh17_3T_UhgjkQ9fRQ", name: "10TV News Telugu", tier: 1 },
  { channelId: "UCZ9m4KOh8Ei60428xeGYDCQ", name: "Sakshi TV", tier: 1 },
  { channelId: "UCLTZ5y21NnklrxpU5AfWd8w", name: "Prime9 News", tier: 2 },
  { channelId: "UCixD-KrpjXtMupkzkdFFlFg", name: "CVR News Telugu", tier: 2 },
  { channelId: "UCQ_FATLW83q-4xJ2fsi8qAw", name: "Sakshi TV Live", tier: 2 },
  { channelId: "UCl5YgCiwSRVOiC2Nd1P9v1A", name: "99TV Telugu", tier: 2 },
  { channelId: "UCDKjhgRoPF1CQk7HluMz23A", name: "Mahaa News", tier: 2 },
  { channelId: "UC4jYxQXFqB5q6INV6WEQC2A", name: "iNews Telugu", tier: 2 },
  { channelId: "UCCZtyCUba1Ap_75zCZ7vlnw", name: "Sakshi TV Politics", tier: 3 },
];

// Not resolved by handle on 2026-10-22: hmtv, Big TV Telugu, SumanTV News,
// UTV News, Penneru News. @DialNews resolved to an unrelated channel ("aura").

async function main() {
  for (const c of CHANNELS) {
    await prisma.competitorChannel.upsert({
      where: { channelId: c.channelId },
      create: { ...c, active: true },
      update: { name: c.name, tier: c.tier },
    });
  }
  const count = await prisma.competitorChannel.count({ where: { active: true } });
  console.log(`competitor channels seeded: ${CHANNELS.length} upserted, ${count} active`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
