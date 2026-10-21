import { describe, test, expect } from "bun:test";
import { transcribeAudio, plainText, transcriptFromCaptions } from "../../src/lib/video-iq/transcribe";

describe("transcribeAudio", () => {
  test("posts multipart with locale te-IN and phrase list, maps phrases to segments", async () => {
    process.env.AZURE_SPEECH_KEY = "k";
    process.env.AZURE_SPEECH_REGION = "centralindia";
    let seenUrl = "";
    let seenDef = "";
    let seenKey = "";
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seenUrl = url;
      seenKey = String((init.headers as Record<string, string>)["Ocp-Apim-Subscription-Key"]);
      const fd = init.body as FormData;
      seenDef = String(fd.get("definition"));
      return new Response(JSON.stringify({
        durationMilliseconds: 6000,
        phrases: [
          { offsetMilliseconds: 1000, durationMilliseconds: 2500, text: "రాచమల్లు ఫైర్" },
          { offsetMilliseconds: 3500, durationMilliseconds: 2500, text: "వరదరాజుల రెడ్డిపై" },
        ],
      }), { status: 200 });
    }) as unknown as typeof fetch;

    const t = await transcribeAudio(new Uint8Array([1, 2, 3]), { phrases: ["రాచమల్లు"], fetchImpl });
    expect(seenUrl).toContain("centralindia.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe");
    expect(seenKey).toBe("k");
    expect(seenDef).toContain('"locales":["te-IN"]');
    expect(seenDef).toContain("రాచమల్లు");
    expect(t.segments).toEqual([
      { start: 1, end: 3.5, text: "రాచమల్లు ఫైర్" },
      { start: 3.5, end: 6, text: "వరదరాజుల రెడ్డిపై" },
    ]);
    expect(t.durationSec).toBe(6);
    expect(t.words).toBe(4);
    expect(plainText(t)).toBe("రాచమల్లు ఫైర్ వరదరాజుల రెడ్డిపై");
  });

  test("non-200 throws with the status", async () => {
    process.env.AZURE_SPEECH_KEY = "k";
    const fetchImpl = (async () => new Response("bad", { status: 400 })) as unknown as typeof fetch;
    await expect(transcribeAudio(new Uint8Array([1]), { phrases: [], fetchImpl })).rejects.toThrow(/400/);
  });

  test("missing key fails before any network call", async () => {
    delete process.env.AZURE_SPEECH_KEY;
    let called = false;
    const fetchImpl = (async () => { called = true; return new Response("{}"); }) as unknown as typeof fetch;
    await expect(transcribeAudio(new Uint8Array([1]), { phrases: [], fetchImpl })).rejects.toThrow(/AZURE_SPEECH_KEY/);
    expect(called).toBe(false);
  });
});

describe("transcriptFromCaptions", () => {
  const srt = "1\n00:00:00,000 --> 00:00:02,000\nకడపలో దారుణం\n";
  test("prefers a human te track over ASR and parses it", async () => {
    const client = {
      listCaptions: async () => [
        { id: "asr1", snippet: { language: "te", trackKind: "asr" } },
        { id: "std1", snippet: { language: "te", trackKind: "standard" } },
      ],
      downloadCaption: async (id: string) => (id === "std1" ? srt : ""),
    } as any;
    const t = await transcriptFromCaptions(client, "vid");
    expect(t?.segments).toEqual([{ start: 0, end: 2, text: "కడపలో దారుణం" }]);
    expect(t?.durationSec).toBe(2);
  });
  test("returns null when no Telugu track exists yet", async () => {
    const client = { listCaptions: async () => [{ id: "en", snippet: { language: "en", trackKind: "asr" } }], downloadCaption: async () => "" } as any;
    expect(await transcriptFromCaptions(client, "vid")).toBeNull();
  });
});
