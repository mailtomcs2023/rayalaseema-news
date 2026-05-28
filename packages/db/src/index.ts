import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Soft-delete auto-filter (Spec #1 follow-up - see Content.deletedAt).
// Every `content.findMany / findFirst / count / aggregate` call gets
// `deletedAt: null` injected into its where clause unless the caller
// explicitly sets `deletedAt` (e.g. trash view = `deletedAt: { not: null }`).
// findUnique stays untouched so internal flows that lookup by id keep
// working (the route handlers add their own visibility checks).
function injectSoftDeleteFilter(args: any) {
  const where = args?.where ?? {};
  if (where.deletedAt !== undefined) return args;
  return { ...args, where: { ...where, deletedAt: null } };
}

function buildClient() {
  const base = new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
  return base.$extends({
    query: {
      content: {
        findMany({ args, query }) { return query(injectSoftDeleteFilter(args)); },
        findFirst({ args, query }) { return query(injectSoftDeleteFilter(args)); },
        count({ args, query }) { return query(injectSoftDeleteFilter(args)); },
        aggregate({ args, query }) { return query(injectSoftDeleteFilter(args)); },
        groupBy({ args, query }) {
          const where = args?.where ?? {};
          if (where.deletedAt !== undefined) return query(args);
          return query({ ...args, where: { ...where, deletedAt: null } });
        },
      },
    },
  }) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? buildClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Re-export named enums + the `Prisma` namespace from @prisma/client.
//
// We previously used `export * from "@prisma/client"`, but Turbopack can't
// statically analyse a CommonJS module's exports, so every Next.js route
// that imports `@rayalaseema/db` printed an `unexpected export *` warning
// on each compile. Listing names explicitly tells the bundler exactly what
// is re-exported and silences the warning.
//
// Add a name here when a consumer needs to import a new Prisma enum / type
// via `@rayalaseema/db`.
export {
  Prisma,
  PrismaClient,
  Role,
  ArticleStatus,
  Language,
  MediaType,
  EpaperWorkflowState,
  EpaperImageAssetCategory,
  EpaperTemplateType,
  SocialPlatform,
  SocialPostStatus,
  DeskBranch,
  AdPosition,
  KycStatus,
  ProfileUpdateRequestStatus,
  PaymentStatus,
  ContentType,
  MenuLocation,
  MenuItemTargetType,
} from "@prisma/client";

export * from "./payload-schemas";
export * from "./content-input-schemas";
export * from "./user-input-schemas";
export * from "./taxonomy-input-schemas";
export * from "./menu-schemas";
export * from "./page-builder-schemas";
export * from "./page-builder-pattern";
export default prisma;
