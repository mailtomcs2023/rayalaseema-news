import crypto from "crypto";
import { prisma } from "@rayalaseema/db";

// Token auth for the reporter (Expo) app.
//
// A stateless, HMAC-signed token (a minimal JWT): base64url(payload).base64url(sig).
// Issued at login, sent by the app as `Authorization: Bearer <token>`, and
// verified here so reporter endpoints derive identity from the token rather
// than trusting an id passed in the URL.
const SECRET =
  process.env.REPORTER_TOKEN_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  "dev-insecure-reporter-secret";

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const sign = (body: string) =>
  crypto.createHmac("sha256", SECRET).update(body).digest("base64url");

// Issues a signed token carrying the reporter's user id.
export function createReporterToken(userId: string): string {
  const body = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + TTL_MS }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

// Verifies a token's signature + expiry; returns the user id, or null.
export function verifyReporterToken(token?: string | null): string | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = sign(body);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  try {
    const { uid, exp } = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof uid !== "string" || typeof exp !== "number" || exp < Date.now()) return null;
    return uid;
  } catch {
    return null;
  }
}

// Pulls the bearer token off a request and returns the reporter's user id,
// OR null if (a) the token is missing/invalid/expired, OR (b) the user has
// been deactivated in the admin portal since the token was issued.
//
// The DB check on (b) is what makes "admin toggles reporter inactive →
// reporter's Expo app force-logs-out" work: the next API call returns 401,
// and the app's `api()` clears the stored token and bounces to /login.
export async function getReporterId(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  const uid = verifyReporterToken(token);
  if (!uid) return null;
  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: { active: true },
  });
  if (!user || !user.active) return null;
  return uid;
}
