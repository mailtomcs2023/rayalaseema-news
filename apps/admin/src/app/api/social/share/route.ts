import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// Load config from DB + env (DB takes priority)
async function getConfig(): Promise<Record<string, string>> {
  const dbConfigs = await prisma.siteConfig.findMany();
  const config: Record<string, string> = {};
  dbConfigs.forEach((c) => (config[c.key] = c.value));
  return config;
}

function cfg(config: Record<string, string>, dbKey: string, envKey: string): string {
  return config[dbKey] || process.env[envKey] || "";
}

let _config: Record<string, string> = {};

const SITE_URL = process.env.SITE_URL || "https://rayalaseemanews.com";

// Telegram
async function postTelegram(article: any) {
  const token = cfg(_config, "telegram_bot_token", "TELEGRAM_BOT_TOKEN");
  const chatId = cfg(_config, "telegram_channel_id", "TELEGRAM_CHANNEL_ID");
  if (!token || !chatId) throw new Error("Telegram not configured");

  const text = `📰 *${escMd(article.title)}*\n\n${escMd(article.summary || "")}\n\n🔗 [చదవండి](${SITE_URL}/article/${article.slug})`;

  // If there's a featured image, send photo with caption
  if (article.featuredImage) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        photo: article.featuredImage,
        caption: text,
        parse_mode: "Markdown",
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.description || "Telegram failed");
    return { messageId: data.result.message_id };
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: false,
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || "Telegram failed");
  return { messageId: data.result.message_id };
}

// Twitter/X
async function postTwitter(article: any) {
  const apiKey = cfg(_config, "twitter_api_key", "TWITTER_API_KEY");
  const apiSecret = cfg(_config, "twitter_api_secret", "TWITTER_API_SECRET");
  const accessToken = cfg(_config, "twitter_access_token", "TWITTER_ACCESS_TOKEN");
  const accessSecret = cfg(_config, "twitter_access_secret", "TWITTER_ACCESS_SECRET");
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) throw new Error("Twitter not configured");

  // OAuth 1.0a signing
  const url = "https://api.twitter.com/2/tweets";
  const tweetText = `${article.title}\n\n${article.summary?.slice(0, 150) || ""}\n\n${SITE_URL}/article/${article.slug}\n\n#రాయలసీమ #RayalaseemaExpress #${article.categoryNameEn?.replace(/\s/g, "") || "News"}`;

  const oauthParams = getOAuthParams(apiKey, accessToken);
  const signature = generateOAuthSignature("POST", url, oauthParams, apiSecret, accessSecret);
  oauthParams.oauth_signature = signature;
  const authHeader = "OAuth " + Object.entries(oauthParams).map(([k, v]) => `${enc(k)}="${enc(v)}"`).join(", ");

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ text: tweetText.slice(0, 280) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || data.title || "Twitter failed");
  return { tweetId: data.data?.id };
}

// Facebook Page
async function postFacebook(article: any) {
  const pageToken = cfg(_config, "facebook_page_token", "FACEBOOK_PAGE_TOKEN");
  const pageId = cfg(_config, "facebook_page_id", "FACEBOOK_PAGE_ID");
  if (!pageToken || !pageId) throw new Error("Facebook not configured");

  const message = `📰 ${article.title}\n\n${article.summary || ""}\n\n#రాయలసీమ #RayalaseemaExpress`;
  const link = `${SITE_URL}/article/${article.slug}`;

  const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, link, access_token: pageToken }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Facebook failed");
  return { postId: data.id };
}

// LinkedIn Organization
async function postLinkedIn(article: any) {
  const accessToken = cfg(_config, "linkedin_access_token", "LINKEDIN_ACCESS_TOKEN");
  const orgId = cfg(_config, "linkedin_org_id", "LINKEDIN_ORG_ID");
  if (!accessToken || !orgId) throw new Error("LinkedIn not configured");

  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
    body: JSON.stringify({
      author: `urn:li:organization:${orgId}`,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: `📰 ${article.title}\n\n${article.summary || ""}` },
          shareMediaCategory: "ARTICLE",
          media: [{
            status: "READY",
            description: { text: article.summary?.slice(0, 200) || "" },
            originalUrl: `${SITE_URL}/article/${article.slug}`,
            title: { text: article.title },
          }],
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "LinkedIn failed");
  return { postId: data.id };
}

