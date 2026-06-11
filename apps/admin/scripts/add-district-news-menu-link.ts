// One-off: add a "జిల్లా వార్తలు" → /district-news link into the HEADER menu's
// "మరిన్ని" (More) dropdown and persist it to the DB, mirroring what the admin
// Menu Builder publish flow does (validate with the shared Zod schema, snapshot
// a MenuVersion, promote to live `items`, mark published).
//
// Idempotent: re-running it is a no-op once the link exists.
//
// Run from apps/admin:  bun run scripts/add-district-news-menu-link.ts
import { prisma, MenuLocation, safeValidateMenuItems, type MenuItem } from "@rayalaseema/db";

const TARGET_URL = "/district-news";
const CHILD_LABEL = "జిల్లా వార్తలు";

function hasDistrictLink(item: MenuItem): boolean {
  return (item.children ?? []).some(
    (c) => c.target.type === "INTERNAL_URL" && c.target.url === TARGET_URL,
  );
}

async function main() {
  const menu = await prisma.menu.findUnique({ where: { location: MenuLocation.HEADER } });
  if (!menu) throw new Error("HEADER menu not found");

  // Work off the live published tree so the change goes straight to visitors.
  const items = (menu.items as unknown as MenuItem[]) ?? [];

  // The "మరిన్ని" dropdown is the label-only Heading (target NONE) that owns
  // children. Match by label first, then fall back to the first NONE-with-kids.
  let parent =
    items.find((it) => it.label.trim() === "మరిన్ని") ??
    items.find((it) => it.target.type === "NONE" && (it.children?.length ?? 0) > 0);

  if (!parent) throw new Error('Could not find the "మరిన్ని" dropdown heading in the HEADER menu');

  if (hasDistrictLink(parent)) {
    console.log('✓ "%s" → %s already present under "%s" - nothing to do.', CHILD_LABEL, TARGET_URL, parent.label);
    return;
  }

  parent.children = [
    ...(parent.children ?? []),
    {
      id: crypto.randomUUID(),
      label: CHILD_LABEL,
      icon: null,
      target: { type: "INTERNAL_URL", url: TARGET_URL },
      mobileVariant: "show",
      openInNewTab: false,
    },
  ];

  // Validate the whole tree exactly like the admin save/publish routes do, so a
  // bad shape is rejected before it ever lands in the DB.
  const validated = safeValidateMenuItems(items);
  if (!validated.success) {
    console.error("Validation failed:", validated.error.flatten().fieldErrors);
    throw new Error("Refusing to write an invalid menu tree");
  }

  // Snapshot the outgoing published state for the version history, mirroring the
  // publish route. editedById is a required FK, so attribute it to any admin;
  // skip the snapshot (non-essential) if there's no admin to credit.
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
  if (admin) {
    await prisma.menuVersion.create({
      data: { menuId: menu.id, items: menu.items as any, editedById: admin.id, editNote: "script: add district-news link" },
    });
  }

  await prisma.menu.update({
    where: { id: menu.id },
    data: {
      items: validated.data as any,
      isPublished: true,
      publishedAt: new Date(),
    },
  });

  console.log('✓ Added "%s" → %s under "%s" and published.', CHILD_LABEL, TARGET_URL, parent.label);
  console.log("  The web header will reflect it within ~15s (menu cache TTL).");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
