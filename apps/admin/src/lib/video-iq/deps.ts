// Real dependencies for the Video IQ worker (what the cron route and the
// "start now" kick-off both use).
import { prisma } from "@rayalaseema/db";
import { createDataForSeo } from "@rayalaseema/youtube";
import * as media from "./media";
import * as transcribe from "./transcribe";
import * as analyze from "./analyze";
import * as keywords from "./keywords";
import * as thumbnail from "./thumbnail";
import { getYouTube, youtubeConfigured } from "./youtube";
import { uploadBuffer } from "@/lib/blob";
import type { Deps } from "./worker";

export function buildDeps(): Deps {
  const dfs = process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD
    ? createDataForSeo({ login: process.env.DATAFORSEO_LOGIN, password: process.env.DATAFORSEO_PASSWORD })
    : null;
  const youtube = youtubeConfigured()
    ? getYouTube(prisma)
    : { listMyPlaylists: async () => [], listCaptions: async () => [], downloadCaption: async () => "" };
  return {
    prisma,
    media,
    transcribe,
    analyze,
    keywords,
    thumbnail,
    youtube,
    dfs,
    blob: { uploadBuffer: (b, ext, contentType) => uploadBuffer(b, ext, contentType) },
  };
}
