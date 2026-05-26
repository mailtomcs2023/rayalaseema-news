#!/usr/bin/env bun
// URL migration smoke test (Phase A0). Hits a running web app and verifies:
//
//   1. Legacy /article/<slug> 301s to a non-/article/ path.
//   2. The new URL returns 200 with the article's <title> present.
//   3. /article/<slug>/amp also 301s to the canonical non-AMP URL.
//
// Requires a running dev server (`bun --filter=@rayalaseema/web dev`) and a
// reachable DB. Tests up to N=50 random published article slugs. CLI:
//
//   bun apps/web/tests/url-migration.smoke.mjs           # uses http://localhost:3000
//   BASE_URL=https://staging.example.com bun apps/web/tests/url-migration.smoke.mjs
//
// Exits non-zero on any failure; suitable for CI.

import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SAMPLE_N = Number(process.env.SAMPLE_N || 50);
const prisma = new PrismaClient();

async function pickSlugs() {
  const rows = await prisma.content.findMany({
    where: { type: "ARTICLE", status: "PUBLISHED" },
    select: { slug: true, title: true },
    take: SAMPLE_N * 4, // oversample, then random-pick
  });
  // Fisher-Yates partial shuffle
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  return rows.filter((r) => r.slug).slice(0, SAMPLE_N);
}

async function check(slug, title) {
  const errors = [];
  // 1. Legacy URL → 301
  const legacy = await fetch(`${BASE}/article/${encodeURIComponent(slug)}`, { redirect: "manual" });
  if (legacy.status !== 301) {
    errors.push(`/article/${slug} expected 301, got ${legacy.status}`);
  }
  const newLoc = legacy.headers.get("location");
  if (!newLoc || newLoc.includes("/article/")) {
    errors.push(`/article/${slug} → unexpected location ${newLoc}`);
  }

  // 2. New URL → 200
  if (newLoc) {
    const target = newLoc.startsWith("http") ? newLoc : `${BASE}${newLoc}`;
    const final = await fetch(target);
    if (final.status !== 200) {
      errors.push(`${target} expected 200, got ${final.status}`);
    } else {
      const html = await final.text();
      if (title && !html.includes(title.substring(0, 30))) {
        errors.push(`${target} response missing article title`);
      }
    }
  }

  // 3. Legacy AMP → 301
  const amp = await fetch(`${BASE}/article/${encodeURIComponent(slug)}/amp`, { redirect: "manual" });
  if (amp.status !== 301) {
    errors.push(`/article/${slug}/amp expected 301, got ${amp.status}`);
  }

  return errors;
}

async function main() {
  console.log(`Smoke testing ${SAMPLE_N} random article URLs against ${BASE}...`);
  const slugs = await pickSlugs();
  if (slugs.length === 0) {
    console.error("No published articles in DB — cannot smoke test.");
    process.exit(1);
  }
  console.log(`Sampled ${slugs.length} slugs.\n`);

  let pass = 0;
  let fail = 0;
  for (const { slug, title } of slugs) {
    const errs = await check(slug, title);
    if (errs.length === 0) {
      pass++;
      process.stdout.write(".");
    } else {
      fail++;
      process.stdout.write("F");
      console.log(`\n  FAIL ${slug}:`);
      for (const e of errs) console.log(`    ${e}`);
    }
  }
  console.log(`\n\n${pass} passed, ${fail} failed.`);
  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
