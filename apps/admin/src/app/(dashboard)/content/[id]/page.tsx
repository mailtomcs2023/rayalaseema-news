// /content/[id] — morphing editor (Spec #1 #117 + F2-F6).
//
// F1 ships: common fields (Title, Slug, Summary, Category, Desk, Constituency,
// Featured image, Tags, Featured?, Language, Status) + ARTICLE subform (body
// via RichEditor + rating/reviewerName/sourceUrl).
//
// Other ContentTypes render type-specific subforms in F2-F6. Until those land,
// non-ARTICLE rows still see common fields and can save title/category/etc;
// the type-specific subform panel surfaces a "coming soon" callout.
"use client";

import { ArrowLeft } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { buildSlugFromTitle, isPlaceholderSlug, sanitizeSlug } from "@/lib/slug";
import { Sidebar } from "@/components/sidebar";
import { RichEditor, type RichEditorRef } from "@/components/rich-editor";
import { ImageUpload } from "@/components/image-upload";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Category { id: string; name: string; nameEn: string; slug: string; parentId?: string | null }

const TYPE_META: Record<string, { label: string; bg: string; fg: string }> = {
  ARTICLE: { label: "Article", bg: "#fee2e2", fg: "#991b1b" },
  VIDEO: { label: "Video", bg: "#dbeafe", fg: "#1e40af" },
  REEL: { label: "Reel", bg: "#dcfce7", fg: "#166534" },
  WEB_STORY: { label: "Web Story", bg: "#fef3c7", fg: "#92400e" },
  PHOTO_GALLERY: { label: "Photo Gallery", bg: "#f3e8ff", fg: "#6b21a8" },
  CARTOON: { label: "Cartoon", bg: "#fce7f3", fg: "#9d174d" },
  BREAKING_NEWS: { label: "Breaking News", bg: "#fef2f2", fg: "#7f1d1d" },
};

