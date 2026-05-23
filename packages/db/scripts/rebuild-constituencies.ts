// One-shot rebuild — inserts the 55 correct Rayalaseema ACs.
// Uses temp slugs `new-ac-<NN>` to avoid colliding with the existing 78 wrong rows.
// Phase 2 will remap mandals + articles to these new rows, then delete the old 78
// and rename slugs to clean `<english-slug>-<acNumber>`.
//
// Run from repo root:  cd packages/db && bunx tsx scripts/rebuild-constituencies.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface AC {
  no: number;
  en: string;
  te: string;
  districtSlug: string;
}

// 55 Rayalaseema ACs — 2024 AP delimitation (AC No 120..175, missing 123 = pre-Sullurpeta number)
const ACS: AC[] = [
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

async function main() {
  if (ACS.length !== 55) throw new Error(`Expected 55 ACs, got ${ACS.length}`);

  // Look up district ids once
  const districts = await prisma.district.findMany({ select: { id: true, slug: true } });
  const distId: Record<string, string> = {};
  for (const d of districts) distId[d.slug] = d.id;

  let inserted = 0, skipped = 0;
  for (const ac of ACS) {
    const districtId = distId[ac.districtSlug];
    if (!districtId) throw new Error(`Unknown district slug: ${ac.districtSlug}`);

    // Skip if this acNumber already inserted (re-run safe)
    const existing = await prisma.constituency.findUnique({ where: { acNumber: ac.no } });
    if (existing) { skipped++; continue; }

    await prisma.constituency.create({
      data: {
        name: ac.te,
        nameEn: ac.en,
        slug: `new-ac-${ac.no}`,           // temp slug; renamed in cleanup phase
        acNumber: ac.no,
        type: "ASSEMBLY",
        districtId,
        sortOrder: ac.no,
        active: true,
      },
    });
    inserted++;
  }

  const total = await prisma.constituency.count();
  console.log(`Inserted: ${inserted}, skipped (already had acNumber): ${skipped}, total constituencies now: ${total}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
