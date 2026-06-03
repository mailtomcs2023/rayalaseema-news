// /content/[id] - morphing editor (Spec #1 #117 + F2-F6).
//
// F1 ships: common fields (Title, Slug, Summary, Category, Desk, Constituency,
// Featured image, Tags, Featured?, Language, Status) + ARTICLE subform (body
// via RichEditor + rating/reviewerName/sourceUrl).
//
// Other ContentTypes render type-specific subforms in F2-F6. Until those land,
// non-ARTICLE rows still see common fields and can save title/category/etc;
// the type-specific subform panel surfaces a "coming soon" callout.
"use client";

import { ArrowLeft, ChevronDown as ChevronDownIcon, Sparkles } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { buildSlugFromTitle, isPlaceholderSlug, sanitizeSlug } from "@/lib/slug";
import { canSetStatus, ARTICLE_STATUSES } from "@/lib/permissions";
import type { Role } from "@prisma/client";
import { RichEditor, type RichEditorRef } from "@/components/rich-editor";
import { ImageUpload } from "@/components/image-upload";
import { VideoUpload } from "@/components/video-upload";
import { ContentPayloadEditor } from "@/components/content-payload-editor";
import { ImageSearchModal } from "@/components/image-search-modal";
import { ImageCropModal } from "@/components/image-crop-modal";
import { PaymentPanel } from "@/components/content/payment-panel";
import { TagSuggestions } from "@/components/content/tag-suggestions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { z } from "zod";

interface Category { id: string; name: string; nameEn: string; slug: string; parentId?: string | null }

// ISO timestamp -> the local-time "YYYY-MM-DDTHH:mm" the <DateTimePicker>
// expects. Empty string when the row has no scheduled time. Centralised so
// the load useEffect and the dirty-check snapshot can't drift.
function formatScheduledForInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

const TYPE_META: Record<string, { label: string; bg: string; fg: string }> = {
  ARTICLE: { label: "Article", bg: "#fee2e2", fg: "#991b1b" },
  VIDEO: { label: "Video", bg: "#dbeafe", fg: "#1e40af" },
  REEL: { label: "Reel", bg: "#dcfce7", fg: "#166534" },
  WEB_STORY: { label: "Web Story", bg: "#fef3c7", fg: "#92400e" },
  PHOTO_GALLERY: { label: "Photo Gallery", bg: "#f3e8ff", fg: "#6b21a8" },
  CARTOON: { label: "Cartoon", bg: "#fce7f3", fg: "#9d174d" },
  BREAKING_NEWS: { label: "Breaking News", bg: "#fef2f2", fg: "#7f1d1d" },
};

// Client-side article validation, enforced when leaving DRAFT (Submit /
// Publish). Mirrors the server's required fields. On failure the editor marks
// each bad field with aria-invalid (red) + an inline message and focuses the
// first one. Drafts skip this so editors keep incomplete work.
const articleSubmitSchema = z.object({
  title: z.string().trim().min(1, "Title is required."),
  slug: z.string().trim().min(1, "Slug (the article URL) is required."),
  summary: z.string().trim().min(1, "Summary is required."),
  body: z.string().trim().min(1, "Body cannot be empty."),
  featuredMedia: z.string().trim().min(1, "Add a featured image or video."),
});
type ArticleFieldKey = keyof z.infer<typeof articleSubmitSchema>;

