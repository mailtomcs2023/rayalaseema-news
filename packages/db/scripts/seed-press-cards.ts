// Seed / refresh press ID cards from prisma/press-cards.json.
//
// Idempotent: upserts by cardNo, so re-running on every deploy is safe and
// editing the JSON (new card, renewed validTill, changed designation) is the
// way to update production until the admin screen exists. Revocation is NOT
// driven from here - a REVOKED row stays revoked even if the JSON still lists
// it, so a revoke done in the DB cannot be undone by a redeploy by accident.
//
//   cd packages/db && bunx tsx scripts/seed-press-cards.ts
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Row = {
  cardNo: string;
  token: string;
  name: string;
  designation: string;
  photoUrl: string;
  validFrom: string; // YYYY-MM-DD
  validTill: string; // YYYY-MM-DD (inclusive)
};

const prisma = new PrismaClient();
const TOKEN_RE = /^[a-z0-9]{12}$/;
const CARD_RE = /^RSN\/\d{4}\/\d{3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(s: string): Date {
  if (!DATE_RE.test(s)) throw new Error(`bad date ${s}`);
  return new Date(`${s}T00:00:00.000Z`);
}

async function main() {
  const file = resolve(__dirname, "../prisma/press-cards.json");
  const rows = JSON.parse(readFileSync(file, "utf8")) as Row[];
  const tokens = new Set<string>();
  for (const r of rows) {
    if (!CARD_RE.test(r.cardNo)) throw new Error(`bad cardNo ${r.cardNo}`);
    if (!TOKEN_RE.test(r.token)) throw new Error(`bad token for ${r.cardNo}`);
    if (tokens.has(r.token)) throw new Error(`duplicate token for ${r.cardNo}`);
    tokens.add(r.token);
    if (!/^https:\/\//.test(r.photoUrl)) throw new Error(`photoUrl must be https for ${r.cardNo}`);
  }

  let created = 0, updated = 0;
  for (const r of rows) {
    const data = {
      token: r.token,
      name: r.name,
      designation: r.designation,
      photoUrl: r.photoUrl,
      validFrom: parseDay(r.validFrom),
      validTill: parseDay(r.validTill),
    };
    const existing = await prisma.pressCard.findUnique({ where: { cardNo: r.cardNo }, select: { id: true } });
    await prisma.pressCard.upsert({
      where: { cardNo: r.cardNo },
      create: { cardNo: r.cardNo, ...data },
      update: data, // status/revokedAt deliberately untouched
    });
    existing ? updated++ : created++;
  }
  console.log(`press cards: ${created} created, ${updated} updated (${rows.length} in file)`);
}

main()
  .catch((e) => { console.error("seed-press-cards failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
