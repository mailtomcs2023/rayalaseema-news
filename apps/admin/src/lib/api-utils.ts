import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

type Role = "ADMIN" | "EDITOR" | "CHIEF_SUB_EDITOR" | "SUB_EDITOR" | "REPORTER";

interface AuthSession {
  user: { id: string; email: string; name: string; role: Role };
}

/**
 * Authenticate and authorize an API request.
 * Returns the session if authorized, or a NextResponse error if not.
 */
export async function requireAuth(
  allowedRoles: Role[] = ["ADMIN", "EDITOR", "CHIEF_SUB_EDITOR", "SUB_EDITOR", "REPORTER"]
): Promise<AuthSession | NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const role = (session.user as any).role as Role;
    if (!allowedRoles.includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return {
      user: {
        id: (session.user as any).id,
        email: session.user.email!,
        name: session.user.name!,
        role,
      },
    };
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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
