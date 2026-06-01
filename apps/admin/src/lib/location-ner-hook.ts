// Spec #4 G2 (#232) - admin publish-time hook that runs the location NER
// and writes ContentLocation rows.
//
// Called from /api/content/[id] PUT on the PUBLISH transition (alongside
// the existing IndexNow ping). Idempotent: wipes prior ContentLocation
// rows for the content + re-inserts based on the fresh NER pass, so
// re-running on subsequent publishes / re-publishes converges cleanly.
//
// The gazetteer is small (~315 rows = 8 districts + ~55 constituencies +
// ~250 mandals) so we load it whole on each call rather than incremental.
// Cached for 10 minutes - locations rarely change.

import { prisma } from "@rayalaseema/db";
import { detectLocations, type LocationEntry, type Confidence as NerConfidence } from "@rayalaseema/nlp";

let gazetteerCache: LocationEntry[] | null = null;
let gazetteerExpires = 0;
const GAZ_TTL_MS = 10 * 60 * 1000;

async function loadGazetteer(): Promise<LocationEntry[]> {
  const now = Date.now();
  if (gazetteerCache && gazetteerExpires > now) return gazetteerCache;
  const [districts, constituencies, mandals] = await Promise.all([
    prisma.district.findMany({
      where: { active: true },
      select: { id: true, name: true, nameEn: true, slug: true },
    }),
    prisma.constituency.findMany({
      where: { active: true },
      select: { id: true, name: true, nameEn: true, slug: true, district: { select: { slug: true } } },
    }),
    prisma.mandal.findMany({
      where: { active: true },
      select: {
        id: true, name: true, nameEn: true, slug: true,
        constituency: { select: { slug: true, district: { select: { slug: true } } } },
      },
    }),
  ]);
  const entries: LocationEntry[] = [
    ...districts.map((d) => ({
      id: d.id,
      kind: "DISTRICT" as const,
      name: d.name,
      nameEn: d.nameEn,
    })),
    ...constituencies.map((c) => ({
      id: c.id,
      kind: "CONSTITUENCY" as const,
      name: c.name,
      // Strip reservation suffix Eenadu-style ("(SC)" etc) - matches the same
      // cleaning the OSM backfill script does.
      nameEn: c.nameEn.replace(/\s*\(.+\)\s*$/, "").trim(),
      parentDistrictSlug: c.district.slug,
    })),
    ...mandals.map((m) => ({
      id: m.id,
      kind: "MANDAL" as const,
      name: m.name,
      nameEn: m.nameEn,
      parentConstituencySlug: m.constituency.slug,
      parentDistrictSlug: m.constituency.district.slug,
    })),
  ];
  gazetteerCache = entries;
  gazetteerExpires = now + GAZ_TTL_MS;
  return entries;
}

/**
 * Run location NER on a content row + persist the results as
 * ContentLocation rows. Pure data-write; UI / sitemap / hub queries pick
 * up the new tags on their next request.
 *
 * Also bumps `Content.constituencyId` to the primary constituency (the
 * denormalized fast-path that articleHref + many list queries use).
 *
 * Failure is non-fatal: caller catches + logs without rolling back the
 * publish.
 */
export async function tagContentLocations(contentId: string, title: string, body: string): Promise<{ primaryConstituencyId: string | null; mentionCount: number }> {
  const gaz = await loadGazetteer();
  const result = detectLocations({ title, body, gazetteer: gaz });
  const primary = result.primary;
  const primaryConstituencyId =
    primary?.kind === "CONSTITUENCY" ? primary.locationId :
    primary?.kind === "MANDAL" ? gaz.find((g) => g.id === primary.locationId)?.parentConstituencySlug
      ? (await prisma.constituency.findUnique({
          where: { slug: gaz.find((g) => g.id === primary.locationId)!.parentConstituencySlug! },
          select: { id: true },
        }))?.id ?? null
      : null
    : null;

  // Replace-all semantics: wipe + reinsert so the row set always reflects
  // the latest NER pass.
  await prisma.$transaction([
    prisma.contentLocation.deleteMany({ where: { contentId } }),
    ...result.mentions.map((m, idx) =>
      prisma.contentLocation.create({
        data: {
          contentId,
          locationId: m.locationId,
          locationType: m.kind,
          confidence: m.confidence as NerConfidence,
          primary: primary !== null && m.locationId === primary.locationId && m.kind === primary.kind,
        },
      }),
    ),
    ...(primaryConstituencyId
      ? [prisma.content.update({ where: { id: contentId }, data: { constituencyId: primaryConstituencyId } })]
      : []),
  ]);

  return { primaryConstituencyId, mentionCount: result.mentions.length };
}
