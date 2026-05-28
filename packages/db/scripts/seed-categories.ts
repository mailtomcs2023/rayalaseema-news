/**
 * Idempotent seed for the site's content categories + a small starter tag set.
 * Mirrors the lists that used to live in prisma/seed.ts.
 *
 * Run:  cd packages/db && bun run scripts/seed-categories.ts
 */
import { prisma } from "../src/index";

const categories = [
  { name: "రాజకీయాలు",       nameEn: "Politics",            slug: "politics",            color: "#FF2C2C", sortOrder: 1 },
  { name: "నేరాలు",            nameEn: "Crime",               slug: "crime",               color: "#7C3AED", sortOrder: 2 },
  { name: "క్రీడలు",           nameEn: "Sports",              slug: "sports",              color: "#16A34A", sortOrder: 3 },
  { name: "బిజినెస్",          nameEn: "Business",            slug: "business",            color: "#2563EB", sortOrder: 4 },
  { name: "సినిమా",            nameEn: "Entertainment",       slug: "entertainment",       color: "#DB2777", sortOrder: 5 },
  { name: "విద్య",             nameEn: "Education",           slug: "education",           color: "#0891B2", sortOrder: 6 },
  { name: "వ్యవసాయం",          nameEn: "Agriculture",         slug: "agriculture",         color: "#65A30D", sortOrder: 7 },
  { name: "జిల్లా వార్తలు",      nameEn: "District News",       slug: "district-news",       color: "#EA580C", sortOrder: 8 },
  { name: "జాతీయం",            nameEn: "National",            slug: "national",            color: "#4F46E5", sortOrder: 9 },
  { name: "అంతర్జాతీయం",      nameEn: "International",       slug: "international",       color: "#0D9488", sortOrder: 10 },
  { name: "టెక్నాలజీ",         nameEn: "Technology",          slug: "technology",          color: "#6366F1", sortOrder: 11 },
  { name: "ఆరోగ్యం",           nameEn: "Health",              slug: "health",              color: "#EC4899", sortOrder: 12 },
  { name: "భక్తి",             nameEn: "Devotional",          slug: "devotional",          color: "#F59E0B", sortOrder: 13 },
  { name: "రాశి ఫలాలు",        nameEn: "Horoscope",           slug: "rasi-phalalu",        color: "#8B5CF6", sortOrder: 14 },
  { name: "ఉద్యోగాలు",         nameEn: "Jobs",                slug: "jobs",                color: "#14B8A6", sortOrder: 15 },
  { name: "సినిమా రివ్యూలు",    nameEn: "Movie Reviews",       slug: "movie-reviews",       color: "#F43F5E", sortOrder: 16 },
  { name: "పరీక్షా ఫలితాలు",   nameEn: "Exam Results",        slug: "exam-results",        color: "#0EA5E9", sortOrder: 17 },
  { name: "వాతావరణం",          nameEn: "Weather",             slug: "weather",             color: "#64748B", sortOrder: 18 },
  { name: "NRI వార్తలు",       nameEn: "NRI News",            slug: "nri",                 color: "#A855F7", sortOrder: 19 },
  { name: "నవ్యసీమ",           nameEn: "Navyaseema",          slug: "navyaseema",          color: "#E11D48", sortOrder: 20 },
  { name: "రియల్ ఎస్టేట్",     nameEn: "Real Estate",         slug: "real-estate",         color: "#D97706", sortOrder: 21 },
  { name: "సంపాదకీయం",         nameEn: "Editorial",           slug: "editorial",           color: "#374151", sortOrder: 22 },
  { name: "ఆంధ్రప్రదేశ్",      nameEn: "Andhra Pradesh",      slug: "andhra-pradesh",      color: "#0891B2", sortOrder: 23 },
  { name: "తెలంగాణ",          nameEn: "Telangana",           slug: "telangana",           color: "#DC2626", sortOrder: 24 },
  { name: "ఫీచర్ పేజీలు",      nameEn: "Features",            slug: "features",            color: "#7C3AED", sortOrder: 25 },
  { name: "పాఠకుల లేఖలు",      nameEn: "Reader Letters",      slug: "reader-letters",      color: "#475569", sortOrder: 26 },
  { name: "రాయలసీమ రుచులు",    nameEn: "Rayalaseema Ruchulu", slug: "rayalaseema-ruchulu", color: "#D97706", sortOrder: 27 },
  { name: "ఎట్టెట",            nameEn: "Yetteta",             slug: "yetteta",             color: "#EC4899", sortOrder: 28 },
  { name: "పజిల్స్",           nameEn: "Puzzles",             slug: "puzzles",             color: "#16A34A", sortOrder: 29 },
  { name: "వసుంధర",            nameEn: "Vasundhara",          slug: "vasundhara",          color: "#DB2777", sortOrder: 30 },
  { name: "హాయ్ బుజ్జి",       nameEn: "Hai Bujji",           slug: "hai-bujji",           color: "#F59E0B", sortOrder: 31 },
  { name: "ఆదివారం మాగజైన్",   nameEn: "Sunday Magazine",     slug: "sunday-magazine",     color: "#7C3AED", sortOrder: 32 },
  { name: "శ్రద్ధాంజలి",        nameEn: "Obituaries & Birthdays", slug: "obituaries",      color: "#475569", sortOrder: 33 },
];

const tags = [
  "AP", "Telangana", "Kurnool", "Anantapur", "Kadapa", "Chittoor",
  "Nandyal", "Tirupati", "Sri Sathya Sai", "Annamayya", "YSR", "Rayalaseema",
];

async function main() {
  for (const cat of categories) {
    await prisma.category.upsert({ where: { slug: cat.slug }, update: cat, create: cat });
  }
  console.log(`  ✓ ${categories.length} categories upserted`);

  for (const name of tags) {
    const slug = name.toLowerCase().replace(/\s+/g, "-");
    await prisma.tag.upsert({ where: { slug }, update: {}, create: { name, slug } });
  }
  console.log(`  ✓ ${tags.length} tags upserted`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
