import { PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database (structure only, no dummy content)...");

  // ========== USERS ==========
  const adminPwd = await hash("admin123", 12);
  await prisma.user.upsert({
    where: { email: "admin@rayalaseemaexpress.com" },
    update: {},
    create: { email: "admin@rayalaseemaexpress.com", name: "Admin", passwordHash: adminPwd, role: Role.ADMIN },
  });

  const chiefSubPwd = await hash("chief123", 12);
  await prisma.user.upsert({
    where: { email: "chief@rayalaseemaexpress.com" },
    update: {},
    create: { email: "chief@rayalaseemaexpress.com", name: "Chief Sub-Editor", passwordHash: chiefSubPwd, role: Role.CHIEF_SUB_EDITOR },
  });

  const subEditorPwd = await hash("subeditor123", 12);
  await prisma.user.upsert({
    where: { email: "subeditor@rayalaseemaexpress.com" },
    update: {},
    create: { email: "subeditor@rayalaseemaexpress.com", name: "Sub-Editor", passwordHash: subEditorPwd, role: Role.SUB_EDITOR },
  });

  const reporterPwd = await hash("reporter123", 12);
  await prisma.user.upsert({
    where: { email: "reporter@rayalaseemaexpress.com" },
    update: {},
    create: { email: "reporter@rayalaseemaexpress.com", name: "Reporter", passwordHash: reporterPwd, role: Role.REPORTER },
  });
  console.log("  4 users created (Admin, Chief Sub-Editor, Sub-Editor, Reporter)");

  // ========== CATEGORIES ==========
  const categories = [
    { name: "రాజకీయాలు", nameEn: "Politics", slug: "politics", color: "#FF2C2C", sortOrder: 1 },
    { name: "నేరాలు", nameEn: "Crime", slug: "crime", color: "#7C3AED", sortOrder: 2 },
    { name: "క్రీడలు", nameEn: "Sports", slug: "sports", color: "#16A34A", sortOrder: 3 },
    { name: "బిజినెస్", nameEn: "Business", slug: "business", color: "#2563EB", sortOrder: 4 },
    { name: "సినిమా", nameEn: "Entertainment", slug: "entertainment", color: "#DB2777", sortOrder: 5 },
    { name: "విద్య", nameEn: "Education", slug: "education", color: "#0891B2", sortOrder: 6 },
    { name: "వ్యవసాయం", nameEn: "Agriculture", slug: "agriculture", color: "#65A30D", sortOrder: 7 },
    { name: "జిల్లా వార్తలు", nameEn: "District News", slug: "district-news", color: "#EA580C", sortOrder: 8 },
    { name: "జాతీయం", nameEn: "National", slug: "national", color: "#4F46E5", sortOrder: 9 },
    { name: "అంతర్జాతీయం", nameEn: "International", slug: "international", color: "#0D9488", sortOrder: 10 },
    { name: "టెక్నాలజీ", nameEn: "Technology", slug: "technology", color: "#6366F1", sortOrder: 11 },
    { name: "ఆరోగ్యం", nameEn: "Health", slug: "health", color: "#EC4899", sortOrder: 12 },
    { name: "భక్తి", nameEn: "Devotional", slug: "devotional", color: "#F59E0B", sortOrder: 13 },
    { name: "రాశి ఫలాలు", nameEn: "Horoscope", slug: "rasi-phalalu", color: "#8B5CF6", sortOrder: 14 },
    { name: "ఉద్యోగాలు", nameEn: "Jobs", slug: "jobs", color: "#14B8A6", sortOrder: 15 },
    { name: "సినిమా రివ్యూలు", nameEn: "Movie Reviews", slug: "movie-reviews", color: "#F43F5E", sortOrder: 16 },
    { name: "పరీక్షా ఫలితాలు", nameEn: "Exam Results", slug: "exam-results", color: "#0EA5E9", sortOrder: 17 },
    { name: "వాతావరణం", nameEn: "Weather", slug: "weather", color: "#64748B", sortOrder: 18 },
    { name: "NRI వార్తలు", nameEn: "NRI News", slug: "nri", color: "#A855F7", sortOrder: 19 },
    { name: "నవ్యసీమ", nameEn: "Navyaseema", slug: "navyaseema", color: "#E11D48", sortOrder: 20 },
    { name: "రియల్ ఎస్టేట్", nameEn: "Real Estate", slug: "real-estate", color: "#D97706", sortOrder: 21 },
    { name: "సంపాదకీయం", nameEn: "Editorial", slug: "editorial", color: "#374151", sortOrder: 22 },
    // Categories surfaced from the "మరిన్ని" dropdown in header.tsx — added so the
    // links don't 404. Geographic + section pages even if we don't curate them yet.
    { name: "ఆంధ్రప్రదేశ్", nameEn: "Andhra Pradesh", slug: "andhra-pradesh", color: "#0891B2", sortOrder: 23 },
    { name: "తెలంగాణ", nameEn: "Telangana", slug: "telangana", color: "#DC2626", sortOrder: 24 },
    { name: "ఫీచర్ పేజీలు", nameEn: "Features", slug: "features", color: "#7C3AED", sortOrder: 25 },
    { name: "పాఠకుల లేఖలు", nameEn: "Reader Letters", slug: "reader-letters", color: "#475569", sortOrder: 26 },
    { name: "రాయలసీమ రుచులు", nameEn: "Rayalaseema Ruchulu", slug: "rayalaseema-ruchulu", color: "#D97706", sortOrder: 27 },
    { name: "ఎట్టెట", nameEn: "Yetteta", slug: "yetteta", color: "#EC4899", sortOrder: 28 },
    { name: "పజిల్స్", nameEn: "Puzzles", slug: "puzzles", color: "#16A34A", sortOrder: 29 },
    // E-paper v2.1 section sources
    { name: "వసుంధర", nameEn: "Vasundhara", slug: "vasundhara", color: "#DB2777", sortOrder: 30 },
    { name: "హాయ్ బుజ్జి", nameEn: "Hai Bujji", slug: "hai-bujji", color: "#F59E0B", sortOrder: 31 },
    { name: "ఆదివారం మాగజైన్", nameEn: "Sunday Magazine", slug: "sunday-magazine", color: "#7C3AED", sortOrder: 32 },
    { name: "శ్రద్ధాంజలి", nameEn: "Obituaries & Birthdays", slug: "obituaries", color: "#475569", sortOrder: 33 },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({ where: { slug: cat.slug }, update: cat, create: cat });
  }
  console.log(`  ${categories.length} categories created`);

  // ========== TAGS ==========
  const tags = [
    "AP", "Telangana", "Kurnool", "Anantapur", "Kadapa", "Chittoor",
    "Nandyal", "Tirupati", "Sri Sathya Sai", "Annamayya", "YSR", "Rayalaseema",
  ];
  for (const name of tags) {
    const slug = name.toLowerCase().replace(/\s+/g, "-");
    await prisma.tag.upsert({ where: { slug }, update: {}, create: { name, slug } });
  }
  console.log(`  ${tags.length} tags created`);

  // ========== DISTRICTS & CONSTITUENCIES ==========
  const districts = [
    { name: "కర్నూలు", nameEn: "Kurnool", slug: "kurnool", constituencies: ["Kurnool City", "Yemmiganur", "Nandyal", "Adoni", "Pattikonda"] },
    { name: "నంద్యాల", nameEn: "Nandyal", slug: "nandyal", constituencies: ["Nandyal", "Banaganapalli", "Koilkuntla", "Allagadda"] },
    { name: "అనంతపురం", nameEn: "Ananthapuramu", slug: "ananthapuramu", constituencies: ["Anantapur Urban", "Singanamala", "Kalyandurg", "Guntakal", "Dharmavaram"] },
    { name: "శ్రీ సత్యసాయి", nameEn: "Sri Sathya Sai", slug: "sri-sathya-sai", constituencies: ["Puttaparthi", "Penukonda", "Hindupur", "Madakasira"] },
    { name: "వై.యస్.ఆర్", nameEn: "YSR Kadapa", slug: "ysr-kadapa", constituencies: ["Kadapa", "Proddatur", "Mydukur", "Jammalamadugu", "Badvel"] },
    { name: "అన్నమయ్య", nameEn: "Annamayya", slug: "annamayya", constituencies: ["Rayachoti", "Rajampet", "Kodur", "Madanapalle"] },
    { name: "తిరుపతి", nameEn: "Tirupati", slug: "tirupati", constituencies: ["Tirupati", "Srikalahasti", "Sullurpeta", "Gudur", "Venkatagiri"] },
    { name: "చిత్తూరు", nameEn: "Chittoor", slug: "chittoor", constituencies: ["Chittoor", "Piler", "Kuppam", "Palamaner", "Punganur"] },
  ];

  for (const d of districts) {
    const district = await prisma.district.upsert({
      where: { slug: d.slug },
      update: { name: d.name, nameEn: d.nameEn },
      create: { name: d.name, nameEn: d.nameEn, slug: d.slug },
    });

    // Constituencies are now managed by packages/db/scripts/rebuild-constituencies.ts
    // (55 official ECI-numbered Rayalaseema ACs, delimitation 2024). Do NOT upsert here.
  }
  console.log(`  ${districts.length} districts upserted (constituencies handled by rebuild-constituencies.ts)`);

  // ========== BREAKING NEWS ==========
  await prisma.content.deleteMany({ where: { type: "BREAKING_NEWS" } });
  console.log("  Breaking news cleared (add real ones from admin)");

  // ========== SITE CONFIG ==========
  const configs = [
    { key: "brand_color", value: "#FF2C2C" },
    { key: "site_title", value: "రాయలసీమ ఎక్స్‌ప్రెస్" },
    { key: "site_description", value: "రాయలసీమ ప్రాంతం నుండి తాజా వార్తలు" },
    { key: "slider_count", value: "6" },
    { key: "homepage_layout", value: "eenadu" },
    { key: "ticker_speed", value: "60" },
    { key: "logo_url", value: "/logo.svg" },
    // Spec #4 A4 (#195) — analytics + indexing IDs. Default to empty; editor
    // populates via /settings → SEO & Analytics section. Frontend code already
    // gates script loading on truthy value (see apps/web/src/app/layout.tsx).
    { key: "bing_webmaster_id", value: "" },          // <meta name="msvalidate.01">
    { key: "clarity_project_id", value: "" },         // Microsoft Clarity heatmaps
    { key: "sentry_dsn_web", value: "" },             // apps/web error tracking
    { key: "sentry_dsn_admin", value: "" },           // apps/admin error tracking
    { key: "indexnow_key", value: "" },               // Bing IndexNow protocol
    { key: "google_news_publisher_id", value: "" },   // Google News Publisher Center publication id
  ];
  for (const cfg of configs) {
    await prisma.siteConfig.upsert({ where: { key: cfg.key }, update: {}, create: cfg });
  }
  console.log(`  ${configs.length} site config entries created`);

  // ========== SPEC #4 A2 — Author profile slug backfill ==========
  // Idempotent: only populates publicProfileSlug for users that don't have
  // one yet. Runs on every deploy via deploy.yml's `bunx tsx prisma/seed.ts`,
  // a no-op once everyone has a slug. New users get a slug auto-assigned
  // by the admin user create flow (separate change in Spec #4 A2 follow-up).
  const usersNeedingSlugs = await prisma.user.findMany({
    where: { publicProfileSlug: null, active: true },
    select: { id: true, name: true, email: true },
  });
  if (usersNeedingSlugs.length > 0) {
    console.log(`\nBackfilling publicProfileSlug for ${usersNeedingSlugs.length} active user(s)...`);
    for (const u of usersNeedingSlugs) {
      const baseSlug = (u.name || u.email.split("@")[0])
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 50) || "author";
      // Resolve collisions by suffixing -1, -2, ...
      let slug = baseSlug;
      let n = 1;
      // eslint-disable-next-line no-await-in-loop
      while (await prisma.user.findUnique({ where: { publicProfileSlug: slug } })) {
        slug = `${baseSlug}-${n++}`;
      }
      await prisma.user.update({ where: { id: u.id }, data: { publicProfileSlug: slug } });
      console.log(`  ${u.email} -> /author/${slug}`);
    }
  } else {
    console.log("\nAll active users already have publicProfileSlug — skipping backfill.");
  }

  console.log("\nSeed complete! (No dummy articles/videos/reels - add real content from admin)");
  console.log("  Admin: admin@rayalaseemaexpress.com / admin123");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
