import React, { useState, useEffect, useLayoutEffect, useCallback } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Image, ActivityIndicator } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { api, uploadImage } from "../api/client";
import { useT } from "../i18n";
import { FieldError } from "../components/FieldError";
import { articleSchema, fieldErrors } from "../lib/validation";
import { useRouter, useNavigation, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

// One screen, two modes:
//
//   CREATE  — opened via /new-article. POSTs to /api/reporter/articles.
//             Buttons: [Save Draft] [Submit for Review].
//
//   EDIT    — opened via /new-article?id=<articleId>. GETs the article on
//             mount, pre-fills every field, PATCHes on save. Buttons depend
//             on status:
//               DRAFT     → [Delete] [Save Draft] [Submit for Review]
//               SUBMITTED → [Delete] [Save Changes]
//               anything else → read-only (banner + disabled inputs, no buttons)
//
// Status colours for the read-only banner — taken straight from the badges
// in the lists so the visual language matches.
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  DRAFT:     { bg: "#f3f4f6", text: "#555" },
  SUBMITTED: { bg: "#fef3c7", text: "#92400e" },
  IN_REVIEW: { bg: "#dbeafe", text: "#1d4ed8" },
  APPROVED:  { bg: "#dcfce7", text: "#166534" },
  PUBLISHED: { bg: "#dcfce7", text: "#166534" },
  REJECTED:  { bg: "#fef2f2", text: "#dc2626" },
};

const EDITABLE_STATUSES = ["SUBMITTED", "DRAFT"] as const;

// Status enum (server) → i18n key for the caption shown in the native header.
// Falls back to the raw enum string if a future status sneaks in.
const STATUS_LABEL_KEYS: Record<string, string> = {
  DRAFT: "status.draft",
  SUBMITTED: "status.submitted",
  IN_REVIEW: "status.inReview",
  APPROVED: "status.approved",
  REJECTED: "status.rejected",
  PUBLISHED: "status.published",
};