// Instagram (via Facebook Graph API)
async function postInstagram(article: any) {
  const pageToken = process.env.FACEBOOK_PAGE_TOKEN;
  const igAccountId = process.env.INSTAGRAM_ACCOUNT_ID;
  if (!pageToken || !igAccountId) throw new Error("Instagram not configured");
  if (!article.featuredImage) throw new Error("Instagram requires an image");

  // Step 1: Create media container
  const caption = `📰 ${article.title}\n\n${article.summary || ""}\n\n🔗 Link in bio\n\n#రాయలసీమ #RayalaseemaExpress #TeluguNews #${article.categoryNameEn?.replace(/\s/g, "") || "News"}`;

  const createRes = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: article.featuredImage, caption, access_token: pageToken }),
  });
  const container = await createRes.json();
  if (container.error) throw new Error(container.error.message || "Instagram container failed");

  // Step 2: Publish
  const pubRes = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: container.id, access_token: pageToken }),
  });
  const pub = await pubRes.json();
  if (pub.error) throw new Error(pub.error.message || "Instagram publish failed");
  return { postId: pub.id };
}

// WhatsApp Business
async function postWhatsApp(article: any) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const groupId = process.env.WHATSAPP_GROUP_ID;
  if (!token || !phoneId) throw new Error("WhatsApp not configured");

  // WhatsApp Business API - send to a broadcast list or group
  const text = `📰 *${article.title}*\n\n${article.summary || ""}\n\n🔗 ${SITE_URL}/article/${article.slug}`;

  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: groupId,
      type: "text",
      text: { body: text },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "WhatsApp failed");
  return { messageId: data.messages?.[0]?.id };
}

// Pinterest
async function postPinterest(article: any) {
  const token = process.env.PINTEREST_ACCESS_TOKEN;
  const boardId = process.env.PINTEREST_BOARD_ID;
  if (!token || !boardId) throw new Error("Pinterest not configured");
  if (!article.featuredImage) throw new Error("Pinterest requires an image");

  const res = await fetch("https://api.pinterest.com/v5/pins", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      board_id: boardId,
      title: article.title.slice(0, 100),
      description: `${article.summary?.slice(0, 500) || ""}\n\n#రాయలసీమ #TeluguNews`,
      link: `${SITE_URL}/article/${article.slug}`,
      media_source: { source_type: "image_url", url: article.featuredImage },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Pinterest failed");
  return { pinId: data.id };
}

// Main handler
export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    _config = await getConfig();
    const { platforms, article } = await req.json();
    const results: Record<string, { success: boolean; error?: string; data?: any }> = {};

    const handlers: Record<string, (a: any) => Promise<any>> = {
      telegram: postTelegram,
      twitter: postTwitter,
      facebook: postFacebook,
      linkedin: postLinkedIn,
      instagram: postInstagram,
      whatsapp: postWhatsApp,
      pinterest: postPinterest,
    };

    await Promise.allSettled(
      platforms.map(async (platform: string) => {
        try {
          const data = await handlers[platform](article);
          results[platform] = { success: true, data };
        } catch (err: any) {
          results[platform] = { success: false, error: err.message };
        }
      })
    );

    return NextResponse.json(results);
  } catch (error) {
    return apiError(error);
  }
}

// Helpers
function escMd(s: string) { return s.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&"); }
function enc(s: string) { return encodeURIComponent(s); }

function getOAuthParams(consumerKey: string, token: string) {
  return {
    oauth_consumer_key: consumerKey,
    oauth_nonce: Math.random().toString(36).slice(2),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: "1.0",
    oauth_signature: "",
  };
}

function generateOAuthSignature(method: string, url: string, params: Record<string, string>, consumerSecret: string, tokenSecret: string) {
  const { oauth_signature, ...rest } = params;
  const paramStr = Object.entries(rest).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${enc(k)}=${enc(v)}`).join("&");
  const baseStr = `${method}&${enc(url)}&${enc(paramStr)}`;
  const signingKey = `${enc(consumerSecret)}&${enc(tokenSecret)}`;

  // HMAC-SHA1 using Web Crypto
  const crypto = require("crypto");
  return crypto.createHmac("sha1", signingKey).update(baseStr).digest("base64");
}
