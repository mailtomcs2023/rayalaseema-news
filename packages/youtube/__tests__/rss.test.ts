import { describe, test, expect } from "bun:test";
import { parseYouTubeRss } from "../src/rss";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
<title>Sakshi TV</title>
<entry>
<id>yt:video:abcdefghijk</id>
<yt:videoId>abcdefghijk</yt:videoId>
<yt:channelId>UC123</yt:channelId>
<title>రాచమల్లు ఫైర్ | Rachamallu &amp; Co</title>
<published>2026-10-20T07:30:00+00:00</published>
<media:group><media:title>x</media:title><media:community><media:starRating count="1"/><media:statistics views="108888"/></media:community></media:group>
</entry>
<entry>
<yt:videoId>zzzzzzzzzzz</yt:videoId>
<title>No stats here</title>
<published>2026-10-20T08:00:00+00:00</published>
<media:group></media:group>
</entry>
</feed>`;

describe("parseYouTubeRss", () => {
  test("maps entries with and without statistics, decodes entities", () => {
    expect(parseYouTubeRss(XML)).toEqual([
      { videoId: "abcdefghijk", title: "రాచమల్లు ఫైర్ | Rachamallu & Co", publishedAt: "2026-10-20T07:30:00+00:00", views: 108888 },
      { videoId: "zzzzzzzzzzz", title: "No stats here", publishedAt: "2026-10-20T08:00:00+00:00", views: 0 },
    ]);
  });
  test("non-feed input gives an empty list", () => {
    expect(parseYouTubeRss("<html>blocked</html>")).toEqual([]);
  });
});
