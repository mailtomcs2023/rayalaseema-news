// Minimal YouTube Data API v3 client built on fetch. Every call reports its
// quota cost through `onUnits` BEFORE the request goes out, so a ledger can
// refuse writes that would blow the day's budget. `dryRun` logs writes
// instead of sending them, which is how the publish path is exercised on a
// fresh deploy before the owner flips it live.
import { COSTS, type CostLabel } from "./costs";

const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3";

export class YouTubeQuotaError extends Error {
  constructor(m = "YouTube quota exceeded") {
    super(m);
    this.name = "YouTubeQuotaError";
  }
}
export class YouTubeAuthError extends Error {
  constructor(m: string) {
    super(m);
    this.name = "YouTubeAuthError";
  }
}

export type VideoSnippet = {
  title: string;
  description: string;
  tags: string[];
  categoryId: "25";
  defaultLanguage: "te";
  defaultAudioLanguage: "te";
};
export type VideoStatus = {
  privacyStatus: "public" | "private" | "unlisted";
  publishAt?: string;
  selfDeclaredMadeForKids: false;
  embeddable?: boolean;
  license?: "youtube";
};
export type ClientOpts = {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  dryRun?: boolean;
  onUnits?: (units: number, label: string) => Promise<void>;
  fetchImpl?: typeof fetch;
};

const DRY_RUN_VIDEO_ID = "DRYRUN00000";

