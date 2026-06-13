import type { Article } from "../api/client";

// Hands the already-known article (title, image, category, time) from the
// reader to the native article screen so its header paints instantly while the
// full HTML body loads. The screen still fetches by id, so a cold/deep link
// works even when this is empty.
let pending: Article | null = null;

export function setOpenArticle(article: Article) {
  pending = article;
}

export function takeOpenArticle(): Article | null {
  return pending;
}
