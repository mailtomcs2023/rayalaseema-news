// Canonical Rayalaseema constituency list (55 ACs, 2024 AP delimitation) and an
// idempotent, NON-DESTRUCTIVE seeder. This is the single source of truth used by
// both the deploy seed (prisma/seed.ts) and the standalone CLI
// (scripts/seed-constituencies.ts). It writes the CLEAN slug (toSlug(nameEn),
// e.g. "pattikonda") that the public routes expect - unlike the older
// rebuild/remap pipeline which produced temp `new-ac-NN` then `<slug>-<no>` slugs.
//
// Safe to run on any DB, repeatedly: it upserts by acNumber, adopts an existing
// slug-matching row, and NEVER deletes anything (it only warns on conflicts).

import type { PrismaClient } from "@prisma/client";

interface AC {
  no: number;
  en: string;
  te: string;
  districtSlug: string;
}

export const ACS: AC[] = [
  // Tirupati (7)
  { no: 120, en: "Gudur", te: "గూడూరు", districtSlug: "tirupati" },
  { no: 121, en: "Sullurpeta", te: "సూళ్ళూరుపేట", districtSlug: "tirupati" },
  { no: 122, en: "Venkatagiri", te: "వెంకటగిరి", districtSlug: "tirupati" },
  { no: 166, en: "Chandragiri", te: "చంద్రగిరి", districtSlug: "tirupati" },
  { no: 167, en: "Tirupati", te: "తిరుపతి", districtSlug: "tirupati" },
  { no: 168, en: "Srikalahasti", te: "శ్రీకాళహస్తి", districtSlug: "tirupati" },
  { no: 169, en: "Satyavedu", te: "సత్యవేడు", districtSlug: "tirupati" },
  // YSR Kadapa (7)
  { no: 124, en: "Badvel", te: "బద్వేలు", districtSlug: "ysr-kadapa" },
  { no: 126, en: "Kadapa", te: "కడప", districtSlug: "ysr-kadapa" },
  { no: 129, en: "Pulivendla", te: "పులివెందుల", districtSlug: "ysr-kadapa" },
  { no: 130, en: "Kamalapuram", te: "కమలాపురం", districtSlug: "ysr-kadapa" },
  { no: 131, en: "Jammalamadugu", te: "జమ్మలమడుగు", districtSlug: "ysr-kadapa" },
  { no: 132, en: "Proddatur", te: "ప్రొద్దుటూరు", districtSlug: "ysr-kadapa" },
  { no: 133, en: "Mydukur", te: "మైదుకూరు", districtSlug: "ysr-kadapa" },
  // Annamayya (6)
  { no: 125, en: "Rajampet", te: "రాజంపేట", districtSlug: "annamayya" },
  { no: 127, en: "Kodur", te: "కోడూరు", districtSlug: "annamayya" },
  { no: 128, en: "Rayachoti", te: "రాయచోటి", districtSlug: "annamayya" },
  { no: 162, en: "Thamballapalle", te: "తంబళ్ళపల్లి", districtSlug: "annamayya" },
  { no: 163, en: "Pileru", te: "పీలేరు", districtSlug: "annamayya" },
  { no: 164, en: "Madanapalle", te: "మదనపల్లె", districtSlug: "annamayya" },
  // Nandyal (7)
  { no: 134, en: "Allagadda", te: "ఆళ్లగడ్డ", districtSlug: "nandyal" },
  { no: 135, en: "Srisailam", te: "శ్రీశైలం", districtSlug: "nandyal" },
  { no: 136, en: "Nandikotkur", te: "నందికోట్కూరు", districtSlug: "nandyal" },
  { no: 138, en: "Panyam", te: "పాణ్యం", districtSlug: "nandyal" },
  { no: 139, en: "Nandyal", te: "నంద్యాల", districtSlug: "nandyal" },
  { no: 140, en: "Banaganapalle", te: "బనగానపల్లె", districtSlug: "nandyal" },
  { no: 141, en: "Dhone", te: "డోను", districtSlug: "nandyal" },
  // Kurnool (7)
  { no: 137, en: "Kurnool", te: "కర్నూలు", districtSlug: "kurnool" },
  { no: 142, en: "Pattikonda", te: "పత్తికొండ", districtSlug: "kurnool" },
  { no: 143, en: "Kodumur", te: "కోడుమూరు", districtSlug: "kurnool" },
  { no: 144, en: "Yemmiganur", te: "ఎమ్మిగనూరు", districtSlug: "kurnool" },
  { no: 145, en: "Mantralayam", te: "మంత్రాలయం", districtSlug: "kurnool" },
  { no: 146, en: "Adoni", te: "ఆదోని", districtSlug: "kurnool" },
  { no: 147, en: "Alur", te: "ఆలూరు", districtSlug: "kurnool" },
  // Ananthapuramu (8)
  { no: 148, en: "Rayadurg", te: "రాయదుర్గం", districtSlug: "ananthapuramu" },
  { no: 149, en: "Uravakonda", te: "ఉరవకొండ", districtSlug: "ananthapuramu" },
  { no: 150, en: "Guntakal", te: "గుంతకల్", districtSlug: "ananthapuramu" },
  { no: 151, en: "Tadpatri", te: "తాడిపత్రి", districtSlug: "ananthapuramu" },
  { no: 152, en: "Singanamala", te: "శింగనమల", districtSlug: "ananthapuramu" },
  { no: 153, en: "Anantapur Urban", te: "అనంతపురం అర్బన్", districtSlug: "ananthapuramu" },
  { no: 154, en: "Kalyandurg", te: "కళ్యాణదుర్గం", districtSlug: "ananthapuramu" },
  { no: 155, en: "Raptadu", te: "రాప్తాడు", districtSlug: "ananthapuramu" },
  // Sri Sathya Sai (6)
  { no: 156, en: "Madakasira", te: "మడకశిర", districtSlug: "sri-sathya-sai" },
  { no: 157, en: "Hindupur", te: "హిందూపురం", districtSlug: "sri-sathya-sai" },
  { no: 158, en: "Penukonda", te: "పెనుకొండ", districtSlug: "sri-sathya-sai" },
  { no: 159, en: "Puttaparthi", te: "పుట్టపర్తి", districtSlug: "sri-sathya-sai" },
  { no: 160, en: "Dharmavaram", te: "ధర్మవరం", districtSlug: "sri-sathya-sai" },
  { no: 161, en: "Kadiri", te: "కదిరి", districtSlug: "sri-sathya-sai" },
  // Chittoor (7)
  { no: 165, en: "Punganur", te: "పుంగనూరు", districtSlug: "chittoor" },
  { no: 170, en: "Nagari", te: "నగరి", districtSlug: "chittoor" },
  { no: 171, en: "Gangadhara Nellore", te: "గంగాధరనెల్లూరు", districtSlug: "chittoor" },
  { no: 172, en: "Chittoor", te: "చిత్తూరు", districtSlug: "chittoor" },
  { no: 173, en: "Puthalapattu", te: "పూతలపట్టు", districtSlug: "chittoor" },
  { no: 174, en: "Palamaner", te: "పలమనేరు", districtSlug: "chittoor" },
  { no: 175, en: "Kuppam", te: "కుప్పం", districtSlug: "chittoor" },
];

