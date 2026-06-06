// Legacy geo article route. Articles now live at
// /telugu-news/<district>/<constituency>/<slug> (see lib/article-href.ts).
// This old /<district>/<constituency>/<slug>-<id8> path stays only to
// 301-redirect already-indexed / shared links to the new canonical URL.

import { notFound, permanentRedirect } from "next/navigation";
import { getArticleBySlug } from "@/lib/db-queries";
import { articleHref, parseSlugId } from "@/lib/article-href";

type Params = Promise<{ district: string; constituency: string; slugid: string }>;

async function findArticle(slugid: string) {
  const parsed = parseSlugId(slugid);
  if (parsed) {
    const a = await getArticleBySlug(parsed.slug);
    if (a?.slug) return a;
  }
  const a2 = await getArticleBySlug(slugid);
  return a2?.slug ? a2 : null;
}

export default async function LegacyGeoArticleRedirect({ params }: { params: Params }) {
  const { slugid } = await params;
  const article = await findArticle(slugid);
  if (!article) return notFound();
  permanentRedirect(articleHref(article as never));
}
