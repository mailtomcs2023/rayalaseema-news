import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PERMISSIONS, type Permission } from "@/lib/permissions";

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
    return {
      user: {
        id: (session.user as any).id,
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
