// YouTube channel Atom feed parser (https://www.youtube.com/feeds/videos.xml?channel_id=…).
// Fifteen most recent uploads with a view count; no API quota.
export type RssVideo = { videoId: string; title: string; publishedAt: string; views: number };

const grab = (block: string, re: RegExp) => block.match(re)?.[1] ?? "";
const decode = (s: string) =>
  s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();

export function parseYouTubeRss(xml: string): RssVideo[] {
  if (!xml.includes("<entry>")) return [];
  return xml
    .split("<entry>")
    .slice(1)
    .map((e) => ({
      videoId: grab(e, /<yt:videoId>([^<]+)<\/yt:videoId>/),
      title: decode(grab(e, /<title>([\s\S]*?)<\/title>/)),
      publishedAt: grab(e, /<published>([^<]+)<\/published>/),
      views: Number(grab(e, /<media:statistics views="(\d+)"/) || 0),
    }))
    .filter((v) => v.videoId);
}
