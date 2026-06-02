// One-off (idempotent) account merge: fold the legacy seed admin
// admin@rayalaseemaexpress.com into the live admin@rayalaseemanews.com,
// then delete the legacy account.
//
// Why: the rayalaseemaexpress.com -> rayalaseemanews.com rebrand left the
// original seed admin (inactive, ~235 articles) stranded under the old
// domain email. We reassign every owned row to the live admin so byline /
// ownership consolidates, then remove the dead account.
//
// Safety:
//   - Idempotent: if the old account is already gone, it no-ops (exit 0).
//   - Aborts (no delete) if the target admin@rayalaseemanews.com is missing.
//   - Single transaction: the whole reassign + delete commits, or nothing.
//   - The deploy runs a pg_dump backup immediately before this script.
//
// FK handling (all 15 User relations):
//   Reassigned (required, would otherwise block delete): Content.authorId,
//     ContentRevision.editedById, ContentPayment.journalistId,
//     Media.uploadedById, EpaperComment.authorId, Template.createdById,
//     TemplateVersion.editedById, CompositeBlock.createdById,
//     MenuVersion.editedById.
//   Reassigned (optional, to preserve them): Content.assignedReviewerId,
//     EpaperEditionSnapshot.snappedById.
//   Auto on delete: AuditLog.actorId + ProfileUpdateRequest.reviewedById
//     set null (denormalized actorEmail/actorRole keep history);
//     UserCategory + ReporterProfile cascade-delete.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const OLD_EMAIL = "admin@rayalaseemaexpress.com";
const NEW_EMAIL = "admin@rayalaseemanews.com";

async function main() {
  const [oldUser, newUser] = await Promise.all([
    prisma.user.findUnique({ where: { email: OLD_EMAIL } }),
    prisma.user.findUnique({ where: { email: NEW_EMAIL } }),
  ]);

  if (!oldUser) {
    console.log(`[merge-legacy-admin] ${OLD_EMAIL} not found - already merged/absent. No-op.`);
    return;
  }
  if (!newUser) {
    throw new Error(
      `[merge-legacy-admin] Target ${NEW_EMAIL} not found - aborting. ` +
        `Will NOT delete ${OLD_EMAIL}.`,
    );
  }
  if (oldUser.id === newUser.id) {
    throw new Error("[merge-legacy-admin] Old and new resolve to the same user - aborting.");
  }

  const oldId = oldUser.id;
  const newId = newUser.id;
  console.log(`[merge-legacy-admin] Merging ${OLD_EMAIL} (${oldId}) -> ${NEW_EMAIL} (${newId})`);

  const counts = await prisma.$transaction(async (tx) => {
    const c: Record<string, number> = {};
    c["content.author"] = (await tx.content.updateMany({ where: { authorId: oldId }, data: { authorId: newId } })).count;
    c["content.reviewer"] = (await tx.content.updateMany({ where: { assignedReviewerId: oldId }, data: { assignedReviewerId: newId } })).count;
    c["contentRevision"] = (await tx.contentRevision.updateMany({ where: { editedById: oldId }, data: { editedById: newId } })).count;
    c["contentPayment"] = (await tx.contentPayment.updateMany({ where: { journalistId: oldId }, data: { journalistId: newId } })).count;
    c["media"] = (await tx.media.updateMany({ where: { uploadedById: oldId }, data: { uploadedById: newId } })).count;
    c["epaperComment"] = (await tx.epaperComment.updateMany({ where: { authorId: oldId }, data: { authorId: newId } })).count;
    c["epaperSnapshot"] = (await tx.epaperEditionSnapshot.updateMany({ where: { snappedById: oldId }, data: { snappedById: newId } })).count;
    c["template"] = (await tx.template.updateMany({ where: { createdById: oldId }, data: { createdById: newId } })).count;
    c["templateVersion"] = (await tx.templateVersion.updateMany({ where: { editedById: oldId }, data: { editedById: newId } })).count;
    c["compositeBlock"] = (await tx.compositeBlock.updateMany({ where: { createdById: oldId }, data: { createdById: newId } })).count;
    c["menuVersion"] = (await tx.menuVersion.updateMany({ where: { editedById: oldId }, data: { editedById: newId } })).count;

    // Legacy account removed last. UserCategory + ReporterProfile cascade;
    // AuditLog.actorId + ProfileUpdateRequest.reviewedById set null.
    await tx.user.delete({ where: { id: oldId } });
    return c;
  });

  console.log("[merge-legacy-admin] Reassigned row counts:");
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  console.log(`[merge-legacy-admin] Deleted ${OLD_EMAIL}. Merge complete.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
