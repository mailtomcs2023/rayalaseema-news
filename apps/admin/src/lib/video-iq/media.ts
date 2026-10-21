// ffmpeg / ffprobe wrappers for Video IQ. Input may be a local path or an
// https URL (blob SAS); ffmpeg reads both. Output comes back in memory and
// the caller decides what to keep (frames go to blob, audio goes to Azure
// Speech and is dropped). Uses child_process so it runs under Bun or Node.
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile, rm } from "node:fs/promises";

export type Probe = { durationSec: number; width: number; height: number; hasAudio: boolean };

const scratch = (ext: string) => join(tmpdir(), `viq-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);

function run(cmd: string, args: string[], timeoutMs = 10 * 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} ${args[0] ?? ""}: ${String(stderr || err.message).trim().slice(0, 500)}`));
      else resolve(String(stdout));
    });
  });
}

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await run("ffmpeg", ["-version"], 10_000);
    return true;
  } catch {
    return false;
  }
}

export async function probe(src: string): Promise<Probe> {
  const out = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", src], 60_000);
  const j = JSON.parse(out) as {
    streams: Array<{ codec_type: string; width?: number; height?: number }>;
    format: { duration?: string };
  };
  const v = j.streams.find((s) => s.codec_type === "video");
  return {
    durationSec: Number(j.format.duration ?? 0),
    width: v?.width ?? 0,
    height: v?.height ?? 0,
    hasAudio: j.streams.some((s) => s.codec_type === "audio"),
  };
}

/** Mono 16 kHz 48 kbps mp3, the smallest input Azure fast transcription accepts well. */
export async function extractAudioMp3(src: string): Promise<Uint8Array> {
  const p = await probe(src);
  if (!p.hasAudio) throw new Error("no audio track in video");
  const out = scratch("mp3");
  try {
    await run("ffmpeg", ["-y", "-v", "error", "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", out]);
    return new Uint8Array(await readFile(out));
  } finally {
    await rm(out, { force: true });
  }
}

/** One JPEG per timestamp, scaled to 1280 px wide. */
export async function extractFrames(src: string, times: number[]): Promise<Uint8Array[]> {
  const frames: Uint8Array[] = [];
  for (const t of times) {
    const out = scratch("jpg");
    try {
      await run("ffmpeg", ["-y", "-v", "error", "-ss", String(t), "-i", src, "-frames:v", "1", "-vf", "scale=1280:-2", "-q:v", "3", out], 120_000);
      frames.push(new Uint8Array(await readFile(out)));
    } finally {
      await rm(out, { force: true });
    }
  }
  return frames;
}
