// LOCAL DEV ONLY: import published ARTICLE content from the live public API
// (https://rayalaseemanews.com/api/articles) into the database that
// DATABASE_URL points at - so you have real content to develop against
// without VM/DB access.
//
// What it does:
//   - Paginates through ALL published articles via /api/articles.
//   - Upserts each article's category by slug (creates if missing).
//   - Creates/reuses one local placeholder user per distinct prod author
//     (keyed by a deterministic email) to preserve bylines. These users
//     can't log in (placeholder password hash, REPORTER role).
//   - Upserts each article by slug - re-running is idempotent (skips ones
//     that already exist locally).
//   - Drops prod-only FK ids we can't map locally (desk, constituency,
//     reviewers) so inserts don't violate foreign keys.
//
// ⚠️ Writes to whatever DATABASE_URL resolves to. Run against a LOCAL dev DB
//    only - never production. (packages/db/.env points at localhost.)
//
// Run:  cd packages/db && bunx tsx scripts/import-articles-from-api.ts
//       (override source with IMPORT_API_BASE=http://localhost:3000)

import { prisma } from "../src/index";

const API = process.env.IMPORT_API_BASE || "https://rayalaseemanews.com";
const PAGE = 100;

interface ApiArticle {
  id: string;
  title: string;
  slug: string | null;
  summary: string | null;
  body: string | null;
  featuredImage: string | null;
  payload: unknown;
  featured: boolean;
  publishedAt: string | null;
  category: { name: string; nameEn: string | null; slug: string; color: string | null } | null;
  author: { id: string; name: string } | null;
}

async function ensureAuthor(a: ApiArticle["author"]): Promise<string> {
  const key = a?.id || "unknown";
  const name = a?.name?.trim() || "Imported Author";
  const email = `imported-${key}@imported.local`;
  const user = await prisma.user.upsert({
    where: { email },
    update: { name },
    create: { email, name, passwordHash: "imported-no-login", role: "REPORTER" },
    select: { id: true },
  });
  return user.id;
}

async function ensureCategory(c: ApiArticle["category"]): Promise<string | null> {
  if (!c?.slug) return null;
  const cat = await prisma.category.upsert({
    where: { slug: c.slug },
    update: {},
    create: {
      slug: c.slug,
      name: c.name || c.slug,
      nameEn: c.nameEn ?? undefined,
      color: c.color ?? undefined,
    },
    select: { id: true },
  });
  return cat.id;
}

async function main() {
  console.log(`[import] source: ${API}/api/articles  ->  local DB`);
  let offset = 0;
  let total = Infinity;
  let imported = 0;
  let skipped = 0;

  while (offset < total) {
    const url = `${API}/api/articles?limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText} (${url})`);
    const data = (await res.json()) as { articles: ApiArticle[]; total: number };
    total = data.total ?? 0;
    const batch = data.articles ?? [];
    if (batch.length === 0) break;

    for (const art of batch) {
      if (!art.slug) { skipped++; continue; }
      const existing = await prisma.content.findUnique({
        where: { slug: art.slug },
        select: { id: true },
      });
      if (existing) { skipped++; continue; }

      const authorId = await ensureAuthor(art.author);
      const categoryId = await ensureCategory(art.category);

      await prisma.content.create({
        data: {
          type: "ARTICLE",
          status: "PUBLISHED",
          title: art.title,
          slug: art.slug,
          summary: art.summary ?? undefined,
          body: art.body ?? undefined,
          featuredImage: art.featuredImage ?? undefined,
          payload: (art.payload as never) ?? undefined,
          featured: !!art.featured,
          authorId,
          categoryId: categoryId ?? undefined,
          publishedAt: art.publishedAt ? new Date(art.publishedAt) : new Date(),
          // prod-only FKs (desk / constituency / reviewers) intentionally omitted.
        },
      });
      imported++;
    }

    offset += batch.length;
    console.log(`[import] processed ${offset}/${total}  (imported ${imported}, skipped ${skipped})`);
  }

  console.log(`[import] DONE. imported=${imported}, skipped(existing/no-slug)=${skipped}, reported total=${total}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
