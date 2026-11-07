// Browser -> YouTube direct upload (Nov 2026). The admin server opens a
// resumable videos.insert session (/api/youtube/upload-session); the browser
// sends the file to that session in fixed-size chunks. Our servers never hold
// the video, so a 100 GB+ file is fine (YouTube's own cap: 256 GB / 12 h).
//
// Protocol (YouTube resumable upload):
//   PUT <session>  Content-Range: bytes a-b/total  -> 308 + Range: bytes=0-b (more)
//                                                 -> 200/201 + video JSON (done)
//   PUT <session>  Content-Range: bytes */total    -> status query, same answers
//   404/410 -> session expired (about a week) or cancelled; start again.
// Every chunk except the last must be a multiple of 256 KiB.

export const YT_MAX_BYTES = 256 * 1024 ** 3;
export const CHUNK_BYTES = 64 * 1024 * 1024; // 256 KiB multiple; ~1 min on a 10 Mbps uplink
export const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|mts|m2ts|mpg|mpeg|3gp|flv|wmv)$/i;
const VIDEO_TYPE = /^video\/[\w.+*-]+$/;

export function isVideoType(t: string): boolean {
  return VIDEO_TYPE.test(t);
}

/** The Content-Type to declare for a picked file ("" from Windows for .mkv/.mts etc.). */
export function videoContentType(file: { name: string; type: string }): string | null {
  if (isVideoType(file.type)) return file.type;
  return VIDEO_EXT.test(file.name) ? "video/*" : null;
}

/** The request Origin if it is the admin site (or localhost in dev); YouTube's CORS answer is bound to it. */
export function allowedUploadOrigin(origin: string | null, adminUrl: string | undefined, env = process.env.NODE_ENV): string | null {
  if (!origin) return null;
  try {
    if (adminUrl && new URL(adminUrl).origin === origin) return origin;
  } catch {
    /* bad NEXTAUTH_URL: fall through */
  }
  if (env !== "production" && /^http:\/\/localhost(:\d+)?$/.test(origin)) return origin;
  return null;
}

/** Bytes YouTube already holds, from a 308's Range header ("bytes=0-262143" -> 262144). */
export function nextOffset(range: string | null): number {
  const m = range?.match(/bytes=0-(\d+)/);
  return m ? Number(m[1]) + 1 : 0;
}

export class UploadSessionExpiredError extends Error {
  constructor() {
    super("The YouTube upload session expired; choose the file again to start over");
    this.name = "UploadSessionExpiredError";
  }
}

export type PutResult = { status: number; range: string | null; body: string };
export type Transport = {
  /** PUT to the session; rejects only on a network failure. */
  put: (url: string, body: Blob | null, headers: Record<string, string>, onProgress?: (sentInChunk: number) => void) => Promise<PutResult>;
  sleep: (ms: number) => Promise<void>;
};

export type UploadOpts = {
  sessionUrl: string;
  file: Blob;
  contentType: string;
  transport: Transport;
  chunkBytes?: number;
  maxRetries?: number;
  onProgress?: (sent: number, total: number) => void;
  isCancelled?: () => boolean;
};

function videoIdFrom(r: PutResult): string {
  try {
    const id = (JSON.parse(r.body) as { id?: string }).id;
    if (id) return id;
  } catch {
    /* fall through */
  }
  throw new Error(`YouTube finished the upload but returned no video id (${r.status})`);
}

/** Upload (or resume) the file into the session; resolves with the YouTube video id. */
export async function uploadToYouTube(o: UploadOpts): Promise<string> {
  const size = o.file.size;
  const chunk = o.chunkBytes ?? CHUNK_BYTES;
  const maxRetries = o.maxRetries ?? 30; // ~25 min of outage at the 60 s back-off cap
  const done = (s: number) => s === 200 || s === 201;
  const expired = (s: number) => s === 404 || s === 410;

  // Where to (re)start: ask the session how much it already has.
  const query = async (): Promise<number | string> => {
    const r = await o.transport.put(o.sessionUrl, null, { "Content-Range": `bytes */${size}` });
    if (done(r.status)) return videoIdFrom(r);
    if (expired(r.status)) throw new UploadSessionExpiredError();
    if (r.status === 308) return nextOffset(r.range);
    throw new Error(`YouTube upload status check failed (${r.status}): ${r.body.slice(0, 200)}`);
  };

  let failures = 0;
  // Back off, then ask the session where it is; repeats while the network is down.
  const retry = async (why: string): Promise<number | string> => {
    for (;;) {
      failures += 1;
      if (failures > maxRetries) throw new Error(`Upload stopped after ${maxRetries} retries: ${why}`);
      await o.transport.sleep(Math.min(60_000, 2_000 * 2 ** (failures - 1)));
      try {
        return await query();
      } catch (e) {
        if (e instanceof UploadSessionExpiredError) throw e;
        why = (e as Error).message || why;
      }
    }
  };

  let at: number | string;
  try {
    at = await query();
  } catch (e) {
    if (e instanceof UploadSessionExpiredError) throw e;
    at = await retry((e as Error).message);
  }

  while (typeof at === "number") {
    if (o.isCancelled?.()) throw new Error("Upload cancelled");
    o.onProgress?.(at, size);
    const end = Math.min(at + chunk, size);
    const start = at;
    let r: PutResult;
    try {
      r = await o.transport.put(
        o.sessionUrl,
        o.file.slice(start, end),
        { "Content-Range": `bytes ${start}-${end - 1}/${size}`, "Content-Type": o.contentType },
        (n) => o.onProgress?.(start + n, size),
      );
    } catch (e) {
      at = await retry((e as Error).message || "network error");
      continue;
    }
    if (done(r.status)) return videoIdFrom(r);
    if (r.status === 308) {
      at = nextOffset(r.range);
      failures = 0;
      continue;
    }
    if (expired(r.status)) throw new UploadSessionExpiredError();
    if (r.status >= 500 || r.status === 429) {
      at = await retry(`YouTube answered ${r.status}`);
      continue;
    }
    throw new Error(`YouTube rejected the upload (${r.status}): ${r.body.slice(0, 200)}`);
  }
  o.onProgress?.(size, size);
  return at;
}

/** XHR transport (upload progress events, streams the Blob slice from disk). */
export const xhrTransport: Transport = {
  put: (url, body, headers, onProgress) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
      if (onProgress) xhr.upload.onprogress = (e) => onProgress(e.loaded);
      xhr.onload = () => resolve({ status: xhr.status, range: xhr.getResponseHeader("Range"), body: xhr.responseText || "" });
      xhr.onerror = () => reject(new Error("network error"));
      xhr.ontimeout = () => reject(new Error("timeout"));
      xhr.send(body);
    }),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

// Resume across page reloads: the session URL is kept per file (name, size,
// modified time) in this browser only, for up to 6 days.
const KEY = (f: File) => `yt-upload:${f.name}:${f.size}:${f.lastModified}`;
const MAX_AGE_MS = 6 * 24 * 3600_000;

export function savedSession(f: File): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY(f)) || "null") as { url: string; at: number } | null;
    return v && Date.now() - v.at < MAX_AGE_MS ? v.url : null;
  } catch {
    return null;
  }
}
export function saveSession(f: File, url: string | null): void {
  try {
    if (url) localStorage.setItem(KEY(f), JSON.stringify({ url, at: Date.now() }));
    else localStorage.removeItem(KEY(f));
  } catch {
    /* storage blocked: resume just won't survive a reload */
  }
}
