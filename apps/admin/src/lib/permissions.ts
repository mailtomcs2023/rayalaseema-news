// Single source of truth for "who can do what" across the admin API.
//
// Routes call `requireCan("content.publish")` instead of inlining the role
// list. When the rules change (e.g. "let Sub-Editors publish breaking news"),
// you edit this file - not 113 API route files.
//
// Naming convention: `<resource>.<verb>`, lowercase, dot-separated.
//   - resource: noun matching the DB / domain model (content, user, category…)
//   - verb:     create | read | update | delete | publish | review | verify-kyc | manage
//
// `manage` is shorthand for "all CRUD on this resource"; use it sparingly
// (admin-only ops). Prefer narrow verbs.

import type { Role } from "@prisma/client";

// Named permission → which roles are allowed.
// IMPORTANT: list roles explicitly. Do NOT add hierarchy/inheritance code -
// "Admin > Editor" feels obvious but creates bugs when a permission's
// allowed set deviates from the order. Always say it out loud.
export const PERMISSIONS = {
  // ----- User & access management (ADMIN-only) -----
  "user.manage":             ["ADMIN"],
  "user.delete":             ["ADMIN"],
  "settings.write":          ["ADMIN"],
  "ad.manage":               ["ADMIN"],
  "category.manage":         ["ADMIN"],
  "desk.manage":             ["ADMIN"],
  "payment.manage":          ["ADMIN"],
  "audit.read":              ["ADMIN"],
  "reporter.verify-kyc":     ["ADMIN"],
  "reporter.reset-password": ["ADMIN"],
  // Editors review + decide on profile change requests alongside admins -
  // they already manage the reporter pool, so KYC/profile field changes
  // fall within their remit. If you want to tighten to admin-only,
  // change the `decide` entry to ["ADMIN"] and routes auto-follow.
  "profile-request.review":  ["ADMIN", "EDITOR"],
  "profile-request.decide":  ["ADMIN", "EDITOR"],

  // ----- Editorial leadership (ADMIN + EDITOR) -----
  "content.publish":         ["ADMIN", "EDITOR"],
  "content.delete":          ["ADMIN", "EDITOR"],
  "content.assign":          ["ADMIN", "EDITOR"],
  "content.pib-approve":     ["ADMIN", "EDITOR"],
  "menu.write":              ["ADMIN", "EDITOR"],
  "template.write":          ["ADMIN", "EDITOR"],
  "epaper.publish":          ["ADMIN", "EDITOR"],
  "comment.moderate":        ["ADMIN", "EDITOR"],

  // ----- Review queue (ADMIN + EDITOR + SUB_EDITOR) -----
  "content.review":          ["ADMIN", "EDITOR", "SUB_EDITOR"],
  "content.approve":         ["ADMIN", "EDITOR", "SUB_EDITOR"],
  "content.reject":          ["ADMIN", "EDITOR", "SUB_EDITOR"],

  // ----- Any staff write (all editorial roles) -----
  "content.create":          ["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"],
  "content.read":            ["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"],
  "content.update.own":      ["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"],
  "media.upload":            ["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"],
  "ai.rewrite":              ["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

// Lookup: does this role have this permission? Centralised so future
// extensions (e.g. per-user overrides) plug in here, not across the API.
export function roleCan(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
