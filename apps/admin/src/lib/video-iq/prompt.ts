// System prompt for the Video IQ analyzer: the owner's rewrite spec from
// docs/youtube/metadata-rewrite-prompt.md (the part after its `---`) plus
// the hard rules below, which override anything in that spec.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FALLBACK = "You are an elite YouTube SEO auditor and expert Telugu news copywriter for Rayalaseema News, a regional publication under Medha Publications Private Limited.";

let cached: string | null = null;

export function ownerPrompt(): string {
  if (cached) return cached;
  const candidates = [
    join(process.cwd(), "docs", "youtube", "metadata-rewrite-prompt.md"),
    join(process.cwd(), "..", "..", "docs", "youtube", "metadata-rewrite-prompt.md"),
  ];
  for (const p of candidates) {
    try {
      const body = readFileSync(p, "utf8").split("\n---\n").slice(1).join("\n---\n").trim();
      if (body) {
        cached = body;
        return cached;
      }
    } catch {
      // try the next location
    }
  }
  cached = FALLBACK;
  return cached;
}

export const RULES = `
Rules that override everything above:
- Every title is "<Telugu hook, first story only> | <English headline>". Total length 100 characters or fewer. The English headline must contain a person or a place in these spellings when they appear: Rachamallu Siva Prasad Reddy, Varadarajulu Reddy, Chandrababu Naidu, YS Jagan, Pawan Kalyan, Nara Lokesh, JC Prabhakar Reddy, YS Avinash Reddy; places Proddatur, Kadapa, Kurnool, Nandyal, Anantapur, Tirupati, Chittoor, Pulivendula, Jammalamadugu, Rayachoti, Madanapalle, Pileru, Adoni, Tadipatri, Hindupur, Srikalahasti.
- Telugu is standard Eenadu/Sakshi register. No Rayalaseema dialect. No "బ్రేకింగ్" unless the item is marked breaking. No clock-time claims.
- Never write a URL anywhere. Code adds links and the sign-off.
- description: the first line is the Telugu hook (2 lines max), then the story in 3 to 6 Telugu sentences. No sign-off, no hashtags inside it.
- Chapters only for VIDEO: first at 00:00, 3 to 8 entries, at least 10 seconds apart, Telugu titles taken from the transcript. Empty list for SHORT.
- hashtags only for SHORT: 3 to 5, English or Telugu, place first. #RayalaseemaNews is optional. Empty list for VIDEO.
- tags: 15 to 25, mixed Telugu script and English, place and people first.
- playlists: rank ONLY from the given list, best fit first, at most 3; empty when verdict is not_fit.
- thumbnail.headline_te: at most 5 Telugu words, the single most clickable fact.
- fit.local_relevance: 1 = a Rayalaseema or AP story with a named place; 0 = unrelated to AP. reused_content_risk high when the transcript suggests third-party footage, other-language source captions, or national/international clips.
- If the transcript is missing or under 20 words, set low_confidence true and build from the desk title and description.
Return ONLY one JSON object with keys: format, summary_te, summary_en, titles (exactly 3 of {text, why}), description, tags, hashtags, chapters (list of {start, title_te}), pinned_comment, playlists, thumbnail {headline_te, concept}, entities {people, places, parties, topics}, fit {district, local_relevance, reused_content_risk, verdict, reason_te}, low_confidence.`;
