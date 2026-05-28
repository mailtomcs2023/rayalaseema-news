// Prisma-free entry point - re-exports the Zod schemas that don't drag
// PrismaClient into the bundle. Safe to import from client components:
//
//   import { deskCreateSchema } from "@rayalaseema/db/schemas";
//
// IMPORTANT: only add a re-export here if the target file has ZERO
// imports from "@prisma/client" (not even type-only - Zod's `z.literal()`
// needs the runtime value, which forces Prisma to evaluate).
//
// Currently excluded - these read enum values from @prisma/client:
//   - payload-schemas        (ContentType, MediaType, …)
//   - content-input-schemas  (ContentType, ArticleStatus, …)
//   - menu-schemas           (MenuLocation, MenuItemTargetType)
// If a client form ever needs them, first refactor the offending file
// to use a hard-coded `as const` tuple instead of the Prisma enum
// (the tuple should match the Prisma enum exactly).
//
// The default `@rayalaseema/db` entry still exports everything alongside
// `prisma`, so server code keeps working unchanged.

export * from "./user-input-schemas";
export * from "./taxonomy-input-schemas";
export * from "./page-builder-schemas";
export * from "./page-builder-pattern";