export default function ContentEditorPage() {
  const router = useRouter();
  const params = useParams();
  const contentId = params.id as string;

  // Role drives which Status values the dropdown offers (see canSetStatus /
  // permissions.ts). The server PUT enforces the same rule authoritatively.
  const { data: session } = useSession();
  const role = (session?.user as any)?.role || "REPORTER";

  const [type, setType] = useState<string>("ARTICLE");
  const [categories, setCategories] = useState<Category[]>([]);
  const [desks, setDesks] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Common fields
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [featuredImage, setFeaturedImage] = useState("");
  // Featured VIDEO (ARTICLE only) - an alternative hero to the image. The
  // editor enforces image-OR-video (toggling clears the other), so the saved
  // row only ever carries one hero medium. Stored on the article payload.
  const [featuredVideo, setFeaturedVideo] = useState("");
  const [mediaMode, setMediaMode] = useState<"image" | "video">("image");
  const [categoryId, setCategoryId] = useState("");
  // Multi-category cross-listing - IDs of categories this row should ALSO
  // appear under (primary stays in categoryId). Editor renders a chip list
  // below the primary dropdown.
  const [additionalCategoryIds, setAdditionalCategoryIds] = useState<string[]>([]);
  const [deskId, setDeskId] = useState("");
  const [constituencyId, setConstituencyId] = useState("");
  const [status, setStatus] = useState("DRAFT");
  // Discard-on-leave bookkeeping: was this row an untouched "Untitled"
  // placeholder at load, and is it still un-edited? Refs so the unmount
  // cleanup reads live values without re-subscribing.
  const loadedAsPlaceholderRef = useRef(false);
  const isDirtyRef = useRef(false);
  const [featured, setFeatured] = useState(false);
  const [language, setLanguage] = useState("TELUGU");
  const [tagsInput, setTagsInput] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [imageSearchOpen, setImageSearchOpen] = useState(false);
  // After picking from search OR pasting a URL, hand the (already EXIF-
  // stripped, RE-stamped) image to the crop modal so the user can frame it.
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  // True only when the featured image actually loads. Crop / AI image tools
  // hide unless there's a real, loaded image (a broken/non-image URL has
  // nothing to operate on).
  const [imageLoaded, setImageLoaded] = useState(false);
  // Per-operation AI enhance state (loading flag + last error). Result
  // URL replaces featuredImage in place.
  const [enhancing, setEnhancing] = useState<string | null>(null);

  const enhanceImage = async (op: string) => {
    if (!featuredImage || enhancing) return;
    if (!confirm(`Run AI '${op}' on the current featured image? Takes ~15s + ~$0.06.`)) return;
    setEnhancing(op);
    setError("");
    try {
      const res = await fetch("/api/images/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: featuredImage, op }),
      });
      // Tolerate non-JSON bodies (e.g. an nginx 502/504 HTML page) so the
      // user sees a clear message instead of "Unexpected token '<'".
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data.url) {
        setError(data.error || "The image tool is temporarily unavailable. Please try again in a moment.");
      } else {
        setFeaturedImage(data.url);
        setSuccess(`✨ '${op}' applied. Review before publishing.`);
        setTimeout(() => setSuccess(""), 5000);
      }
    } catch (e: any) {
      setError(e.message || "Enhance failed");
    }
    setEnhancing(null);
  };

  // ARTICLE-specific (payload)
  const [rating, setRating] = useState<string>("");
  const [reviewerName, setReviewerName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  // Typed payload state for non-ARTICLE types (F2-F6).
  const [typedPayload, setTypedPayload] = useState<Record<string, unknown>>({});
  const [payloadError, setPayloadError] = useState("");

  // AI helpers (translate / editorial / summarize / headline) + URL fetch.
  // Ported from the legacy /articles/[id] editor - same /api/ai/rewrite and
  // /api/fetch-news endpoints, now wired into the unified content editor.
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [pasteUrl, setPasteUrl] = useState("");
  // Headline picker - filled when the user clicks "Headline ideas" and the
  // AI returns its numbered list. Popover anchors to the button and each
  // row sets the Title field on click. Avoids the old dead-end toast.
  const [headlineIdeas, setHeadlineIdeas] = useState<string[]>([]);
  const [headlineOpen, setHeadlineOpen] = useState(false);

  const editorRef = useRef<RichEditorRef>(null);
  // Per-field validation errors (Submit/Publish). Drive aria-invalid red
  // borders + inline messages; cleared per-field as the editor fixes them.
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ArticleFieldKey, string>>>({});
  const titleRef = useRef<HTMLInputElement>(null);
  const slugRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);
  const clearFieldError = (k: ArticleFieldKey) =>
    setFieldErrors((prev) => {
      if (!prev[k]) return prev;
      const next = { ...prev };
      delete next[k];
      return next;
    });
  // Snapshot of every editable field at load time. The Update button is
  // disabled while the current form state JSON-stringifies to the same value -
  // so a freshly-loaded row with no edits can't be re-saved by accident, and
  // editors get visual feedback that "yes, I've actually changed something".
  // Reset only on a fresh load (the post-save flow navigates away).
  const initialSnapshotRef = useRef<string | null>(null);

  // Pipe error/success state through Sonner toasts - the inline banner was
  // removed in the visual refactor, but every existing setError/setSuccess
  // call still surfaces visibly via these effects. Empty-string resets are
  // skipped so a setError("") doesn't trigger a phantom toast.
  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);
  useEffect(() => {
    if (success) toast.success(success);
  }, [success]);

  // ─── Auto slug from title ────────────────────────────────────────────────
  // Watches the title with a 1s debounce. If the slug is still a placeholder
  // (`untitled-…` / `breaking-…` / `news-…` / empty) we fire the AI `slug`
  // action and replace it with a short English SEO slug. Two safety nets:
  //   - userTouchedSlug ref - once the editor types in the slug field, this
  //     effect stops touching it. No surprise overwrites.
  //   - Transliteration fallback if AI returns empty / garbage.
  // Reporters never see the slug field but this effect still runs for them,
  // so the placeholder slug gets replaced with a real one before save.
  const userTouchedSlug = useRef(false);
  useEffect(() => {
    if (userTouchedSlug.current) return;
    if (!title.trim()) return;
    if (!isPlaceholderSlug(slug)) return;
    // Skip the "Untitled <Type>" placeholder title that /content/new stamps.
    if (/^untitled\b/i.test(title.trim())) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/ai/rewrite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: title, action: "slug" }),
        });
        const data = await res.json().catch(() => ({}));
        const aiSlug = sanitizeSlug(String(data?.result ?? ""));
        // Guard against AI returning empty, all-numeric, or suspiciously long
        // output - fall back to client-side transliteration via the shared
        // buildSlugFromTitle helper.
        const next = aiSlug && aiSlug.length >= 3 && aiSlug.length <= 80
          ? aiSlug
          : buildSlugFromTitle(title);
        if (!userTouchedSlug.current && next && next !== slug) {
          setSlug(next);
        }
      } catch {
        // Network/AI failure → use transliteration fallback so the slug
        // still becomes meaningful instead of staying placeholder.
        const fallback = buildSlugFromTitle(title);
        if (!userTouchedSlug.current && fallback) setSlug(fallback);
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [title, slug]);

  const runAI = async (action: "translate" | "editorial" | "summarize" | "headline") => {
    const text = body || summary || title;
    if (!text) { setError("No content to process - type or paste something first."); return; }
    setAiLoading(action);
    setError("");
    setSuccess("");
    try {
      const urlMatch = body.match(/href="(https?:\/\/[^"]+)"/);
      const ctxSourceUrl = urlMatch ? urlMatch[1] : (sourceUrl || undefined);
      const res = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `Title: ${title}\n\nSummary: ${summary}\n\nBody: ${body.replace(/<[^>]+>/g, " ").trim()}`,
          action,
          sourceUrl: ctxSourceUrl,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else if (data.result) {
        if (action === "summarize") {
          setSummary(String(data.result).replace(/<[^>]+>/g, "").trim());
          setSuccess("Summary generated.");
        } else if (action === "headline") {
          // The AI returns a numbered list like "1. ...\n2. ...". Strip
          // any stray tags + leading "1." / "1)" / "1:" prefixes and split
          // into discrete headlines. If parsing comes up short (model
          // returned a paragraph instead of a list), fall back to the old
          // toast so the editor still sees the raw suggestion.
          const lines = String(data.result)
            .replace(/<[^>]+>/g, "")
            .split(/\r?\n/)
            .map((s) => s.replace(/^\s*\d+\s*[.):\-]\s*/, "").trim())
            .filter(Boolean);
          if (lines.length >= 2) {
            setHeadlineIdeas(lines.slice(0, 5));
            setHeadlineOpen(true);
          } else {
            setSuccess(String(data.result));
          }
        } else {
          // Translate / editorial - full body rewrite.
          const h2 = data.result.match(/<h2[^>]*>(.*?)<\/h2>/);
          if (h2) setTitle(h2[1].replace(/<[^>]+>/g, "").trim());
          setBody(data.result);
          editorRef.current?.setContent(data.result);
          // Generate a proper AI summary (complete sentences, ~60 words) from
          // the rewritten article instead of chopping its lead paragraph - so
          // the Summary box never ends mid-sentence.
          try {
            const plain = data.result.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
            const sres = await fetch("/api/ai/rewrite", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: plain, action: "summarize" }),
            });
            const sdata = await sres.json();
            if (sdata.result) setSummary(String(sdata.result).replace(/<[^>]+>/g, "").trim());
          } catch {
            /* keep existing summary if the follow-up summarize call fails */
          }
          setSuccess(
            data.fromBrief
              ? "Draft written from your brief — please verify all facts (names, dates, quotes) before publishing."
              : `Done. Tokens used: ${data.tokens?.total_tokens || data.tokens?.total || 0}`,
          );
        }
      }
    } catch (e: any) {
      setError(e.message || "AI request failed");
    }
    setAiLoading(null);
    setTimeout(() => setSuccess(""), 5000);
  };

  const fetchFromUrl = async () => {
    if (!pasteUrl.trim()) return;
    setAiLoading("fetch");
    setError("");
    try {
      // Single AI call: scrapes URL + translates + extracts og:image +
      // suggests English SEO slug + keywords + meta-description. Replaces
      // the older /api/fetch-news POST which required a title up-front and
      // saved a row on every click (the dummy-draft bug).
      const res = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: pasteUrl.trim(), action: "full-import" }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || `Fetch failed (${res.status})`);
        setAiLoading(null);
        return;
      }
      if (data.title) setTitle(data.title);
      if (data.summary) setSummary(data.summary);
      if (data.body) {
        setBody(data.body);
        editorRef.current?.setContent(data.body);
      }
      // Always set when fetching fresh from URL - user paste-URL means they
      // want the source's image. If they don't want it, they can clear it
      // manually. (Was previously conditional on !featuredImage which
      // silently dropped the source's og:image when an old image lingered.)
      if (data.ogImage) setFeaturedImage(data.ogImage);
      if (data.slug) setSlug(data.slug);
      setSourceUrl(pasteUrl.trim());
      setPasteUrl("");
      const kw = Array.isArray(data.keywords) && data.keywords.length ? ` Keywords: ${data.keywords.join(", ")}.` : "";
      const note = data.fallback && data.note ? `⚠ ${data.note} ` : "";
      setSuccess(`${note}Fetched + translated.${kw} Review + Save Draft when ready.`);
    } catch (e: any) {
      setError(e.message || "Fetch failed");
    }
    setAiLoading(null);
    setTimeout(() => setSuccess(""), 8000);
  };

  useEffect(() => {
    Promise.all([
      fetch(`/api/content/${contentId}`).then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/desks").then((r) => r.json()).catch(() => []),
      fetch("/api/locations").then((r) => r.json()).catch(() => []),
    ]).then(([row, cats, deskList, locs]) => {
      setCategories(cats || []);
      setDesks(deskList || []);
      setDistricts(locs || []);
      if (row.error) {
        setError(row.error);
        setLoading(false);
        return;
      }
      setType(row.type || "ARTICLE");
      setTitle(row.title || "");
      setSlug(row.slug || "");
      // If the loaded slug is already non-placeholder, treat it as user-
      // edited so the auto-slug effect won't try to "improve" it on next
      // title keystroke.
      if (row.slug && !isPlaceholderSlug(row.slug)) {
        userTouchedSlug.current = true;
      }
      setSummary(row.summary || "");
      setBody(row.body || "");
      setFeaturedImage(row.featuredImage || "");
      setCategoryId(row.categoryId || "");
      setAdditionalCategoryIds(Array.isArray(row.additionalCategoryIds) ? row.additionalCategoryIds : []);
      setDeskId(row.deskId || "");
      setConstituencyId(row.constituencyId || "");
      setStatus(row.status || "DRAFT");
      setFeatured(!!row.featured);
      setLanguage(row.language || "TELUGU");
      setSourceUrl(row.sourceUrl || "");
      const initialScheduledAt = formatScheduledForInput(row.scheduledAt);
      setScheduledAt(initialScheduledAt);
      const initialTags = Array.isArray(row.tags)
        ? row.tags.map((t: any) => t.tag?.name).filter(Boolean).join(", ")
        : "";
      setTagsInput(initialTags);
      // Project payload into the right state shape per type. ARTICLE pulls
      // rating + reviewerName into dedicated inputs; everything else hands the
      // raw payload to ContentPayloadEditor which switches on type internally.
      const payload = row.payload || {};
      const isArticle = row.type === "ARTICLE";
      const initialRating = isArticle && typeof payload.rating === "number" ? String(payload.rating) : "";
      const initialReviewerName = isArticle ? (payload.reviewerName || "") : "";
      const initialFeaturedVideo = isArticle ? ((payload.featuredVideo as string) || "") : "";
      const initialTypedPayload = !isArticle ? (payload as Record<string, unknown>) : {};
      if (isArticle) {
        setRating(initialRating);
        setReviewerName(initialReviewerName);
        setFeaturedVideo(initialFeaturedVideo);
        setMediaMode(initialFeaturedVideo ? "video" : "image");
      } else {
        setTypedPayload(initialTypedPayload);
      }
      // Snapshot must mirror buildFormSnapshot() shape exactly - any drift
      // here means the dirty check fires (or fails to fire) incorrectly.
      initialSnapshotRef.current = JSON.stringify({
        title: row.title || "",
        slug: row.slug || "",
        summary: row.summary || "",
        body: isArticle ? (row.body || "") : "",
        featuredImage: row.featuredImage || "",
        categoryId: row.categoryId || "",
        additionalCategoryIds: [...(Array.isArray(row.additionalCategoryIds) ? row.additionalCategoryIds : [])].sort(),
        deskId: row.deskId || "",
        constituencyId: row.constituencyId || "",
        status: row.status || "DRAFT",
        featured: !!row.featured,
        language: row.language || "TELUGU",
        sourceUrl: row.sourceUrl || "",
        scheduledAt: initialScheduledAt,
        tagsInput: initialTags,
        rating: initialRating,
        reviewerName: initialReviewerName,
        featuredVideo: initialFeaturedVideo,
        typedPayload: initialTypedPayload,
      });
      loadedAsPlaceholderRef.current =
        (row.title || "").startsWith("Untitled ") && (row.status || "DRAFT") === "DRAFT";
      setLoading(false);
    });
  }, [contentId]);

  // Discard a never-touched placeholder draft when the editor is abandoned
  // ("New Content -> pick type -> back") so empty "Untitled" rows don't pile
  // up. keepalive lets the request survive the unmount/navigation; the server
  // re-checks pristine + ownership before deleting anything.
  useEffect(() => {
    return () => {
      if (loadedAsPlaceholderRef.current && !isDirtyRef.current) {
        fetch(`/api/content/${contentId}/discard-draft`, { method: "POST", keepalive: true }).catch(() => {});
      }
    };
  }, [contentId]);

  const buildPayload = () => {
    if (type === "ARTICLE") {
      const p: Record<string, unknown> = {};
      if (rating.trim()) {
        const n = parseFloat(rating);
        if (Number.isFinite(n)) p.rating = n;
      }
      if (reviewerName.trim()) p.reviewerName = reviewerName.trim();
      // Featured video only persists in "video" mode - guards against a stale
      // URL lingering in payload after the editor switched back to an image.
      if (mediaMode === "video" && featuredVideo.trim()) p.featuredVideo = featuredVideo.trim();
      return Object.keys(p).length > 0 ? p : null;
    }
    // Strip empty top-level fields so the Zod .strict() schemas don't trip on
    // empty strings that the user never filled.
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(typedPayload)) {
      if (v === "" || v === null || v === undefined) continue;
      cleaned[k] = v;
    }
    return Object.keys(cleaned).length > 0 ? cleaned : null;
  };

  const handleSave = async (newStatus?: string) => {
    setSaving(true);
    setError("");
    setSuccess("");
    setPayloadError("");
    // Capture the status BEFORE save so the success toast can distinguish
    // a state transition ("Article published") from a same-status re-save
    // ("Article updated"). Without this, clicking Update on a PUBLISHED
    // row toasts "Article published" - confusing since nothing was newly
    // published, it was already live.
    const prevStatus = status;

    const payload = buildPayload();
    if (payload === undefined) {
      setSaving(false);
      return;
    }

    const finalStatus = newStatus || status;

    // Required-field gate for ARTICLEs leaving draft (Submit / Publish). Drafts
    // stay savable while incomplete so editors keep work-in-progress; the red
    // asterisks in the form signal what's needed before submit/publish.
    // Featured media is satisfied by EITHER an image or a video (one-medium
    // rule), so an article is never blocked for having a video instead of an
    // image.
    if (type === "ARTICLE" && (finalStatus === "SUBMITTED" || finalStatus === "PUBLISHED")) {
      const parsed = articleSubmitSchema.safeParse({
        title,
        slug,
        summary,
        body: (body || "").replace(/<[^>]+>/g, " ").trim(),
        featuredMedia: featuredImage.trim() || featuredVideo.trim(),
      });
      if (!parsed.success) {
        const errs: Partial<Record<ArticleFieldKey, string>> = {};
        for (const issue of parsed.error.issues) {
          const k = issue.path[0] as ArticleFieldKey;
          if (!errs[k]) errs[k] = issue.message;
        }
        setFieldErrors(errs);
        // Focus + scroll the FIRST invalid field, in top-to-bottom form order.
        const candidates: (HTMLElement | null)[] = [
          errs.featuredMedia ? mediaRef.current : null,
          errs.title ? titleRef.current : null,
          errs.slug ? slugRef.current : null,
          errs.summary ? summaryRef.current : null,
          errs.body ? bodyRef.current : null,
        ];
        const target = candidates.find((el): el is HTMLElement => el != null);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          target.focus();
        }
        const n = Object.keys(errs).length;
        toast.error(
          `Please fix ${n} field${n > 1 ? "s" : ""} before ${finalStatus === "PUBLISHED" ? "publishing" : "submitting"}.`,
        );
        setSaving(false);
        return;
      }
      setFieldErrors({});
    }

    // `type` is intentionally omitted - content type isn't updatable after
    // creation, and the PUT schema (.strict()) rejects unknown fields. The
    // `type === "ARTICLE"` check below still uses the local state variable
    // to decide whether to send the `body` payload.
    const body_ = {
      title,
      slug,
      summary: summary || null,
      body: type === "ARTICLE" ? body : null,
      featuredImage: featuredImage || null,
      categoryId: categoryId || null,
      additionalCategoryIds: additionalCategoryIds.filter((id) => id && id !== categoryId),
      deskId: deskId || null,
      constituencyId: constituencyId || null,
      status: finalStatus,
      featured,
      language,
      sourceUrl: sourceUrl || null,
      payload,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      tagNames: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
    };

    try {
      const res = await fetch(`/api/content/${contentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body_),
      });
      const data = await res.json();
      if (!res.ok) {
        // Special-case the KYC gate so the error has a useful CTA. The
        // server attaches `kycRequired: true` on 403 from lib/kyc-guard.ts.
        // This now fires on any edit/save (not just publish) for unverified
        // non-ADMIN users - data.error carries the action-specific message.
        if (data.kycRequired) {
          toast.error(data.error || "Your KYC must be verified to edit articles.", {
            action: { label: "Complete KYC", onClick: () => router.push("/onboarding/kyc") },
            duration: 8000,
          });
          setError("");
          setSaving(false);
          return;
        }
        const fieldErrs = data.fieldErrors
          ? Object.entries(data.fieldErrors).map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`).join(" · ")
          : "";
        setError(data.error + (fieldErrs ? ` (${fieldErrs})` : "") || `Save failed (${res.status})`);
      } else {
        setStatus(data.status);
        // Toast message reflects what *changed*, not just the final state:
        //   - status unchanged → "Article updated" (re-saving the same row)
        //   - status changed   → message for the new state
        // Server-returned `data.status` is the source of truth (covers
        // edge cases like SCHEDULED → DRAFT fallback when scheduledAt is
        // in the past).
        const transitionMsg: Record<string, string> = {
          PUBLISHED: "Article published",
          SCHEDULED: "Article scheduled",
          DRAFT: "Draft saved",
          SUBMITTED: "Submitted for review",
          APPROVED: "Approved",
          REJECTED: "Rejected",
          ARCHIVED: "Archived",
        };
        const toastMsg = data.status === prevStatus
          ? "Article updated"
          : transitionMsg[data.status] || "Saved";
        toast.success(toastMsg);
        // After any successful save, send the user back to /content and
        // invalidate the App Router cache so the list re-runs its server
        // fetch and reflects the row's new state (status, slug, etc.).
        setTimeout(() => {
          router.push("/content");
          router.refresh();
        }, 500);
      }
    } catch (e: any) {
      setError(e.message || "Save failed");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
        <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>Loading…</main>
      </div>
    );
  }

  const typeMeta = TYPE_META[type] || { label: type, bg: "#eee", fg: "#555" };
  const constituencies = districts.flatMap((d) =>
    (d.constituencies || []).map((c: any) => ({ ...c, districtName: d.nameEn })));

  // Mirror of the load-time snapshot, computed from live state. Shape MUST
  // match the JSON.stringify in the load useEffect or the dirty check lies.
  const currentSnapshot = JSON.stringify({
    title,
    slug,
    summary,
    body: type === "ARTICLE" ? body : "",
    featuredImage,
    categoryId,
    additionalCategoryIds: [...additionalCategoryIds].sort(),
    deskId,
    constituencyId,
    status,
    featured,
    language,
    sourceUrl,
    scheduledAt,
    tagsInput,
    rating: type === "ARTICLE" ? rating : "",
    reviewerName: type === "ARTICLE" ? reviewerName : "",
    featuredVideo: type === "ARTICLE" ? featuredVideo : "",
    typedPayload: type !== "ARTICLE" ? typedPayload : {},
  });
  const isDirty = initialSnapshotRef.current !== null && currentSnapshot !== initialSnapshotRef.current;
  isDirtyRef.current = isDirty;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        {/* Header */}
        <div className="shadcn-scope mb-4 flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => router.push("/content")}>
            <ArrowLeft size={14} aria-hidden className="-ms-1" />
            Back
          </Button>
          <Badge
            variant="outline"
            className="border text-xs font-bold"
            style={{ background: typeMeta.bg, color: typeMeta.fg, borderColor: "transparent" }}
          >
            {typeMeta.label}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {status}
          </Badge>
          <div className="flex-1" />
          {/* Cancel discards the in-progress edits and returns to /content.
              Update persists every field as-is, including any status the
              editor picked in the right-rail dropdown - so changing Status
              from SUBMITTED to APPROVED and clicking Update commits the
              transition. Workflow gating still lives on the server. */}
          <Button variant="outline" onClick={() => router.push("/content")} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => handleSave()}
            disabled={saving || !isDirty}
            className="bg-red-600 hover:bg-red-700 text-white"
            title={!isDirty ? "No changes to save" : undefined}
          >
            {saving ? "Updating…" : "Update"}
          </Button>
        </div>

        <div className="shadcn-scope grid gap-5" style={{ gridTemplateColumns: "minmax(0, 1fr) 320px" }}>
          {/* Main column */}
          <Card className="gap-4 py-5">
            <CardContent className="space-y-4">
              {/* Featured image - pinned at the top so the hero visual is the
                  first thing the editor sees and confirms before scrolling down
                  to title/body. */}
              <div
                ref={mediaRef}
                tabIndex={-1}
                className={`space-y-2 rounded-md outline-none ${fieldErrors.featuredMedia ? "p-1 ring-2 ring-destructive" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <Label>{type === "ARTICLE" ? "Featured media" : "Featured image"}{type === "ARTICLE" && <span className="text-red-500"> *</span>}</Label>
                  {/* ARTICLE hero is image OR video, never both - the toggle
                      clears the other side so only one medium is ever saved. */}
                  {type === "ARTICLE" && (
                    <div className="inline-flex rounded-md border border-border p-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant={mediaMode === "image" ? "default" : "ghost"}
                        className="h-7 px-3"
                        onClick={() => { setMediaMode("image"); setFeaturedVideo(""); }}
                      >
                        Image
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={mediaMode === "video" ? "default" : "ghost"}
                        className="h-7 px-3"
                        onClick={() => { setMediaMode("video"); setFeaturedImage(""); }}
                      >
                        Video
                      </Button>
                    </div>
                  )}
                </div>
                {fieldErrors.featuredMedia && <p className="text-xs font-medium text-red-500">{fieldErrors.featuredMedia}</p>}
                {type === "ARTICLE" && mediaMode === "video" ? (
                  <>
                    <VideoUpload value={featuredVideo} onChange={(v) => { setFeaturedVideo(v); if (v) clearFieldError("featuredMedia"); }} />
                    <p className="text-xs text-muted-foreground">
                      Paste a YouTube link or upload an MP4/WebM. The video plays as the article hero — no separate image is used.
                    </p>
                  </>
                ) : (
                <>
                <ImageUpload
                  value={featuredImage}
                  onChange={(v) => { setFeaturedImage(v); if (v) clearFieldError("featuredMedia"); }}
                  onSearchClick={() => setImageSearchOpen(true)}
                  onValidChange={setImageLoaded}
                />
                {/* Crop + AI image tools only appear once a real image has
                    actually loaded - a broken/non-image URL has nothing to
                    crop or enhance. */}
                {featuredImage && imageLoaded && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setCropSrc(featuredImage)}
                      className="bg-slate-700 text-white hover:bg-slate-800"
                    >
                      Crop
                    </Button>
                    {/* AI enhance row - only visible once an image is set.
                        ~$0.06 per operation. Result replaces featuredImage. */}
                    {[
                      { op: "remove-watermark", label: "Remove watermark" },
                      { op: "enhance", label: "Enhance" },
                      { op: "upscale", label: "Upscale" },
                      { op: "restore", label: "Restore" },
                    ].map((b) => (
                      <Button
                        key={b.op}
                        type="button"
                        size="sm"
                        onClick={() => enhanceImage(b.op)}
                        disabled={enhancing !== null}
                        title={`AI '${b.op}' - gpt-image-2, ~15s, ~$0.06`}
                        className={`gap-1 bg-violet-600 text-white hover:bg-violet-700 ${enhancing && enhancing !== b.op ? "opacity-50" : ""}`}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {enhancing === b.op ? "Running…" : b.label}
                      </Button>
                    ))}
                  </div>
                )}
                </>
                )}
              </div>

              {/* Common */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="title-input">Title <span className="text-red-500">*</span></Label>
                  {type === "ARTICLE" && (
                    <Popover open={headlineOpen} onOpenChange={setHeadlineOpen}>
                      <PopoverAnchor asChild>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => runAI("headline")}
                          disabled={aiLoading !== null}
                          className="h-7 gap-1 px-2 text-xs text-slate-600 hover:text-slate-900"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          {aiLoading === "headline" ? "Generating…" : "Headline ideas"}
                        </Button>
                      </PopoverAnchor>
                      <PopoverContent align="end" className="w-96 p-2">
                        <div className="mb-1 px-2 pt-1 text-xs font-medium text-slate-500">
                          Pick one to set as title
                        </div>
                        <div className="flex flex-col gap-0.5">
                          {headlineIdeas.map((h, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                setTitle(h);
                                setHeadlineOpen(false);
                                setSuccess("Title updated.");
                              }}
                              className="rounded-md px-2 py-2 text-left text-sm leading-snug hover:bg-slate-100"
                            >
                              {h}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
                <Input
                  id="title-input"
                  ref={titleRef}
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); clearFieldError("title"); }}
                  aria-invalid={!!fieldErrors.title}
                  className="h-12 bg-white text-lg font-bold md:text-lg"
                />
                {fieldErrors.title && <p className="mt-1 text-xs font-medium text-red-500">{fieldErrors.title}</p>}
              </div>

              {/* Slug is hidden for REPORTER role - the auto-generation
                  effect above (or the backend safety net at save time)
                  ensures a real slug lands in the DB without the reporter
                  having to think about URLs. Editors/admin keep the field
                  so they can override for SEO. */}
              {role !== "REPORTER" && (
                <div className="space-y-1.5">
                  <Label htmlFor="slug-input">Slug{type !== "BREAKING_NEWS" && <span className="text-red-500"> *</span>}</Label>
                  <Input
                    id="slug-input"
                    ref={slugRef}
                    value={slug}
                    onChange={(e) => {
                      // Mark as manually edited so the auto-slug effect
                      // doesn't overwrite the editor's chosen value.
                      userTouchedSlug.current = true;
                      setSlug(e.target.value);
                      clearFieldError("slug");
                    }}
                    placeholder={type === "BREAKING_NEWS" ? "(optional for breaking)" : "url-segment"}
                    aria-invalid={!!fieldErrors.slug}
                    className="bg-white font-mono text-xs md:text-xs"
                  />
                  {fieldErrors.slug && <p className="mt-1 text-xs font-medium text-red-500">{fieldErrors.slug}</p>}
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="summary-input">Summary{type === "ARTICLE" && <span className="text-red-500"> *</span>}</Label>
                  {type === "ARTICLE" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => runAI("summarize")}
                      disabled={aiLoading !== null}
                      className="h-7 gap-1 px-2 text-xs text-slate-600 hover:text-slate-900"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {aiLoading === "summarize" ? "Summarizing…" : "Auto summary"}
                    </Button>
                  )}
                </div>
                <Textarea
                  id="summary-input"
                  ref={summaryRef}
                  value={summary}
                  onChange={(e) => { setSummary(e.target.value); clearFieldError("summary"); }}
                  rows={2}
                  placeholder="Short 60-word summary..."
                  aria-invalid={!!fieldErrors.summary}
                  className="bg-white"
                />
                {fieldErrors.summary && <p className="mt-1 text-xs font-medium text-red-500">{fieldErrors.summary}</p>}
              </div>

            {/* AI Article Import - minimal section header makes it
                identifiable; the తెలుగులో రాయండి button is dual-mode
                (with URL = fetch + translate, without = rewrite body). */}
            {type === "ARTICLE" && (
              <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                  AI Article Import
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={pasteUrl}
                    onChange={(e) => setPasteUrl(e.target.value)}
                    placeholder="Paste source URL (optional) - fetches + translates"
                    className="min-w-[220px] flex-1 bg-white"
                  />
                  <Button
                    size="sm"
                    onClick={() => (pasteUrl.trim() ? fetchFromUrl() : runAI("translate"))}
                    disabled={aiLoading !== null}
                    className="bg-blue-600 text-white hover:bg-blue-700"
                  >
                    {aiLoading === "translate" || aiLoading === "fetch"
                      ? "Translating…"
                      : pasteUrl.trim()
                        ? "Fetch + తెలుగులో రాయండి"
                        : "తెలుగులో రాయండి"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => runAI("editorial")}
                    disabled={aiLoading !== null}
                    className="bg-red-600 text-white hover:bg-red-700"
                  >
                    {aiLoading === "editorial" ? "Writing…" : "Editorial style"}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  No source URL? Type a short brief or idea in the Body, then click తెలుగులో రాయండి — the AI expands it into a draft for you to verify.
                </p>
              </div>
            )}

            {/* Type-specific body / payload */}
            {type === "ARTICLE" && (
              <>
                <div className="space-y-1.5">
                  <Label>Body <span className="text-red-500">*</span></Label>
                  <div
                    ref={bodyRef}
                    tabIndex={-1}
                    className={fieldErrors.body ? "rounded-md outline-none ring-2 ring-destructive" : "outline-none"}
                  >
                    <RichEditor
                      ref={editorRef}
                      content={body}
                      onChange={(v) => {
                        setBody(v);
                        if (v.replace(/<[^>]+>/g, " ").trim()) clearFieldError("body");
                      }}
                    />
                  </div>
                  {fieldErrors.body && <p className="mt-1 text-xs font-medium text-red-500">{fieldErrors.body}</p>}
                </div>
                {/* Rating + reviewer-byline are movie-review-only inputs. The
                    Source URL is also gated to that category - most ARTICLEs
                    are original reporting, not wire imports. The "Fetch +
                    translate" URL bar above already feeds sourceUrl when
                    importing from a foreign site. */}
                {(() => {
                  const cat = categories.find((c) => c.id === categoryId);
                  const isMovieReview = cat?.slug === "movie-reviews";
                  if (!isMovieReview) return null;
                  return (
                    <div className="grid gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 sm:grid-cols-[1fr_1fr_2fr]">
                      <div className="space-y-1.5">
                        <Label htmlFor="rating-input">Rating</Label>
                        <Input
                          id="rating-input"
                          type="number"
                          min="0"
                          max="5"
                          step="0.1"
                          value={rating}
                          onChange={(e) => setRating(e.target.value)}
                          placeholder="0.0 - 5.0"
                          className="bg-white"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="reviewer-input">Reviewer name</Label>
                        <Input
                          id="reviewer-input"
                          value={reviewerName}
                          onChange={(e) => setReviewerName(e.target.value)}
                          placeholder="Critic byline"
                          className="bg-white"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="source-url-input">Source URL</Label>
                        <Input
                          id="source-url-input"
                          type="url"
                          value={sourceUrl}
                          onChange={(e) => setSourceUrl(e.target.value)}
                          placeholder="https://..."
                          className="bg-white"
                        />
                      </div>
                    </div>
                  );
                })()}
              </>
            )}

            {type !== "ARTICLE" && (
              <ContentPayloadEditor type={type} payload={typedPayload} setPayload={setTypedPayload} />
            )}
            </CardContent>
          </Card>

          {/* Sidebar - all controls are shadcn (no native <select> / <input>
              chrome). The "_none" / "_auto" sentinels exist because shadcn
              <Select> refuses an empty-string value; we translate at the
              boundary so the rest of the file still stores "" for "unset". */}
          <div className="flex flex-col gap-4">
            <Section title="Publishing">
              <div className="space-y-1.5">
                <Label htmlFor="status-select">Status</Label>
                {/* Options driven by permissions.ts (canSetStatus): Reporters
                    get DRAFT/SUBMITTED; Sub-Editors add IN_REVIEW/APPROVED/
                    REJECTED; Editors/Admins get SCHEDULED/PUBLISHED/ARCHIVED.
                    The current status is always shown so existing content
                    displays even if this role couldn't set it. The server PUT
                    enforces the same rule (authoritative gate). */}
                <SearchableSelect
                  id="status-select"
                  value={status}
                  onValueChange={setStatus}
                  searchPlaceholder="Filter status…"
                  options={ARTICLE_STATUSES
                    .filter((s) => canSetStatus(role as Role, s) || s === status)
                    .map((s) => ({ value: s, label: s }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="schedule-for">Schedule for</Label>
                <DateTimePicker value={scheduledAt} onChange={setScheduledAt} placeholder="Pick date & time" />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="featured-flag"
                  checked={featured}
                  onCheckedChange={(v) => setFeatured(v === true)}
                />
                <Label htmlFor="featured-flag" className="cursor-pointer text-sm font-medium">
                  Featured
                </Label>
              </div>
            </Section>

            {/* Payment panel - only meaningful for ARTICLE type. Shows the
                per-article amount + status, with edit pencil for Editors. */}
            {type === "ARTICLE" && <PaymentPanel contentId={contentId} />}

            <Section title="Classification">
              <div className="space-y-1.5">
                <Label htmlFor="category-select">Primary category</Label>
                <SearchableSelect
                  id="category-select"
                  value={categoryId}
                  onValueChange={setCategoryId}
                  emptyLabel="None"
                  searchPlaceholder="Search categories…"
                  // Child categories show their parent's nameEn as sublabel so
                  // "Automobile" reads as "Automobile (Business)". Lookup table
                  // built once per render - categories list is ~60 rows so this
                  // is cheap.
                  options={(() => {
                    const byId = new Map(categories.map((c) => [c.id, c.nameEn]));
                    return categories.map((c) => ({
                      value: c.id,
                      label: c.nameEn,
                      sublabel: c.parentId ? `(${byId.get(c.parentId) ?? "-"})` : undefined,
                    }));
                  })()}
                />
              </div>

              {/* Multi-category cross-listing - collapsed by default so the
                  sidebar isn't dominated by ~60 chips. Native <details> so
                  there's no extra dep; the summary shows the current count.
                  Auto-opens when at least one extra category is already set. */}
              <details
                className="group rounded-md border bg-white"
                open={additionalCategoryIds.length > 0}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-semibold text-gray-700 select-none">
                  <span>
                    Also list under{" "}
                    {additionalCategoryIds.length > 0 ? (
                      <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                        {additionalCategoryIds.length}
                      </span>
                    ) : (
                      <span className="font-normal text-gray-400">(optional)</span>
                    )}
                  </span>
                  <ChevronDownIcon
                    aria-hidden="true"
                    size={14}
                    className="text-gray-400 transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="border-t bg-gray-50 p-2">
                  <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto">
                    {categories.filter((c) => c.id !== categoryId).map((c) => {
                      const on = additionalCategoryIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setAdditionalCategoryIds((prev) =>
                            prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                          )}
                          className={cn(
                            "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
                            on
                              ? "border-blue-300 bg-blue-50 text-blue-700"
                              : "border-gray-200 bg-white text-gray-700 hover:bg-gray-100",
                          )}
                        >
                          {on ? "✓ " : ""}{c.nameEn}
                        </button>
                      );
                    })}
                    {categories.length === 0 && (
                      <span className="text-[11px] text-gray-400">Loading…</span>
                    )}
                  </div>
                </div>
              </details>

              <div className="space-y-1.5">
                <Label htmlFor="desk-select">Desk (auto-resolves if blank)</Label>
                <SearchableSelect
                  id="desk-select"
                  value={deskId}
                  onValueChange={setDeskId}
                  emptyLabel="Auto"
                  searchPlaceholder="Search desks…"
                  // Display strips the publication prefix ("Rayalaseema News ")
                  // so the dropdown reads "Movie Reviews Desk" / "Business Desk"
                  // - value (d.id) is unchanged.
                  options={desks.map((d) => ({
                    value: d.id,
                    label: d.nameEn.replace(/^Rayalaseema News\s+/i, ""),
                  }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="constituency-select">Constituency</Label>
                <SearchableSelect
                  id="constituency-select"
                  value={constituencyId}
                  onValueChange={setConstituencyId}
                  emptyLabel="None"
                  searchPlaceholder="Search constituencies or districts…"
                  options={constituencies.map((c: any) => ({
                    value: c.id,
                    label: c.nameEn,
                    sublabel: `(${c.districtName})`,
                  }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="language-select">Language</Label>
                <SearchableSelect
                  id="language-select"
                  value={language}
                  onValueChange={setLanguage}
                  searchPlaceholder="Filter language…"
                  options={[
                    { value: "TELUGU", label: "Telugu" },
                    { value: "ENGLISH", label: "English" },
                  ]}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tags-input">Tags (comma-separated)</Label>
                <Input
                  id="tags-input"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="elections, politics, ap"
                  className="bg-white"
                />
                {/* Curated + usage-ranked tag suggestions, scoped to the
                    currently selected category. Click a chip → appended to
                    the comma-separated input (deduped, case-insensitive). */}
                <TagSuggestions
                  categoryId={categoryId}
                  currentNames={
                    new Set(
                      tagsInput
                        .split(",")
                        .map((s) => s.trim().toLowerCase())
                        .filter(Boolean),
                    )
                  }
                  onAddTag={(name) => {
                    const existing = tagsInput
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    const lc = name.toLowerCase();
                    if (existing.some((t) => t.toLowerCase() === lc)) return;
                    setTagsInput([...existing, name].join(", "));
                  }}
                  onRemoveTag={(name) => {
                    const lc = name.toLowerCase();
                    const next = tagsInput
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .filter((t) => t.toLowerCase() !== lc);
                    setTagsInput(next.join(", "));
                  }}
                />
              </div>
            </Section>

          </div>
        </div>
      </main>

      <ImageSearchModal
        open={imageSearchOpen}
        initialQuery={title.replace(/<[^>]+>/g, "").trim().slice(0, 80)}
        onClose={() => setImageSearchOpen(false)}
        onPick={(url) => { setFeaturedImage(url); setCropSrc(url); }}
      />

      {cropSrc && (
        <ImageCropModal
          src={cropSrc}
          onClose={() => setCropSrc(null)}
          onConfirm={(url) => {
            // Modal now crops + uploads server-side and returns the hosted
            // URL (or the original URL unchanged if no crop was drawn). Just
            // adopt it - no client-side re-upload needed.
            if (url) setFeaturedImage(url);
            setCropSrc(null);
          }}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4">{children}</CardContent>
    </Card>
  );
}
