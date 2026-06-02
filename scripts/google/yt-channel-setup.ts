#!/usr/bin/env bun
/**
 * Configure the YouTube channel branding + create starter playlists via API.
 *
 * Idempotent:
 *  - Channel update: applies new branding settings every run (no diff check).
 *  - Playlist create: skips if a playlist with the same title already exists.
 *
 * Run: bun scripts/google/yt-channel-setup.ts
 */

import { userApi } from "./user-oauth";

const CHANNEL_ID = "UCFZ-DcNTGQsTBpCmZk1MflA";

const BRANDING = {
  channel: {
    title: "Rayalaseema News",
    description: [
      "రాయలసీమ ప్రాంత తాజా వార్తలు, రాజకీయాలు, క్రీడలు, వినోదం, వాతావరణం, ధరలు, వ్యవసాయం.",
      "",
      "Latest news from the Rayalaseema region of Andhra Pradesh — Kurnool, Nandyal, Anantapuramu,",
      "Sri Sathya Sai, YSR-Kadapa, Annamayya, Tirupati, Chittoor. Independent Telugu journalism.",
      "",
      "🌐 Website: https://rayalaseemanews.com",
      "📸 Instagram: https://instagram.com/rayalaseemanews.tv",
      "𝕏 X / Twitter: https://x.com/RseNewsTV",
      "💬 WhatsApp Channel: (link coming)",
    ].join("\n"),
    keywords: [
      "Rayalaseema News",
      "రాయలసీమ న్యూస్",
      "Telugu news",
      "Andhra Pradesh news",
      "Kurnool news",
      "Anantapur news",
      "Kadapa news",
      "Tirupati news",
      "Chittoor news",
      "Nandyal news",
      "Sri Sathya Sai news",
      "Annamayya news",
      "Telugu breaking news",
      "Telugu politics",
      "Rayalaseema politics",
    ].map((k) => `"${k}"`).join(", "),
    defaultLanguage: "te",
    country: "IN",
  },
};

const PLAYLISTS = [
  { title: "Daily Bulletin", description: "Evening 8 PM IST bulletin — 8-15 min recap of the day's top stories." },
  { title: "Shorts", description: "60-second Telugu news clips from across the seven Rayalaseema districts." },
  { title: "District Stories", description: "Hyperlocal deep dives — Kurnool, Anantapur, Kadapa, Tirupati, Chittoor, Nandyal, Annamayya, Sri Sathya Sai." },
  { title: "Live & Breaking", description: "Live coverage of assembly sessions, festivals, cricket events, breaking news." },
  { title: "Politics", description: "AP politics — TDP, YSRCP, JSP, BJP, Congress in the Rayalaseema region." },
  { title: "Weather & Agriculture", description: "Mandi prices, weather, farmer stories, irrigation projects (Tungabhadra, Krishna)." },
  { title: "Devotional", description: "Tirupati, Sri Sailam, Lepakshi, Mahanandi, Yaganti, Pushpagiri — temple events + festivals." },
];

async function main() {
  // Verify channel access
  const me = await userApi<any>(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet,brandingSettings,status&mine=true"
  );
  if (!me.items?.length) throw new Error("no channel in this account — create one first");
  const ch = me.items[0];
  console.log(`Channel: ${ch.id}  "${ch.snippet.title}"`);
  if (ch.id !== CHANNEL_ID) {
    console.warn(`  Warning: expected ${CHANNEL_ID}, got ${ch.id} — using actual.`);
  }
  const actualId = ch.id;

  // Update branding
  console.log("\n[1] Updating channel branding (title, description, keywords, country, language)...");
  const updateBody = {
    id: actualId,
    brandingSettings: {
      channel: BRANDING.channel,
    },
  };
  const updated = await userApi<any>(
    "https://www.googleapis.com/youtube/v3/channels?part=brandingSettings",
    {
      method: "PUT",
      body: JSON.stringify(updateBody),
    }
  );
  console.log("    ok");
  console.log(`    title:    ${updated.brandingSettings?.channel?.title}`);
  console.log(`    country:  ${updated.brandingSettings?.channel?.country}`);
  console.log(`    lang:     ${updated.brandingSettings?.channel?.defaultLanguage}`);

  // Existing playlists
  console.log("\n[2] Checking existing playlists...");
  const existing = await userApi<any>(
    "https://www.googleapis.com/youtube/v3/playlists?part=snippet&channelId=" + actualId + "&maxResults=50"
  );
  const existingTitles = new Set((existing.items || []).map((p: any) => p.snippet.title));
  console.log(`    ${existing.items?.length || 0} existing playlists`);

  for (const pl of PLAYLISTS) {
    if (existingTitles.has(pl.title)) {
      console.log(`    skip  "${pl.title}" (already exists)`);
      continue;
    }
    console.log(`    create "${pl.title}"...`);
    const created = await userApi<any>(
      "https://www.googleapis.com/youtube/v3/playlists?part=snippet,status",
      {
        method: "POST",
        body: JSON.stringify({
          snippet: {
            title: pl.title,
            description: pl.description,
            defaultLanguage: "te",
          },
          status: { privacyStatus: "public" },
        }),
      }
    );
    console.log(`           id=${created.id}`);
  }

  console.log("\n✓ Channel branding + playlists configured.");
  console.log("  Open: https://studio.youtube.com/channel/" + actualId);
  console.log("");
  console.log("  Still manual (Studio UI):");
  console.log("    - Profile picture upload (Customise channel → Branding)");
  console.log("    - Banner image (2560x1440 px, <6MB)");
  console.log("    - Channel verification (after 100 subs → custom URL eligible)");
  console.log("    - Monetization (after 1000 subs + 4000 watch hours)");
}

main().catch((e) => {
  console.error("FAILED:", e.message || e);
  process.exit(1);
});
