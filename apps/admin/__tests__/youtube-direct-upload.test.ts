import { describe, test, expect } from "bun:test";
import {
  uploadToYouTube, nextOffset, allowedUploadOrigin, videoContentType, UploadSessionExpiredError,
  type Transport, type PutResult,
} from "../src/lib/youtube-direct-upload";

// A fake YouTube session: stores bytes, answers 308/200 like the real API,
// and can be told to drop the connection on given PUT numbers.
function fakeSession(size: number, opts: { failOn?: number[]; status5xxOn?: number[]; gone?: boolean } = {}) {
  let held = 0;
  let n = 0;
  const log: string[] = [];
  const transport: Transport = {
    sleep: async () => {},
    put: async (_url, body, headers): Promise<PutResult> => {
      n += 1;
      const cr = headers["Content-Range"];
      log.push(cr);
      if (opts.gone) return { status: 404, range: null, body: "" };
      if (opts.failOn?.includes(n)) throw new Error("network error");
      if (opts.status5xxOn?.includes(n)) return { status: 503, range: null, body: "busy" };
      if (body) {
        const m = cr.match(/bytes (\d+)-(\d+)\/(\d+)/)!;
        expect(Number(m[1])).toBe(held); // never skips or overlaps
        expect(body.size).toBe(Number(m[2]) - Number(m[1]) + 1);
        held = Number(m[2]) + 1;
      }
      if (held >= size) return { status: 200, range: null, body: JSON.stringify({ id: "VIDEOID1234" }) };
      return { status: 308, range: held ? `bytes=0-${held - 1}` : null, body: "" };
    },
  };
  return { transport, log, held: () => held };
}

const blob = (n: number) => new Blob([new Uint8Array(n)]);

describe("uploadToYouTube", () => {
  test("uploads in chunks and returns the video id", async () => {
    const s = fakeSession(10);
    const seen: number[] = [];
    const id = await uploadToYouTube({ sessionUrl: "u", file: blob(10), contentType: "video/mp4", transport: s.transport, chunkBytes: 4, onProgress: (a) => seen.push(a) });
    expect(id).toBe("VIDEOID1234");
    expect(s.log).toEqual(["bytes */10", "bytes 0-3/10", "bytes 4-7/10", "bytes 8-9/10"]);
    expect(seen.includes(4) && seen.includes(8)).toBe(true);
  });

  test("resumes from where YouTube is after a dropped connection", async () => {
    const s = fakeSession(12, { failOn: [3] }); // 1 = query, 2 = chunk 0-3, 3 = drops
    const id = await uploadToYouTube({ sessionUrl: "u", file: blob(12), contentType: "video/mp4", transport: s.transport, chunkBytes: 4 });
    expect(id).toBe("VIDEOID1234");
    expect(s.log).toEqual(["bytes */12", "bytes 0-3/12", "bytes 4-7/12", "bytes */12", "bytes 4-7/12", "bytes 8-11/12"]);
  });

  test("retries a 5xx via a status query", async () => {
    const s = fakeSession(8, { status5xxOn: [2] });
    expect(await uploadToYouTube({ sessionUrl: "u", file: blob(8), contentType: "video/mp4", transport: s.transport, chunkBytes: 4 })).toBe("VIDEOID1234");
  });

  test("an expired session is reported, not retried", async () => {
    const s = fakeSession(8, { gone: true });
    await expect(uploadToYouTube({ sessionUrl: "u", file: blob(8), contentType: "video/mp4", transport: s.transport })).rejects.toBeInstanceOf(UploadSessionExpiredError);
    expect(s.log.length).toBe(1);
  });

  test("gives up after maxRetries", async () => {
    const s = fakeSession(8, { failOn: [2, 3, 4, 5, 6, 7, 8, 9] });
    await expect(uploadToYouTube({ sessionUrl: "u", file: blob(8), contentType: "video/mp4", transport: s.transport, chunkBytes: 4, maxRetries: 2 })).rejects.toThrow(/after 2 retries/);
  });

  test("an already-finished session returns its id without sending bytes", async () => {
    const t: Transport = { sleep: async () => {}, put: async () => ({ status: 201, range: null, body: '{"id":"DONEDONE123"}' }) };
    expect(await uploadToYouTube({ sessionUrl: "u", file: blob(8), contentType: "video/mp4", transport: t })).toBe("DONEDONE123");
  });
});

describe("helpers", () => {
  test("nextOffset", () => {
    expect(nextOffset("bytes=0-262143")).toBe(262144);
    expect(nextOffset(null)).toBe(0);
  });
  test("allowedUploadOrigin only allows the admin site (and localhost outside production)", () => {
    const admin = "https://admin.rayalaseemanews.com";
    expect(allowedUploadOrigin(admin, admin, "production")).toBe(admin);
    expect(allowedUploadOrigin("https://evil.example", admin, "production")).toBeNull();
    expect(allowedUploadOrigin("http://localhost:3001", admin, "production")).toBeNull();
    expect(allowedUploadOrigin("http://localhost:3001", admin, "development")).toBe("http://localhost:3001");
    expect(allowedUploadOrigin(null, admin, "production")).toBeNull();
  });
  test("videoContentType falls back by extension", () => {
    expect(videoContentType({ name: "a.mp4", type: "video/mp4" })).toBe("video/mp4");
    expect(videoContentType({ name: "clip.MTS", type: "" })).toBe("video/*");
    expect(videoContentType({ name: "doc.pdf", type: "application/pdf" })).toBeNull();
  });
});
