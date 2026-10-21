// Env-driven YouTube client for the admin app. Secrets come from process.env
// only; VIDEO_IQ_YOUTUBE_DRY_RUN=1 turns every write into a log line.
import { createYouTubeClient, type YouTubeClient } from "@rayalaseema/youtube";
import { reserveUnits } from "./quota";

export const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || "UCFZ-DcNTGQsTBpCmZk1MflA";

export function youtubeConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_OAUTH_REFRESH_TOKEN && process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function youtubeDryRun(): boolean {
  return process.env.VIDEO_IQ_YOUTUBE_DRY_RUN === "1";
}

export function getYouTube(prisma: Parameters<typeof reserveUnits>[0]): YouTubeClient {
  if (!youtubeConfigured()) {
    throw new Error("YouTube credentials not configured (YOUTUBE_OAUTH_REFRESH_TOKEN, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET)");
  }
  return createYouTubeClient({
    refreshToken: process.env.YOUTUBE_OAUTH_REFRESH_TOKEN!,
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    dryRun: youtubeDryRun(),
    onUnits: (units, label) => reserveUnits(prisma, units, label),
  });
}
