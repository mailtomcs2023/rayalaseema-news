// ffmpeg / ffprobe wrappers for Video IQ. Input may be a local path or an
// https URL (blob); a remote source is downloaded once to a temp file and
// every ffmpeg call reads that file, which avoids ffmpeg's HTTPS demuxing
// quirks (moov-at-end seeks, partial reads) and five separate range fetches.
// Output comes back in memory and the caller decides what to keep.
// Uses child_process so it runs under Bun or Node.
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile, rm, writeFile } from "node:fs/promises";

export type Probe = { durationSec: number; width: number; height: number; hasAudio: boolean };

const scratch = (ext: string) => join(tmpdir(), `viq-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB, YouTube's practical ceiling for us

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

/** Run `fn` with a local path: the source itself, or a temp download of a remote URL (deleted afterwards). */
export async function withLocalSource<T>(src: string, fn: (path: string) => Promise<T>): Promise<T> {
  if (!/^https?:\/\//i.test(src)) return fn(src);
  const res = await fetch(src, { signal: AbortSignal.timeout(15 * 60_000) });
  if (!res.ok) throw new Error(`fetch ${res.status} for ${src.split("?")[0]}`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_DOWNLOAD_BYTES) throw new Error(`video too large to download (${len} bytes)`);
  const ext = src.split("?")[0].match(/\.(mp4|mov|webm|mkv|m4v)$/i)?.[1] ?? "mp4";
  const local = scratch(ext);
  try {
    await writeFile(local, new Uint8Array(await res.arrayBuffer()));
    return await fn(local);
  } finally {
    await rm(local, { force: true });
  }
}

async function probeLocal(path: string): Promise<Probe> {
  const out = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", path], 60_000);
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

export function probe(src: string): Promise<Probe> {
  return withLocalSource(src, probeLocal);
}

/** Mono 16 kHz 48 kbps mp3, the smallest input Azure fast transcription accepts well. */
export function extractAudioMp3(src: string): Promise<Uint8Array> {
  return withLocalSource(src, async (path) => {
    const p = await probeLocal(path);
    if (!p.hasAudio) throw new Error("no audio track in video");
    const out = scratch("mp3");
    try {
      await run("ffmpeg", ["-y", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", out]);
      return new Uint8Array(await readFile(out));
    } finally {
      await rm(out, { force: true });
    }
  });
}

/** One JPEG per timestamp, scaled to 1280 px wide. */
export function extractFrames(src: string, times: number[]): Promise<Uint8Array[]> {
  return withLocalSource(src, async (path) => {
    const frames: Uint8Array[] = [];
    for (const t of times) {
      const out = scratch("jpg");
      try {
        await run("ffmpeg", ["-y", "-v", "error", "-ss", String(t), "-i", path, "-frames:v", "1", "-vf", "scale=1280:-2", "-q:v", "3", out], 120_000);
        frames.push(new Uint8Array(await readFile(out)));
      } finally {
        await rm(out, { force: true });
      }
    }
    return frames;
  });
}

/** Probe and frames from one download (what the QUEUED stage needs). */
export function probeAndFrames(src: string, positions: number[]): Promise<{ probe: Probe; times: number[]; frames: Uint8Array[] }> {
  return withLocalSource(src, async (path) => {
    const p = await probeLocal(path);
    const times = positions.map((f) => Math.max(0.5, p.durationSec * f));
    const frames = await extractFrames(path, times);
    return { probe: p, times, frames };
  });
}