export function toSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Idempotent + non-destructive. Returns a summary the caller can log.
export async function seedConstituencies(prisma: PrismaClient) {
  const districts = await prisma.district.findMany({ select: { id: true, slug: true } });
  const distId: Record<string, string> = {};
  for (const d of districts) distId[d.slug] = d.id;

  let created = 0, updated = 0, adopted = 0, conflicts = 0, skipped = 0;
  for (const ac of ACS) {
    const districtId = distId[ac.districtSlug];
    if (!districtId) {
      console.warn(`  ⚠ AC ${ac.no} ${ac.en}: district "${ac.districtSlug}" not seeded - skipping.`);
      skipped++;
      continue;
    }
    const slug = toSlug(ac.en);
    const base = {
      name: ac.te, nameEn: ac.en, acNumber: ac.no,
      type: "ASSEMBLY" as const, districtId, sortOrder: ac.no, active: true,
    };

    const [byAc, bySlug] = await Promise.all([
      prisma.constituency.findUnique({ where: { acNumber: ac.no } }),
      prisma.constituency.findUnique({ where: { slug } }),
    ]);

    if (byAc) {
      if (bySlug && bySlug.id !== byAc.id) {
        // Another row squats the clean slug. Update everything BUT the slug so we
        // never trip the unique constraint or steal a slug from a live page.
        console.warn(`  ⚠ AC ${ac.no} ${ac.en}: slug "${slug}" held by another row (${bySlug.slug}); updated fields, kept old slug "${byAc.slug}".`);
        await prisma.constituency.update({
          where: { id: byAc.id },
          data: { name: base.name, nameEn: base.nameEn, districtId, sortOrder: base.sortOrder, active: true },
        });
        conflicts++;
      } else {
        await prisma.constituency.update({ where: { id: byAc.id }, data: { ...base, slug } });
        updated++;
      }
    } else if (bySlug && (bySlug.acNumber == null || bySlug.acNumber === ac.no)) {
      // A legacy row already owns the clean slug (no/matching acNumber) - adopt it.
      await prisma.constituency.update({ where: { id: bySlug.id }, data: { ...base, slug } });
      adopted++;
    } else if (bySlug) {
      console.warn(`  ⚠ AC ${ac.no} ${ac.en}: slug "${slug}" already used by a different AC (${bySlug.acNumber}); skipped to avoid clobbering.`);
      conflicts++;
    } else {
      await prisma.constituency.create({ data: { ...base, slug } });
      created++;
    }
  }

  const total = await prisma.constituency.count();
  console.log(`  Constituencies: ${created} created, ${updated} updated, ${adopted} adopted, ${conflicts} conflicts, ${skipped} skipped (total now ${total}).`);
  return { created, updated, adopted, conflicts, skipped, total };
}