export default function ContentEditorPage() {
  const router = useRouter();
  const params = useParams();
  const contentId = params.id as string;

  // Role gate — only EDITOR/ADMIN can move content into PUBLISHED / SCHEDULED /
  // APPROVED. Sub-editor + reporter see Save Draft only, and the Status
  // dropdown hides the gated values so they can't bypass via the select.
  const { data: session } = useSession();
  const role = (session?.user as any)?.role || "REPORTER";
  const canPublish = ["EDITOR", "ADMIN"].includes(role);

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
  const [categoryId, setCategoryId] = useState("");
  const [deskId, setDeskId] = useState("");
  const [constituencyId, setConstituencyId] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [featured, setFeatured] = useState(false);
  const [language, setLanguage] = useState("TELUGU");
  const [tagsInput, setTagsInput] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [imageSearchOpen, setImageSearchOpen] = useState(false);
  // After picking from search OR pasting a URL, hand the (already EXIF-
  // stripped, RE-stamped) image to the crop modal so the user can frame it.
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  // ARTICLE-specific (payload)
  const [rating, setRating] = useState<string>("");
  const [reviewerName, setReviewerName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  // Typed payload state for non-ARTICLE types (F2-F6).
  const [typedPayload, setTypedPayload] = useState<Record<string, unknown>>({});
  const [payloadError, setPayloadError] = useState("");

  // AI helpers (translate / editorial / summarize / headline) + URL fetch.
  // Ported from the legacy /articles/[id] editor — same /api/ai/rewrite and
  // /api/fetch-news endpoints, now wired into the unified content editor.
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [pasteUrl, setPasteUrl] = useState("");

  const editorRef = useRef<RichEditorRef>(null);

  // Pipe error/success state through Sonner toasts — the inline banner was
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
  //   - userTouchedSlug ref — once the editor types in the slug field, this
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
        // output — fall back to client-side transliteration via the shared
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
    if (!text) { setError("No content to process — type or paste something first."); return; }
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
          setSuccess(String(data.result));
        } else {
          // Translate / editorial — full body rewrite.
          const h2 = data.result.match(/<h2[^>]*>(.*?)<\/h2>/);
          if (h2) setTitle(h2[1].replace(/<[^>]+>/g, "").trim());
          const p = data.result.match(/<p[^>]*>(.*?)<\/p>/);
          if (p) {
            const first = p[1].replace(/<[^>]+>/g, "").trim();
            if (first.length > 20) setSummary(first.substring(0, 200));
          }
          setBody(data.result);
          editorRef.current?.setContent(data.result);
          setSuccess(`Done. Tokens used: ${data.tokens?.total_tokens || data.tokens?.total || 0}`);
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
      if (data.ogImage && !featuredImage) setFeaturedImage(data.ogImage);
      if (data.slug) setSlug(data.slug);
      setSourceUrl(pasteUrl.trim());
      setPasteUrl("");
      const kw = Array.isArray(data.keywords) && data.keywords.length ? ` Keywords: ${data.keywords.join(", ")}.` : "";
      setSuccess(`Fetched + translated.${kw} Review + Save Draft when ready.`);
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
      setDeskId(row.deskId || "");
      setConstituencyId(row.constituencyId || "");
      setStatus(row.status || "DRAFT");
      setFeatured(!!row.featured);
      setLanguage(row.language || "TELUGU");
      setSourceUrl(row.sourceUrl || "");
      if (row.scheduledAt) {
        const d = new Date(row.scheduledAt);
        const off = d.getTimezoneOffset() * 60000;
        setScheduledAt(new Date(d.getTime() - off).toISOString().slice(0, 16));
      }
      if (Array.isArray(row.tags)) {
        setTagsInput(row.tags.map((t: any) => t.tag?.name).filter(Boolean).join(", "));
      }
      // Project payload into the right state shape per type. ARTICLE pulls
      // rating + reviewerName into dedicated inputs; everything else hands the
      // raw payload to ContentPayloadEditor which switches on type internally.
      const payload = row.payload || {};
      if (row.type === "ARTICLE") {
        setRating(typeof payload.rating === "number" ? String(payload.rating) : "");
        setReviewerName(payload.reviewerName || "");
      } else {
        setTypedPayload(payload as Record<string, unknown>);
      }
      setLoading(false);
    });
  }, [contentId]);

  const buildPayload = () => {
    if (type === "ARTICLE") {
      const p: Record<string, unknown> = {};
      if (rating.trim()) {
        const n = parseFloat(rating);
        if (Number.isFinite(n)) p.rating = n;
      }
      if (reviewerName.trim()) p.reviewerName = reviewerName.trim();
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
    // row toasts "Article published" — confusing since nothing was newly
    // published, it was already live.
    const prevStatus = status;

    const payload = buildPayload();
    if (payload === undefined) {
      setSaving(false);
      return;
    }

    const finalStatus = newStatus || status;

    const body_ = {
      type,
      title,
      slug,
      summary: summary || null,
      body: type === "ARTICLE" ? body : null,
      featuredImage: featuredImage || null,
      categoryId: categoryId || null,
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
        <Sidebar />
        <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>Loading…</main>
      </div>
    );
  }

  const typeMeta = TYPE_META[type] || { label: type, bg: "#eee", fg: "#555" };
  const constituencies = districts.flatMap((d) =>
    (d.constituencies || []).map((c: any) => ({ ...c, districtName: d.nameEn })));

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
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
          {/* Button layout adapts to current status:
              - PUBLISHED/SCHEDULED: single "Update" button that re-saves in the
                same status (no "Save Draft" — that would silently demote a
                live article to draft, which is a destructive surprise).
                Editors can use the Status dropdown in the right rail to
                explicitly unpublish if they need to.
              - Anything else (DRAFT, SUBMITTED, etc.): "Save Draft" + "Publish"
                (Publish gated to Editor/Admin via canPublish). */}
          {(status === "PUBLISHED" || status === "SCHEDULED") ? (
            <Button
              onClick={() => handleSave()}
              disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {saving ? "Updating…" : "Update"}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleSave()} disabled={saving}>
                {saving ? "Saving…" : "Save Draft"}
              </Button>
              {canPublish && (
                <Button
                  onClick={() => handleSave("PUBLISHED")}
                  disabled={saving}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  Publish
                </Button>
              )}
            </>
          )}
        </div>

        <div className="shadcn-scope grid gap-5" style={{ gridTemplateColumns: "minmax(0, 1fr) 320px" }}>
          {/* Main column */}
          <Card className="gap-4 py-5">
            <CardContent className="space-y-4">
              {/* Featured image — pinned at the top so the hero visual is the
                  first thing the editor sees and confirms before scrolling down
                  to title/body. */}
              <div className="space-y-2">
                <Label>Featured image</Label>
                <ImageUpload
                  value={featuredImage}
                  onChange={setFeaturedImage}
                  onSearchClick={() => setImageSearchOpen(true)}
                />
              </div>

              {/* Common */}
              <div className="space-y-1.5">
                <Label htmlFor="title-input">Title *</Label>
                <Input
                  id="title-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-12 bg-white text-lg font-bold md:text-lg"
                />
              </div>

              {/* Slug is hidden for REPORTER role — the auto-generation
                  effect above (or the backend safety net at save time)
                  ensures a real slug lands in the DB without the reporter
                  having to think about URLs. Editors/admin keep the field
                  so they can override for SEO. */}
              {role !== "REPORTER" && (
                <div className="space-y-1.5">
                  <Label htmlFor="slug-input">Slug</Label>
                  <Input
                    id="slug-input"
                    value={slug}
                    onChange={(e) => {
                      // Mark as manually edited so the auto-slug effect
                      // doesn't overwrite the editor's chosen value.
                      userTouchedSlug.current = true;
                      setSlug(e.target.value);
                    }}
                    placeholder={type === "BREAKING_NEWS" ? "(optional for breaking)" : "url-segment"}
                    className="bg-white font-mono text-xs md:text-xs"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="summary-input">Summary</Label>
                <Textarea
                  id="summary-input"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={2}
                  placeholder="Short 60-word summary..."
                  className="bg-white"
                />
              </div>

            {/* AI assist — ARTICLE only. Paste URL → fetch + translate, or
                run translate / editorial / summarize / headline on the
                current body. */}
            {type === "ARTICLE" && (
              <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                <Input
                  value={pasteUrl}
                  onChange={(e) => setPasteUrl(e.target.value)}
                  placeholder="Paste a source URL (optional) — తెలుగులో రాయండి will fetch + translate it"
                  className="bg-white text-xs md:text-xs"
                />
                <div className="flex flex-wrap gap-2">
                  {/* Unified Telugu button: if URL pasted -> scrape + translate
                      (was the separate "Fetch + translate" button); else translate
                      the existing title/summary/body in place. */}
                  <Button
                    size="sm"
                    onClick={() => (pasteUrl.trim() ? fetchFromUrl() : runAI("translate"))}
                    disabled={aiLoading !== null}
                    className="bg-blue-600 text-white hover:bg-blue-700"
                  >
                    {aiLoading === "translate" || aiLoading === "fetch" ? "Translating…" : "తెలుగులో రాయండి"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => runAI("editorial")}
                    disabled={aiLoading !== null}
                    className="bg-red-600 text-white hover:bg-red-700"
                  >
                    {aiLoading === "editorial" ? "Writing…" : "Editorial style"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => runAI("summarize")}
                    disabled={aiLoading !== null}
                  >
                    {aiLoading === "summarize" ? "Summarizing…" : "Summarize"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => runAI("headline")}
                    disabled={aiLoading !== null}
                  >
                    {aiLoading === "headline" ? "Generating…" : "Headline ideas"}
                  </Button>
                </div>
              </div>
            )}

            {/* Type-specific body / payload */}
            {type === "ARTICLE" && (
              <>
                <div className="space-y-1.5">
                  <Label>Body</Label>
                  <RichEditor ref={editorRef} content={body} onChange={setBody} />
                </div>
                {/* Rating + reviewer-byline are movie-review-only inputs. The
                    Source URL is also gated to that category — most ARTICLEs
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

          {/* Sidebar — all controls are shadcn (no native <select> / <input>
              chrome). The "_none" / "_auto" sentinels exist because shadcn
              <Select> refuses an empty-string value; we translate at the
              boundary so the rest of the file still stores "" for "unset". */}
          <div className="flex flex-col gap-4">
            <Section title="Publishing">
              <div className="space-y-1.5">
                <Label htmlFor="status-select">Status</Label>
                {/* APPROVED / SCHEDULED / PUBLISHED hidden for non-publishers so
                    a sub-editor can't bypass the editorial workflow by picking
                    them from the dropdown + clicking Save. The server-side PUT
                    is the authoritative gate; this just keeps the UI honest. */}
                <SearchableSelect
                  id="status-select"
                  value={status}
                  onValueChange={setStatus}
                  searchPlaceholder="Filter status…"
                  options={(["DRAFT", "SUBMITTED", "IN_REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "REJECTED", "ARCHIVED"] as const)
                    .filter((s) => canPublish || !["APPROVED", "SCHEDULED", "PUBLISHED"].includes(s))
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

            {/* Payment panel — only meaningful for ARTICLE type. Shows the
                per-article amount + status, with edit pencil for Editors. */}
            {type === "ARTICLE" && <PaymentPanel contentId={contentId} />}

            <Section title="Classification">
              <div className="space-y-1.5">
                <Label htmlFor="category-select">Category</Label>
                <SearchableSelect
                  id="category-select"
                  value={categoryId}
                  onValueChange={setCategoryId}
                  emptyLabel="None"
                  searchPlaceholder="Search categories…"
                  // Child categories show their parent's nameEn as sublabel so
                  // "Automobile" reads as "Automobile (Business)". Lookup table
                  // built once per render — categories list is ~60 rows so this
                  // is cheap.
                  options={(() => {
                    const byId = new Map(categories.map((c) => [c.id, c.nameEn]));
                    return categories.map((c) => ({
                      value: c.id,
                      label: c.nameEn,
                      sublabel: c.parentId ? `(${byId.get(c.parentId) ?? "—"})` : undefined,
                    }));
                  })()}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="desk-select">Desk (auto-resolves if blank)</Label>
                <SearchableSelect
                  id="desk-select"
                  value={deskId}
                  onValueChange={setDeskId}
                  emptyLabel="Auto"
                  searchPlaceholder="Search desks…"
                  // Display strips the publication prefix ("Rayalaseema Express ")
                  // so the dropdown reads "Movie Reviews Desk" / "Business Desk"
                  // — value (d.id) is unchanged.
                  options={desks.map((d) => ({
                    value: d.id,
                    label: d.nameEn.replace(/^Rayalaseema Express\s+/i, ""),
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
                {/* AI-seeded + usage-ranked tag suggestions, scoped to the
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
          onConfirm={async (dataUrl) => {
            // Crop modal returns a data URL. If user skipped crop the data
            // URL == the original Azure URL we passed in — bail out without
            // re-uploading.
            if (!dataUrl.startsWith("data:")) { setCropSrc(null); return; }
            try {
              const blob = await (await fetch(dataUrl)).blob();
              const form = new FormData();
              form.append("file", blob, "cropped.jpg");
              const res = await fetch("/api/upload", { method: "POST", body: form });
              const data = await res.json();
              if (res.ok && data.url) setFeaturedImage(data.url);
              else setError(data.error || "Upload failed");
            } catch (e: any) {
              setError(e.message || "Crop upload failed");
            }
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
