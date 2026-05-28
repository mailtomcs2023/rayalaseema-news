// Editorial approval workflow state machine for e-paper editions.
//
//   DRAFT
//     │ submit (operator role: any editorial)
//     ▼
//   SUB_REVIEW
//     │ approve (SUB_EDITOR / EDITOR / ADMIN)                  │ reject (note required)
//     ▼                                                         ▼
//   CHIEF_REVIEW                                              REJECTED → operator reopens to DRAFT
//     │ approve (EDITOR / ADMIN)                               │ reject (note required)
//     ▼                                                         ▼
//   APPROVED                                                  REJECTED → operator reopens to DRAFT
//     │ publish (EDITOR / ADMIN)
//     ▼
//   PUBLISHED  (terminal — unpublish goes back to DRAFT)
//
// Every transition checks the user's role against an allow-list and writes
// a row to the audit log so we have a complete who-did-what trail.

import type { EpaperWorkflowState } from "@prisma/client";

type Role = "ADMIN" | "EDITOR" | "SUB_EDITOR" | "REPORTER";

export interface Transition {
  from: EpaperWorkflowState;
  to: EpaperWorkflowState;
  allowedRoles: Role[];
  /** Human label rendered on the action button in the editor. */
  label: string;
  /** Force a note on this transition (e.g. rejection reason). */
  noteRequired?: boolean;
}

export const TRANSITIONS: Transition[] = [
  { from: "DRAFT",        to: "SUB_REVIEW",    allowedRoles: ["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"], label: "Submit for sub-editor review" },
  { from: "SUB_REVIEW",   to: "CHIEF_REVIEW",  allowedRoles: ["ADMIN", "EDITOR", "SUB_EDITOR"], label: "Pass to chief editor" },
  { from: "SUB_REVIEW",   to: "REJECTED",      allowedRoles: ["ADMIN", "EDITOR", "SUB_EDITOR"], label: "Reject", noteRequired: true },
  { from: "CHIEF_REVIEW", to: "APPROVED",      allowedRoles: ["ADMIN", "EDITOR"], label: "Approve" },
  { from: "CHIEF_REVIEW", to: "REJECTED",      allowedRoles: ["ADMIN", "EDITOR"], label: "Reject", noteRequired: true },
  { from: "APPROVED",     to: "PUBLISHED",     allowedRoles: ["ADMIN", "EDITOR"], label: "Publish" },
  { from: "REJECTED",     to: "DRAFT",         allowedRoles: ["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"], label: "Reopen as draft" },
  { from: "PUBLISHED",    to: "DRAFT",         allowedRoles: ["ADMIN", "EDITOR"], label: "Unpublish" },
  // Retraction — terminal kill from PUBLISHED. Note required (carries the
  // reason that surfaces on /epaper/corrections).
  { from: "PUBLISHED",    to: "KILLED",        allowedRoles: ["ADMIN", "EDITOR"], label: "🗑 Kill / retract", noteRequired: true },
];

/** Returns every transition the given role can apply FROM the given state. */
export function availableTransitions(from: EpaperWorkflowState, role: Role): Transition[] {
  return TRANSITIONS.filter((t) => t.from === from && t.allowedRoles.includes(role));
}

/** Validates that role can apply the transition. Returns reason string if not. */
export function canTransition(from: EpaperWorkflowState, to: EpaperWorkflowState, role: Role): string | null {
  const t = TRANSITIONS.find((x) => x.from === from && x.to === to);
  if (!t) return `Transition ${from} → ${to} is not allowed`;
  if (!t.allowedRoles.includes(role)) return `Role ${role} cannot perform ${from} → ${to}`;
  return null;
}

export function transitionMeta(from: EpaperWorkflowState, to: EpaperWorkflowState): Transition | null {
  return TRANSITIONS.find((x) => x.from === from && x.to === to) ?? null;
}
