// CMYK separation pipeline (#101).
//
// Press shops expect a CMYK PDF with a press ICC profile embedded; web
// rendering uses sRGB. Pure-JS color conversion isn't viable for production
// (Lab→CMYK math + ink-limit rendering needs real Postscript). We shell to
// Ghostscript when GHOSTSCRIPT_BIN is set in env.
//
// Install on production (Azure VM Ubuntu):
//   sudo apt-get install -y ghostscript icc-profiles-free
//   echo 'GHOSTSCRIPT_BIN=/usr/bin/gs' >> /etc/environment
//
// Optional: drop ISO Coated v2 profile to /opt/icc/ISOcoated_v2_eci.icc and
// set CMYK_ICC_PROFILE to that path so render picks press-grade gamut.

import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

export function isCmykEnabled(): boolean {
  return !!process.env.GHOSTSCRIPT_BIN;
}

function runGhostscript(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const gs = spawn(process.env.GHOSTSCRIPT_BIN!, args);
    let stdout = ""; let stderr = "";
    gs.stdout.on("data", (d) => { stdout += d.toString(); });
    gs.stderr.on("data", (d) => { stderr += d.toString(); });
    gs.on("error", reject);
    gs.on("close", (code) => resolve({ stdout, stderr, code: code ?? -1 }));
  });
}

export async function convertPdfToCmyk(srcBytes: Uint8Array): Promise<Uint8Array> {
  if (!isCmykEnabled()) throw new Error("Ghostscript not configured - set GHOSTSCRIPT_BIN");
  const dir = await mkdtemp(join(tmpdir(), "re-cmyk-"));
  const inPath = join(dir, "in.pdf");
  const outPath = join(dir, "out.pdf");
  try {
    await writeFile(inPath, srcBytes);
    const args = [
      "-dNOPAUSE", "-dBATCH", "-dQUIET",
      "-sDEVICE=pdfwrite",
      "-dPDFSETTINGS=/prepress",
      "-sColorConversionStrategy=CMYK",
      "-sProcessColorModel=DeviceCMYK",
      "-dConvertCMYKImagesToRGB=false",
      "-dPreserveOverprintSettings=true",
    ];
    if (process.env.CMYK_ICC_PROFILE) {
      args.push(`-sOutputICCProfile=${process.env.CMYK_ICC_PROFILE}`);
    }
    args.push(`-sOutputFile=${outPath}`, inPath);
    const r = await runGhostscript(args);
    if (r.code !== 0) throw new Error(`Ghostscript failed (${r.code}): ${r.stderr.slice(0, 500)}`);
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
