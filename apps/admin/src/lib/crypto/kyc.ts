// Field-level encryption for KYC + banking PII (Aadhaar, PAN, bank account
// number). Uses AES-256-GCM via Node's built-in `crypto` module - no third-
// party deps, no external KMS round-trip per row.
//
// Storage format: "kyc1:<base64-iv>:<base64-ciphertext>:<base64-authtag>"
//   - "kyc1" version prefix lets us detect already-encrypted values (so
//     the backfill script is idempotent) and rotate to a "kyc2" scheme
//     later without breaking old rows.
//   - 12-byte IV (GCM standard, never reuse with the same key).
//   - 16-byte auth tag (default for createCipheriv with GCM).
//
// Key management: 32-byte key in env `KYC_ENCRYPTION_KEY` (base64-encoded).
// Generate one with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// To rotate: set `KYC_ENCRYPTION_KEY_NEW`, run the backfill in re-encrypt
// mode, swap env vars, drop the old key from env.
//
// Migration to Azure Key Vault: replace getKey() with an AKV fetch + cache.
// The encrypt/decrypt API stays the same so callers don't change.

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const VERSION = "kyc1";
const IV_LEN = 12;
const KEY_LEN = 32;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.KYC_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "KYC_ENCRYPTION_KEY is not set. Generate one with:\n" +
      `  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"\n` +
      "and add it to .env as KYC_ENCRYPTION_KEY=<base64>",
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== KEY_LEN) {
    throw new Error(
      `KYC_ENCRYPTION_KEY must decode to ${KEY_LEN} bytes (got ${buf.length}). ` +
      `Re-generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  cachedKey = buf;
  return buf;
}

// True when this value is already in our encrypted format. Lets callers
// avoid double-encrypting and lets the backfill skip rows already done.
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${VERSION}:`);
}

// Encrypt a plaintext string. Returns the versioned envelope; pass-through
// for nullish input (Aadhaar etc. can legitimately be null when not yet
// captured). If the value is *already* encrypted, returns it unchanged.
export function encrypt(plaintext: string | null | undefined): string | null {
  if (plaintext == null || plaintext === "") return null;
  if (isEncrypted(plaintext)) return plaintext;
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("base64")}:${ct.toString("base64")}:${tag.toString("base64")}`;
}

// Decrypt an encrypted envelope. Returns the plaintext, or the input
// unchanged if it's not in our encrypted format (back-compat for rows
// stored before encryption was rolled out - they remain readable).
//
// Throws only on a corrupted envelope (bad base64 / wrong auth tag / wrong
// key). Callers that handle a mix of trusted-and-untrusted ciphertexts
// should wrap in try/catch and treat decrypt failure as "data tampered".
export function decrypt(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (!isEncrypted(value)) return value; // plaintext legacy row - return as-is
  const parts = value.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid encrypted envelope shape");
  }
  const [, ivB64, ctB64, tagB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

// Convenience for the ReporterProfile shape - call on every read path that
// returns the profile to a client. Mutates a shallow copy; original input
// is left untouched. Decrypt failures are surfaced as null + console.error
// so a single corrupted row doesn't 500 the whole listing.
const ENCRYPTED_FIELDS = ["aadhaarNumber", "panNumber", "bankAccount"] as const;
type ProfileLike = Record<string, unknown> | null | undefined;

export function decryptProfileFields<T extends ProfileLike>(profile: T): T {
  if (!profile) return profile;
  const out = { ...profile } as Record<string, unknown>;
  for (const field of ENCRYPTED_FIELDS) {
    const v = out[field];
    if (typeof v === "string") {
      try {
        out[field] = decrypt(v);
      } catch (e) {
        console.error(`[kyc-crypto] decrypt failed for ${field}:`, e);
        out[field] = null;
      }
    }
  }
  return out as T;
}

// Mirror of decryptProfileFields for the write side - used when accepting
// an admin/reporter form submission that includes Aadhaar/PAN/bank fields.
export function encryptProfileFields<T extends Record<string, unknown>>(data: T): T {
  const out = { ...data } as Record<string, unknown>;
  for (const field of ENCRYPTED_FIELDS) {
    const v = out[field];
    if (typeof v === "string" && v.length > 0) {
      out[field] = encrypt(v);
    }
  }
  return out as T;
}
