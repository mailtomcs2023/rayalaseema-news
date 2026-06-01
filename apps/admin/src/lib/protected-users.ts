// Seed accounts that ship with every deploy via packages/db/prisma/seed.ts.
// These rows MUST always exist - they back the canonical role test logins
// (admin / editor / sub-editor / reporter) used in QA, the README, and the
// onboarding doc, and the deploy script re-upserts them every run, so
// allowing a delete would just put the system in a confusing "deleted but
// resurrects on next deploy" state.
//
// Both /api/users/[id] DELETE and the /users page row menu read this list:
// the server returns 403 if asked to delete one, the UI hides the Delete
// menu item entirely so the option never surfaces.
//
// To rotate a seed account: update prisma/seed.ts (which controls the
// canonical row) and bump the deploy. To grant edit access to a different
// admin, create a NEW user with role=ADMIN - don't try to delete the seed.
export const PROTECTED_USER_EMAILS: ReadonlySet<string> = new Set([
  "admin@rayalaseemanews.com",
  "editor@rayalaseemanews.com",
  "subeditor@rayalaseemanews.com",
  "reporter@rayalaseemanews.com",
]);

/** Case-insensitive check - matches the canonicalization in lib/email.ts. */
export function isProtectedUser(email: string | null | undefined): boolean {
  if (!email) return false;
  return PROTECTED_USER_EMAILS.has(email.trim().toLowerCase());
}