// Saved bodies are wrapped in <p>…</p> (and possibly other tags from older
// data). The composer is a plain TextInput, so strip tags on load and re-
// wrap on save.
function htmlToPlain(html: string): string {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function NewArticleScreen() {
  const { t, lang } = useT();
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;

  // ---- Article load state (only relevant in EDIT mode) ----
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState<string>("");
  const editable = !editing || (EDITABLE_STATUSES as readonly string[]).includes(status);
  const isDraft = status === "DRAFT";
  const readOnly = editing && !editable;

  // ---- Form fields ----
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [imageUri, setImageUri] = useState("");
  const [existingImage, setExistingImage] = useState("");

  // ---- Categories ----
  const [categories, setCategories] = useState<any[]>([]);
  const [catLoading, setCatLoading] = useState(true);
  const [catError, setCatError] = useState("");

  // ---- Action state ----
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [translating, setTranslating] = useState(false);
  const busy = saving || submitting || deleting;
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ---- KYC gate: only VERIFIED reporters can hit "Submit for Review".
  // PENDING / SUBMITTED / REJECTED reporters can save drafts but the submit
  // button is replaced by a locked hint.
  const [kycVerified, setKycVerified] = useState(true);
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem("user").then((raw) => {
      if (cancelled || !raw) return;
      try {
        const u = JSON.parse(raw);
        setKycVerified((u.kycStatus || "PENDING") === "VERIFIED");
      } catch {}
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const clearErr = (k: string) => setErrors((e) => (e[k] ? { ...e, [k]: "" } : e));

  // Load article (EDIT mode only).
  const loadArticle = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError("");
    try {
      const a = await api(`/api/reporter/articles/${id}`);
      setStatus(a.status || "");
      setTitle(a.title || "");
      setSummary(a.summary || "");
      setBody(htmlToPlain(a.body || ""));
      setCategoryId(a.categoryId || "");
      setExistingImage(a.featuredImage || "");
    } catch (e: any) {
      const msg = e?.message || "";
      setLoadError(/unauthor/i.test(msg) ? t("newArticle.sessionExpired") : (msg || t("editArticle.loadError")));
    }
    setLoading(false);
  }, [id, t]);
  useEffect(() => { loadArticle(); }, [loadArticle]);

  // Categories — same pattern as before; inline retry on failure.
  const loadCategories = useCallback(async () => {
    setCatLoading(true);
    setCatError("");
    try {
      const data = await api("/api/reporter/categories");
      setCategories(Array.isArray(data) ? data : []);
    } catch (e: any) {
      const msg = e?.message || "";
      const friendly = /unauthor/i.test(msg) ? t("newArticle.sessionExpired") : t("newArticle.categoriesError");
      setCatError(__DEV__ ? `${friendly}\n\n${msg}` : friendly);
    }
    setCatLoading(false);
  }, [t]);
  useEffect(() => { loadCategories(); }, [loadCategories]);

  useLayoutEffect(() => {
    if (!editing) {
      // CREATE mode — plain string title.
      navigation.setOptions({ title: t("nav.newArticle"), headerTitle: undefined });
      return;
    }
    // EDIT mode — render a custom header so the status sits as a small
    // semibold caption directly under the "Edit Article" title, removing the
    // need for a duplicate in-content heading.
    const sc = STATUS_COLORS[status] || STATUS_COLORS.DRAFT;
    navigation.setOptions({
      headerTitle: () => (
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 17, fontWeight: "700", color: "#111" }}>
            {t("editArticle.title")}
          </Text>
          {status ? (
            <Text
              style={{
                fontSize: 10.5, fontWeight: "600",
                letterSpacing: 0.6, textTransform: "uppercase",
                color: sc.text, marginTop: 1,
              }}
            >
              {STATUS_LABEL_KEYS[status] ? t(STATUS_LABEL_KEYS[status]) : status}
            </Text>
          ) : null}
        </View>
      ),
    });
  }, [navigation, t, editing, status]);

  const pickImage = async () => {
    if (readOnly) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.8 });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  };

  const takePhoto = async () => {
    if (readOnly) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert(t("register.cameraPermission"));
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  };

  const translateToTelugu = async () => {
    if (readOnly) return;
    if (!body && !title) return Alert.alert(t("newArticle.writeFirst"));
    setTranslating(true);
    try {
      const data = await api("/api/ai/rewrite", {
        method: "POST",
        body: { text: `Title: ${title}\n\nBody: ${body}`, action: "translate" },
      });
      if (data.result) {
        const h2Match = data.result.match(/<h2[^>]*>(.*?)<\/h2>/);
        if (h2Match) setTitle(h2Match[1].replace(/<[^>]+>/g, "").trim());
        const pMatch = data.result.match(/<p[^>]*>(.*?)<\/p>/);
        if (pMatch) setSummary(pMatch[1].replace(/<[^>]+>/g, "").trim().substring(0, 200));
        setBody(htmlToPlain(data.result));
        Alert.alert(t("newArticle.translatedTitle"), t("newArticle.translatedMsg"));
      }
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message);
    }
    setTranslating(false);
  };

  const generateSlug = (text: string) => {
    const english = text.replace(/[^\x00-\x7F]/g, "").trim();
    if (!english) return `news-${Date.now()}`;
    return english.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").substring(0, 60);
  };

  // intent:
  //   "draft"       → save (or stay) as DRAFT
  //   "submit"      → set status to SUBMITTED (create new or promote a draft)
  //   "saveChanges" → edit-in-place without changing status (used for SUBMITTED articles)
  type SaveIntent = "draft" | "submit" | "saveChanges";
  const handleSave = async (intent: SaveIntent) => {
    if (readOnly) return;
    const parsed = articleSchema(t).safeParse({ title, body, categoryId });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});

    const flagSetter =
      intent === "draft"   ? setSaving :
      intent === "submit"  ? setSubmitting :
                             setSaving;
    flagSetter(true);

    try {
      let featuredImage: string | undefined = undefined;
      if (imageUri) {
        featuredImage = await uploadImage(imageUri);
      }

      const baseBody = {
        title: title.trim(),
        summary: summary.trim(),
        body: `<p>${body.trim()}</p>`,
        categoryId,
      };

      if (editing) {
        // EDIT mode — PATCH. Only include `status` when promoting a draft.
        const patchBody: Record<string, unknown> = { ...baseBody };
        if (intent === "submit" && status === "DRAFT") patchBody.status = "SUBMITTED";
        if (featuredImage !== undefined) patchBody.featuredImage = featuredImage;
        await api(`/api/reporter/articles/${id}`, { method: "PATCH", body: patchBody });
      } else {
        // CREATE mode — POST. `status` decides DRAFT vs SUBMITTED at insert.
        await api("/api/reporter/articles", {
          method: "POST",
          body: {
            ...baseBody,
            slug: generateSlug(title),
            featuredImage: featuredImage ?? null,
            status: intent === "submit" ? "SUBMITTED" : "DRAFT",
          },
        });
      }

      // Alert title/message — mirror the existing copy so reporters see the
      // same confirmation strings whether they're creating, drafting, or
      // editing.
      const willSubmit = intent === "submit";
      const alertTitle = willSubmit
        ? t("newArticle.submittedTitle")
        : editing
          ? t("editArticle.savedTitle")
          : t("newArticle.savedTitle");
      const alertMsg = willSubmit
        ? t("newArticle.submittedMsg")
        : editing
          ? t("editArticle.savedMsg")
          : t("newArticle.draftSavedMsg");

      Alert.alert(alertTitle, alertMsg, [
        { text: t("common.ok"), onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message);
    }
    flagSetter(false);
  };

  const handleDelete = () => {
    if (!editing || readOnly) return;
    Alert.alert(
      t("editArticle.deleteTitle"),
      t("editArticle.deleteConfirm"),
      [
        { text: t("editArticle.cancel"), style: "cancel" },
        {
          text: t("editArticle.deleteAction"),
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await api(`/api/reporter/articles/${id}`, { method: "DELETE" });
              router.back();
            } catch (e: any) {
              Alert.alert(t("common.error"), e.message);
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  // ---- Render guards ----

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#FF2C2C" />
      </View>
    );
  }
  if (loadError) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color="#dc2626" />
        <Text style={styles.loadErrorText}>{loadError}</Text>
        <TouchableOpacity onPress={loadArticle} style={styles.retryBtnLg}>
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text style={styles.retryBtnLgText}>{t("common.retry")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const sc = STATUS_COLORS[status] || STATUS_COLORS.DRAFT;
  const previewImage = imageUri || existingImage;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {/* The page heading and status caption both live in the native Stack
          header now (see useLayoutEffect above). Read-only articles still
          get a short footnote here since the header has no room for it. */}
      {readOnly && (
        <Text style={styles.readOnlyHint}>{t("editArticle.readOnlyHint")}</Text>
      )}

      {/* Title */}
      <Text style={styles.label}>{t("newArticle.headline")}</Text>
      <TextInput
        style={[styles.input, errors.title ? styles.inputError : null, readOnly && styles.inputDisabled]}
        value={title}
        editable={!readOnly}
        onChangeText={(v) => { setTitle(v); clearErr("title"); }}
        placeholder={t("newArticle.headlinePlaceholder")}
        multiline numberOfLines={2}
      />
      <FieldError message={errors.title} />

      {/* Summary */}
      <Text style={styles.label}>{t("newArticle.summary")}</Text>
      <TextInput
        style={[styles.input, { height: 60 }, readOnly && styles.inputDisabled]}
        value={summary}
        editable={!readOnly}
        onChangeText={setSummary}
        placeholder={t("newArticle.summaryPlaceholder")}
        multiline
      />

      {/* Body */}
      <Text style={styles.label}>{t("newArticle.body")}</Text>
      <TextInput
        style={[styles.input, { height: 200, textAlignVertical: "top" }, errors.body ? styles.inputError : null, readOnly && styles.inputDisabled]}
        value={body}
        editable={!readOnly}
        onChangeText={(v) => { setBody(v); clearErr("body"); }}
        placeholder={t("newArticle.bodyPlaceholder")}
        multiline
      />
      <FieldError message={errors.body} />

      {/* AI Translate — hide in read-only mode. Solid brand-red pill with a
          sparkles icon to signal it's an assistive AI action. */}
      {!readOnly && (
        <TouchableOpacity
          style={[styles.translateBtn, translating && styles.translateBtnBusy]}
          onPress={translateToTelugu}
          disabled={translating}
          activeOpacity={0.85}
        >
          {translating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="sparkles" size={16} color="#fff" />
          )}
          <Text style={styles.translateText}>
            {translating ? t("newArticle.translating") : t("newArticle.translateBtn")}
          </Text>
        </TouchableOpacity>
      )}

      {/* Category */}
      <Text style={styles.label}>{t("newArticle.category")}</Text>
      {catError ? (
        <View style={styles.catError}>
          <Text style={styles.catErrorText}>{catError}</Text>
          <TouchableOpacity onPress={loadCategories} style={styles.retryBtn}>
            <Ionicons name="refresh" size={14} color="#FF2C2C" />
            <Text style={styles.retryText}>{t("common.retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : catLoading ? (
        <Text style={styles.catLoading}>{t("common.loading")}</Text>
      ) : categories.length === 0 ? (
        <View style={styles.catError}>
          <Text style={styles.catErrorText}>{t("newArticle.categoriesEmpty")}</Text>
          <TouchableOpacity onPress={loadCategories} style={styles.retryBtn}>
            <Ionicons name="refresh" size={14} color="#FF2C2C" />
            <Text style={styles.retryText}>{t("common.retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.chipRow}>
          {categories.map((c) => {
            const active = categoryId === c.id;
            return (
              <TouchableOpacity
                key={c.id}
                disabled={readOnly}
                onPress={() => { setCategoryId(c.id); clearErr("categoryId"); }}
                style={[
                  styles.chip,
                  active && { backgroundColor: c.color || "#FF2C2C", borderColor: c.color || "#FF2C2C" },
                  readOnly && !active && styles.chipDisabled,
                ]}
              >
                <Text style={[styles.chipText, active && { color: "#fff" }]}>
                  {/* Honour the app language: English UI gets nameEn (e.g.
                      "Politics"), Telugu UI keeps the native name. Either
                      side falls back to whatever's available. */}
                  {lang === "en"
                    ? (c.nameEn || c.name || c.slug)
                    : (c.name || c.nameEn || c.slug)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      <FieldError message={errors.categoryId} />

      {/* Photo — only show the pickers when editable */}
      <Text style={styles.label}>{t("newArticle.featuredImage")}</Text>
      {!readOnly && (
        <View style={styles.photoRow}>
          <TouchableOpacity style={styles.photoBtn} onPress={takePhoto}>
            <Ionicons name="camera-outline" size={16} color="#555" />
            <Text style={styles.photoBtnText}>{t("common.camera")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.photoBtn} onPress={pickImage}>
            <Ionicons name="images-outline" size={16} color="#555" />
            <Text style={styles.photoBtnText}>{t("newArticle.gallery")}</Text>
          </TouchableOpacity>
        </View>
      )}
      {previewImage ? <Image source={{ uri: previewImage }} style={styles.preview} /> : null}

      {/* Action row — adapts to mode:
          CREATE                        → [Save Draft] [Submit]
          EDIT DRAFT                    → [Delete] [Save Draft] [Submit]
          EDIT SUBMITTED                → [Delete] [Save Changes]
          READ-ONLY (any other status)  → hidden */}
      {!readOnly && (
        <View style={styles.submitRow}>
          {editing && (
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={busy}>
              <Ionicons name="trash-outline" size={16} color="#dc2626" />
              <Text style={styles.deleteText}>
                {deleting ? t("editArticle.deleting") : t("editArticle.deleteAction")}
              </Text>
            </TouchableOpacity>
          )}

          {(!editing || isDraft) && (
            <TouchableOpacity
              style={editing ? styles.draftBtnFlex1 : styles.draftBtn}
              onPress={() => handleSave("draft")}
              disabled={busy}
            >
              <Text style={styles.draftText}>
                {saving ? "..." : t("newArticle.saveDraft")}
              </Text>
            </TouchableOpacity>
          )}

          {editing && status === "SUBMITTED" ? (
            <TouchableOpacity style={styles.submitBtn} onPress={() => handleSave("saveChanges")} disabled={busy}>
              <Text style={styles.submitText}>
                {saving ? t("editArticle.saving") : t("editArticle.saveChanges")}
              </Text>
            </TouchableOpacity>
          ) : kycVerified ? (
            <TouchableOpacity style={styles.submitBtn} onPress={() => handleSave("submit")} disabled={busy}>
              <Text style={styles.submitText}>
                {submitting ? t("newArticle.submitting") : t("newArticle.submitReview")}
              </Text>
            </TouchableOpacity>
          ) : (
            // KYC not verified — render a disabled, locked-looking button with
            // a hint so the reporter understands they can save drafts but not
            // submit until admin verifies.
            <View style={[styles.submitBtn, styles.submitBtnLocked]}>
              <Ionicons name="lock-closed" size={14} color="#888" />
              <Text style={styles.submitTextLocked}>{t("kyc.lockedSubmit")}</Text>
            </View>
          )}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  centered: { flex: 1, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },

  readOnlyHint: { fontSize: 12, color: "#64748b", marginBottom: 16, lineHeight: 18 },

  label: { fontSize: 12, fontWeight: "700", color: "#555", marginBottom: 4, marginTop: 8 },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 14, fontSize: 15, marginBottom: 8 },
  inputError: { borderColor: "#dc2626" },
  inputDisabled: { backgroundColor: "#f3f4f6", color: "#555" },

  // Solid full-width brand-red button with a subtle red glow.
  translateBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#FF2C2C",
    borderRadius: 10, paddingVertical: 14,
    marginBottom: 14,
    shadowColor: "#FF2C2C", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  translateBtnBusy: { opacity: 0.7 },
  translateText: { color: "#fff", fontSize: 14, fontWeight: "700", letterSpacing: 0.2 },

  // Wraps to multiple rows so every category is visible at once — no
  // horizontal scroll. Vertical gap on row-wrap is handled by the same `gap`.
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 4, marginBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e7eb" },
  chipDisabled: { opacity: 0.55 },
  chipText: { fontSize: 13, fontWeight: "700", color: "#555" },

  catLoading: { fontSize: 13, color: "#999", paddingVertical: 10, marginBottom: 8 },
  catError: { backgroundColor: "#fef2f2", borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "#fecaca" },
  catErrorText: { fontSize: 13, color: "#dc2626", fontWeight: "600" },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  retryText: { fontSize: 13, color: "#FF2C2C", fontWeight: "700" },
  retryBtnLg: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FF2C2C", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  retryBtnLgText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  loadErrorText: { fontSize: 14, color: "#444", textAlign: "center" },

  photoRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  photoBtn: { flex: 1, flexDirection: "row", gap: 6, padding: 14, backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center", justifyContent: "center" },
  photoBtnText: { fontSize: 14, fontWeight: "700", color: "#555" },
  preview: { width: "100%", height: 200, borderRadius: 10, marginBottom: 12 },

  submitRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  deleteBtn: { flex: 1, flexDirection: "row", gap: 6, padding: 16, backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#fecaca", alignItems: "center", justifyContent: "center" },
  deleteText: { fontSize: 14, fontWeight: "700", color: "#dc2626" },
  // CREATE mode keeps Save Draft at flex 1 next to Submit (flex 2).
  // EDIT-DRAFT mode adds the Delete button — keep all three at flex 1, 1, 2.
  draftBtn: { flex: 1, padding: 16, backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#ddd", alignItems: "center", justifyContent: "center" },
  draftBtnFlex1: { flex: 1, padding: 16, backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#ddd", alignItems: "center", justifyContent: "center" },
  draftText: { fontSize: 14, fontWeight: "700", color: "#555" },
  submitBtn: { flex: 2, padding: 16, backgroundColor: "#FF2C2C", borderRadius: 10, alignItems: "center", justifyContent: "center" },
  submitBtnLocked: { backgroundColor: "#f3f4f6", flexDirection: "row", gap: 6, padding: 14 },
  submitTextLocked: { fontSize: 12, fontWeight: "700", color: "#888", textAlign: "center" },
  submitText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
