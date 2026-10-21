// Short-lived (10 min) HMAC token so the mobile app can hand the PDF URL to
// the OS browser without putting the 30-day reporter token in a URL.
import crypto from "node:crypto";
const SECRET = process.env.REPORTER_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || "dev-insecure-reporter-secret";
const TTL_MS = 10 * 60 * 1000;
const sign = (body: string) => crypto.createHmac("sha256", SECRET).update(`pdf:${body}`).digest("base64url");

export function createDownloadToken(cardId: string, now: number = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ c: cardId, exp: now + TTL_MS })).toString("base64url");
  return `${body}.${sign(body)}`;
}
export function verifyDownloadToken(token: string, now: number = Date.now()): string | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { c, exp } = JSON.parse(Buffer.from(body, "base64url").toString());
    return typeof c === "string" && typeof exp === "number" && exp > now ? c : null;
  } catch { return null; }
}
