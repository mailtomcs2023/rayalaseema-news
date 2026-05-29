import { NextRequest, NextResponse } from "next/server";
import type { ZodError } from "zod";
import { auth } from "@/lib/auth";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { validateActiveSession } from "@/lib/session-guard";

type Role = "ADMIN" | "EDITOR" | "SUB_EDITOR" | "REPORTER" | "USER";

interface AuthSession {
  user: { id: string; email: string; name: string; role: Role };
}

// Resolve the current session into either AuthSession or an error response.
// Internal - both requireAuth and requireCan delegate here so the session-
// fetch + 401-on-failure logic stays in one place.
async function resolveSession(): Promise<AuthSession | NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as any).id as string | undefined;
    // Force-logout for deleted/deactivated users. The JWT cookie is still
    // valid (NextAuth has no server-side invalidation), so without this
    // check a deleted/inactive admin could keep hitting protected APIs
    // until their cookie expires. Returning the sessionRevoked flag lets
    // the client clear its local state and bounce to /logout - pages get
    // the same treatment via the root layout.
    const state = await validateActiveSession(userId);
    if (state.status === "gone") {
      return NextResponse.json(
        { error: "Session revoked", sessionRevoked: true },
        { status: 401 },
      );
    }
    return {
      user: {
        id: userId!,
        email: session.user.email!,
        name: session.user.name!,
        role: (session.user as any).role as Role,
      },
    };
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/**
 * Authorize an API request against a named permission. Preferred over
 * `requireAuth([...])` - when "who can publish?" changes, you edit
 * `lib/permissions.ts` instead of finding every `requireAuth(["ADMIN",
 * "EDITOR"])` callsite.
 */
export async function requireCan(permission: Permission): Promise<AuthSession | NextResponse> {
  const result = await resolveSession();
  if (isAuthError(result)) return result;
  const allowed = PERMISSIONS[permission] as readonly Role[];
  if (!allowed.includes(result.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return result;
}

/**
 * Authenticate and authorize an API request against an explicit role list.
 * Kept for back-compat with existing callsites; new code should prefer
 * `requireCan(permission)` for centralized policy.
 */
export async function requireAuth(
  // Default = every staff role. USER is non-staff (public), so endpoints
  // that want to allow public users must opt in by passing it explicitly.
  allowedRoles: Role[] = ["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"]
): Promise<AuthSession | NextResponse> {
  const result = await resolveSession();
  if (isAuthError(result)) return result;
  if (!allowedRoles.includes(result.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return result;
}

/** Type guard: check if requireAuth returned an error response */
export function isAuthError(result: AuthSession | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}

/** Standardized error response (hides internals in production) */
export function apiError(error: unknown, status = 500): NextResponse {
  const message = process.env.NODE_ENV === "production"
    ? "Internal server error"
    : error instanceof Error ? error.message : "Unknown error";
  if (error instanceof Error) console.error("[API Error]", error.message);
  return NextResponse.json({ error: message }, { status });
}

/** Standardized success response */
export function apiSuccess(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/**
 * Build a 400 NextResponse from a Zod safeParse failure.
 *
 * Why this exists: Zod v4's `flatten().fieldErrors` is empty when a
 * `.strict()` schema rejects an unknown key - the actual culprit only
 * shows up under `error.issues` with `code: "unrecognized_keys"`. The
 * old "{ error: 'Invalid request body', fieldErrors: {} }" response
 * gave the caller nothing to act on. This helper:
 *   - names the offending keys in the top-level `error` message so the
 *     client toast surfaces them directly,
 *   - keeps `fieldErrors` for per-input form highlighting,
 *   - exposes the raw `issues` array for clients that want detail.
 */
export function zodErrorResponse(error: ZodError, status = 400): NextResponse {
  const issues = error.issues;
  const unrecognized = issues.find((i) => i.code === "unrecognized_keys");
  const message = unrecognized
    ? `Unexpected field(s) in request body: ${
        // The `keys` property is present on unrecognized_keys issues; the
        // type guard keeps TS happy without a full zod-internal import.
        (unrecognized as { keys?: string[] }).keys?.join(", ") ?? "unknown"
      }`
    : "Invalid request body";
  return NextResponse.json(
    {
      error: message,
      fieldErrors: error.flatten().fieldErrors,
      issues,
    },
    { status },
  );
}
