import { promises as dns } from "node:dns";
import net from "node:net";

// Server-Side Request Forgery guard for outbound fetches that take a
// user-supplied URL (currently /api/ai/rewrite's "scrape source URL" path).
//
// Prefix-matching the hostname (e.g. blocking "10." / "192.168.") misses:
//   • Hostnames that resolve to private IPs (DNS rebinding, evil.com → 127.0.0.1)
//   • Cloud metadata endpoints (169.254.169.254 → AWS/Azure creds)
//   • IPv6 loopback / link-local / private (::1, fe80::, fc00::)
//
// The fix is to resolve the hostname to its actual IPs and check each one
// against well-known dangerous ranges before issuing the fetch.

const PRIVATE_V4: { start: number; end: number; label: string }[] = (() => {
  const ip = (a: number, b: number, c: number, d: number) => (a << 24 >>> 0) + (b << 16) + (c << 8) + d;
  return [
    { start: ip(0, 0, 0, 0),       end: ip(0, 255, 255, 255),   label: "current network" },
    { start: ip(10, 0, 0, 0),      end: ip(10, 255, 255, 255),  label: "RFC1918 10/8" },
    { start: ip(100, 64, 0, 0),    end: ip(100, 127, 255, 255), label: "CGNAT 100.64/10" },
    { start: ip(127, 0, 0, 0),     end: ip(127, 255, 255, 255), label: "loopback" },
    { start: ip(169, 254, 0, 0),   end: ip(169, 254, 255, 255), label: "link-local / cloud metadata" },
    { start: ip(172, 16, 0, 0),    end: ip(172, 31, 255, 255),  label: "RFC1918 172.16/12" },
    { start: ip(192, 0, 0, 0),     end: ip(192, 0, 0, 255),     label: "IETF protocol assignments" },
    { start: ip(192, 0, 2, 0),     end: ip(192, 0, 2, 255),     label: "TEST-NET-1" },
    { start: ip(192, 168, 0, 0),   end: ip(192, 168, 255, 255), label: "RFC1918 192.168/16" },
    { start: ip(198, 18, 0, 0),    end: ip(198, 19, 255, 255),  label: "benchmark" },
    { start: ip(198, 51, 100, 0),  end: ip(198, 51, 100, 255),  label: "TEST-NET-2" },
    { start: ip(203, 0, 113, 0),   end: ip(203, 0, 113, 255),   label: "TEST-NET-3" },
    { start: ip(224, 0, 0, 0),     end: ip(239, 255, 255, 255), label: "multicast" },
    { start: ip(240, 0, 0, 0),     end: ip(255, 255, 255, 255), label: "reserved / broadcast" },
  ];
})();

function ipv4ToInt(addr: string): number | null {
  const parts = addr.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n << 8) + v;
  }
  return n >>> 0;
}

function isPrivateV4(addr: string): { blocked: true; reason: string } | null {
  const n = ipv4ToInt(addr);
  if (n === null) return null;
  for (const r of PRIVATE_V4) {
    if (n >= r.start && n <= r.end) return { blocked: true, reason: r.label };
  }
  return null;
}

function isPrivateV6(addr: string): { blocked: true; reason: string } | null {
  const lower = addr.toLowerCase().replace(/^\[|\]$/g, "");
  if (lower === "::" || lower === "::1") return { blocked: true, reason: "IPv6 loopback / unspecified" };
  if (lower.startsWith("fe80") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
    return { blocked: true, reason: "IPv6 link-local" };
  }
  // fc00::/7 — unique local addresses (private)
  if (lower.startsWith("fc") || lower.startsWith("fd")) {
    return { blocked: true, reason: "IPv6 unique local" };
  }
  // ::ffff:0:0/96 — IPv4-mapped — unwrap and recheck against v4 ranges
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice(7);
    return isPrivateV4(v4);
  }
  return null;
}

export interface SafetyResult {
  safe: boolean;
  reason?: string;
}

/**
 * Resolves the URL's hostname and verifies every IP it points at is publicly
 * routable. Resolves with `{ safe: false, reason }` for any disallowed target.
 *
 * Pass the resolved IP back to the caller's `fetch()` (via the `Host:` header
 * trick) if you want to guarantee a Time-of-Check vs Time-of-Use safety. For
 * the current low-volume use case, blocking before fetch is enough — DNS
 * rebinding on a freshly-validated hostname is impractical inside a single
 * 10-second scrape call.
 */
export async function isUrlSafeToFetch(rawUrl: string): Promise<SafetyResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, reason: "Invalid URL" };
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { safe: false, reason: `Protocol ${parsed.protocol} not allowed` };
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "");

  // If the host is already a literal IP, skip DNS and check directly.
  const literalFamily = net.isIP(host);
  if (literalFamily === 4) {
    const v4 = isPrivateV4(host);
    if (v4) return { safe: false, reason: `Resolves to ${v4.reason}` };
    return { safe: true };
  }
  if (literalFamily === 6) {
    const v6 = isPrivateV6(host);
    if (v6) return { safe: false, reason: `Resolves to ${v6.reason}` };
    return { safe: true };
  }

  // Hostname — resolve A + AAAA and check every result.
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return { safe: false, reason: `Hostname suffix not allowed (${host})` };
  }

  let addrs: { address: string; family: number }[];
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch (e: any) {
    return { safe: false, reason: `DNS lookup failed: ${e?.code || e?.message || "unknown"}` };
  }
  if (!addrs.length) return { safe: false, reason: "No DNS records" };

  for (const a of addrs) {
    const r = a.family === 6 ? isPrivateV6(a.address) : isPrivateV4(a.address);
    if (r) return { safe: false, reason: `${host} resolves to ${a.address} (${r.reason})` };
  }
  return { safe: true };
}
