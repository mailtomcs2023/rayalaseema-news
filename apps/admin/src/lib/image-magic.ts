// Verifies the first bytes of an uploaded buffer match the MIME the client
// claimed. Stops a renamed `evil.html → evil.jpg` from being accepted as an
// image just because the multipart form set Content-Type: image/jpeg.
//
// Returns the canonical MIME inferred from the bytes, or null if the bytes
// don't match any allowed image format. Callers should reject when the
// inferred MIME doesn't match the declared one.

const SIGNATURES: { mime: string; matches: (b: Buffer) => boolean }[] = [
  // JPEG: FF D8 FF
  { mime: "image/jpeg", matches: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  {
    mime: "image/png",
    matches: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  // GIF: "GIF87a" or "GIF89a"
  {
    mime: "image/gif",
    matches: (b) =>
      b.length >= 6 &&
      b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 &&
      (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61,
  },
  // WebP: "RIFF" .... "WEBP"
  {
    mime: "image/webp",
    matches: (b) =>
      b.length >= 12 &&
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  // AVIF: ISO-BMFF box "ftyp" at offset 4, brand "avif" / "avis" / "mif1" / "heic"
  {
    mime: "image/avif",
    matches: (b) => {
      if (b.length < 12) return false;
      if (b[4] !== 0x66 || b[5] !== 0x74 || b[6] !== 0x79 || b[7] !== 0x70) return false;
      const brand = b.slice(8, 12).toString("ascii");
      return ["avif", "avis", "mif1", "heic", "heix"].includes(brand);
    },
  },
];

/** Sniffs the buffer and returns the detected image MIME, or null. */
export function sniffImageMime(buf: Buffer): string | null {
  for (const sig of SIGNATURES) {
    if (sig.matches(buf)) return sig.mime;
  }
  return null;
}