export function createYouTubeClient(o: ClientOpts) {
  const f = o.fetchImpl ?? fetch;
  let cached: { tok: string; exp: number } | null = null;
  const units = async (label: CostLabel) => {
    if (o.onUnits) await o.onUnits(COSTS[label], label);
  };

  async function token(): Promise<string> {
    if (cached && cached.exp > Date.now() + 60_000) return cached.tok;
    const res = await f("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: o.clientId,
        client_secret: o.clientSecret,
        refresh_token: o.refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.text();
    if (!res.ok) throw new YouTubeAuthError(`token refresh failed: ${res.status} ${body.slice(0, 200)}`);
    const j = JSON.parse(body) as { access_token: string; expires_in: number };
    cached = { tok: j.access_token, exp: Date.now() + j.expires_in * 1000 };
    return cached.tok;
  }

  async function raw(method: string, url: string, body?: BodyInit, headers: Record<string, string> = {}) {
    const res = await f(url, {
      method,
      headers: { Authorization: `Bearer ${await token()}`, ...headers },
      body,
      signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text();
    if (!res.ok) {
      if (text.includes("quotaExceeded") || text.includes("dailyLimitExceeded")) throw new YouTubeQuotaError();
      if (res.status === 401) throw new YouTubeAuthError(`401 ${text.slice(0, 200)}`);
      throw new Error(`${method} ${url.replace(API, "")} -> ${res.status} ${text.slice(0, 300)}`);
    }
    return { text, headers: res.headers };
  }

  async function get<T>(path: string, label: CostLabel): Promise<T> {
    await units(label);
    return JSON.parse((await raw("GET", `${API}/${path}`)).text) as T;
  }

  async function write<T>(method: "POST" | "PUT" | "DELETE", path: string, body: unknown, label: CostLabel): Promise<T | null> {
    await units(label);
    if (o.dryRun) {
      console.log(`[yt dry-run] ${method} ${path} ${body ? JSON.stringify(body).slice(0, 200) : ""}`);
      return null;
    }
    const r = await raw(method, `${API}/${path}`, body ? JSON.stringify(body) : undefined, { "Content-Type": "application/json" });
    return r.text ? (JSON.parse(r.text) as T) : null;
  }

  return {
    get,
    write,

    async getVideos(ids: string[]) {
      return get<{ items: any[] }>(`videos?part=snippet,contentDetails,status,statistics&id=${ids.join(",")}`, "videos.list");
    },

    async listMyPlaylists(): Promise<Array<{ id: string; title: string }>> {
      const r = await get<{ items: any[] }>("playlists?part=snippet&mine=true&maxResults=50", "playlists.list");
      return (r.items ?? []).map((p) => ({ id: p.id as string, title: p.snippet.title as string }));
    },

    async listUploads(channelId: string, max = 50): Promise<string[]> {
      const uploads = "UU" + channelId.slice(2);
      const r = await get<{ items: any[] }>(`playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=${Math.min(max, 50)}`, "playlistItems.list");
      return (r.items ?? []).map((i) => i.contentDetails.videoId as string);
    },

    async listCaptions(videoId: string): Promise<any[]> {
      return (await get<{ items: any[] }>(`captions?part=snippet&videoId=${videoId}`, "captions.list")).items ?? [];
    },

    async downloadCaption(captionId: string): Promise<string> {
      await units("captions.download");
      return (await raw("GET", `${API}/captions/${captionId}?tfmt=srt`)).text;
    },

    async uploadVideo(a: { bytes: Uint8Array | ReadableStream<Uint8Array>; sizeBytes: number; snippet: VideoSnippet; status: VideoStatus }): Promise<string> {
      await units("videos.insert");
      if (o.dryRun) {
        console.log(`[yt dry-run] videos.insert "${a.snippet.title}" (${a.sizeBytes} bytes)`);
        return DRY_RUN_VIDEO_ID;
      }
      const init = await raw(
        "POST",
        `${UPLOAD}/videos?uploadType=resumable&part=snippet,status`,
        JSON.stringify({ snippet: a.snippet, status: a.status }),
        { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/*", "X-Upload-Content-Length": String(a.sizeBytes) },
      );
      const session = init.headers.get("Location");
      if (!session) throw new Error("resumable upload: no session URL in response");
      const res = await f(session, {
        method: "PUT",
        headers: { "Content-Length": String(a.sizeBytes), "Content-Type": "video/*" },
        body: a.bytes as BodyInit,
        // Needed for streaming request bodies in fetch implementations that support it.
        ...({ duplex: "half" } as object),
        signal: AbortSignal.timeout(30 * 60_000),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`upload PUT -> ${res.status} ${text.slice(0, 300)}`);
      return (JSON.parse(text) as { id: string }).id;
    },

    async setThumbnail(videoId: string, jpeg: Uint8Array): Promise<void> {
      await units("thumbnails.set");
      if (o.dryRun) {
        console.log(`[yt dry-run] thumbnails.set ${videoId} (${jpeg.byteLength} bytes)`);
        return;
      }
      await raw("POST", `${UPLOAD}/thumbnails/set?videoId=${videoId}&uploadType=media`, jpeg as BodyInit, { "Content-Type": "image/jpeg" });
    },

    async addToPlaylist(playlistId: string, videoId: string): Promise<void> {
      await write("POST", "playlistItems?part=snippet", { snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } }, "playlistItems.insert");
    },

    async setLocalizations(videoId: string, localizations: Record<string, { title: string; description: string }>): Promise<void> {
      await write("PUT", "videos?part=localizations", { id: videoId, localizations }, "videos.update");
    },

    async updateSnippetStatus(videoId: string, snippet: VideoSnippet, status: VideoStatus, recordingDetails?: { locationDescription?: string }): Promise<void> {
      const parts = recordingDetails ? "snippet,status,recordingDetails" : "snippet,status";
      await write("PUT", `videos?part=${parts}`, { id: videoId, snippet, status, ...(recordingDetails ? { recordingDetails } : {}) }, "videos.update");
    },

    async insertComment(videoId: string, text: string): Promise<void> {
      if (/https?:\/\//i.test(text)) throw new Error("comments must not contain URLs");
      await write("POST", "commentThreads?part=snippet", { snippet: { videoId, topLevelComment: { snippet: { textOriginal: text } } } }, "commentThreads.insert");
    },
  };
}

export type YouTubeClient = ReturnType<typeof createYouTubeClient>;
