// Public render for GrapesJS visual pages: serves the exported HTML + CSS for a
// published VisualPage at /page/<slug>. Free-form designs render standalone
// (the design includes its own layout); no site header/footer is injected.
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@rayalaseema/db";

export const revalidate = 60;

const db = prisma as unknown as {
  visualPage: {
    findUnique: (a: unknown) => Promise<{ name: string; html: string | null; css: string | null; isPublished: boolean } | null>;
  };
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await db.visualPage.findUnique({ where: { slug }, select: { name: true, isPublished: true } as unknown as undefined });
  if (!page || !page.isPublished) return { title: "Not found" };
  return { title: page.name };
}

export default async function VisualPageRender({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await db.visualPage.findUnique({
    where: { slug },
    select: { name: true, html: true, css: true, isPublished: true } as unknown as undefined,
  });
  if (!page || !page.isPublished) return notFound();
  return (
    <>
      {page.css ? <style dangerouslySetInnerHTML={{ __html: page.css }} /> : null}
      <div dangerouslySetInnerHTML={{ __html: page.html || "" }} />
    </>
  );
}
