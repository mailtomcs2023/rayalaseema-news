// Legacy constituency route. Constituencies moved to the nested canonical URL
// /[district]/[constituency] (see lib/constituency-href.ts). This route now
// 301-redirects old /constituency/<slug> links to the new path so existing
// links and indexed URLs keep working.
import { notFound, permanentRedirect } from "next/navigation";
import { prisma } from "@rayalaseema/db";
import { constituencyHref } from "@/lib/constituency-href";

export default async function LegacyConstituencyRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const constituency = await prisma.constituency.findUnique({
    where: { slug },
    select: { slug: true, district: { select: { slug: true } } },
  });
  if (!constituency) return notFound();
  permanentRedirect(constituencyHref(constituency.district.slug, constituency.slug));
}
