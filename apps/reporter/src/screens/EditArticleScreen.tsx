import React, { useState, useEffect, useLayoutEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Image, ActivityIndicator } from "react-native";
import { TextInput } from "../components/Input";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { api, uploadImage } from "../api/client";
import { useT } from "../i18n";
import { FieldError } from "../components/FieldError";
import { articleSchema, fieldErrors } from "../lib/validation";
import { useRouter, useNavigation, useLocalSearchParams } from "expo-router";

// Reporter's "view / edit / delete one of my articles" screen.
//
// Editing and deletion are permitted while the article's status is "SUBMITTED"
// or "DRAFT" — both states still belong to the reporter. Once an editor pulls
// it into review (IN_REVIEW) or it's been decided (APPROVED / PUBLISHED /
// REJECTED), the screen renders in read-only mode: every input is disabled,
// Save / Delete / Translate / Submit are hidden, and a status banner explains
// why. A DRAFT article also gets a "Submit for Review" button so the reporter
// can promote it without going back to the new-article flow. The server
// enforces the same rules on PATCH/DELETE, so the UI is a hint — not the
// security boundary.
const EDITABLE_STATUSES = ["SUBMITTED", "DRAFT"] as const;

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#f3f4f6", text: "#555" },
  SUBMITTED: { bg: "#fef3c7", text: "#92400e" },
  IN_REVIEW: { bg: "#dbeafe", text: "#1d4ed8" },
  APPROVED: { bg: "#dcfce7", text: "#166534" },
  PUBLISHED: { bg: "#dcfce7", text: "#166534" },
  REJECTED: { bg: "#fef2f2", text: "#dc2626" },
};

// Strip wrapping <p> / other tags the body was saved with. The list and
// detail views expect plain-text bodies in the editor; HTML is added back
// on save (same shape as NewArticleScreen).
function htmlToPlain(html: string): string {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function EditArticleScreen() {
  const { t } = useT();
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id?: string }>();

  // Article state
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState<string>("");
  const editable = (EDITABLE_STATUSES as readonly string[]).includes(status);
  const isDraft = status === "DRAFT";

  // Form fields
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [imageUri, setImageUri] = useState("");
  const [existingImage, setExistingImage] = useState("");

  // Category list (same pattern as NewArticleScreen)
  const [categories, setCategories] = useState<any[]>([]);
  const [catLoading, setCatLoading] = useState(true);
  const [catError, setCatError] = useState("");

  // Action state — three independent operations; while any is in flight the
  // others are disabled so we don't fire overlapping PATCH/DELETE requests.
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const busy = saving || deleting || submitting;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const clearErr = (k: string) => setErrors((e) => (e[k] ? { ...e, [k]: "" } : e));

  const loadArticle = useCallback(async () => {
    if (!id) {
      setLoadError(t("editArticle.missingId"));
      setLoading(false);
      return;
    }
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

  useEffect(() => { loadArticle(); }, [loadArticle]);
  useEffect(() => { loadCategories(); }, [loadCategories]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: t("editArticle.title") });
  }, [navigation, t]);

  const pickImage = async () => {
    if (!editable) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.8 });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  };

  const takePhoto = async () => {
    if (!editable) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert(t("register.cameraPermission"));
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  };

  const translateToTelugu = async () => {
    if (!editable) return;
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

  const handleSave = async () => {
    if (!editable || !id) return;
    const parsed = articleSchema(t).safeParse({ title, body, categoryId });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setSaving(true);

    try {
      // Only upload a new image if the reporter picked one; otherwise keep the
      // existing featuredImage URL unchanged (sent as undefined so the PATCH
      // doesn't overwrite it).
      let featuredImage: string | undefined = undefined;
      if (imageUri) {
        featuredImage = await uploadImage(imageUri);
      }

      await api(`/api/reporter/articles/${id}`, {
        method: "PATCH",
        body: {
          title: title.trim(),
          summary: summary.trim(),
          body: `<p>${body.trim()}</p>`,
          categoryId,
          ...(featuredImage !== undefined ? { featuredImage } : {}),
        },
      });

      Alert.alert(
        t("editArticle.savedTitle"),
        t("editArticle.savedMsg"),
        [{ text: t("common.ok"), onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message);
    }
    setSaving(false);
  };

  // DRAFT → SUBMITTED transition. Saves any pending field edits at the same
  // time so the reporter doesn't have to tap Save Draft first. The server
  // permits exactly this transition and rejects any other.
  const handleSubmitReview = async () => {
    if (!editable || !id || !isDraft) return;
    const parsed = articleSchema(t).safeParse({ title, body, categoryId });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setSubmitting(true);
    try {
      let featuredImage: string | undefined = undefined;
      if (imageUri) {
        featuredImage = await uploadImage(imageUri);
      }
      await api(`/api/reporter/articles/${id}`, {
        method: "PATCH",
        body: {
          title: title.trim(),
          summary: summary.trim(),
          body: `<p>${body.trim()}</p>`,
          categoryId,
          status: "SUBMITTED",
          ...(featuredImage !== undefined ? { featuredImage } : {}),
        },
      });
      Alert.alert(
        t("newArticle.submittedTitle"),
        t("newArticle.submittedMsg"),
        [{ text: t("common.ok"), onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message);
    }
    setSubmitting(false);
  };

  const handleDelete = () => {
    if (!editable || !id) return;
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

  // --- Render branches ---

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
      {/* Status banner — explains why fields are locked when not editable */}
      <View style={[styles.statusBanner, { backgroundColor: sc.bg }]}>
        <Text style={[styles.statusBannerLabel, { color: sc.text }]}>
          {t("editArticle.statusPrefix")}: {status}
        </Text>
        {!editable && (
          <Text style={styles.readOnlyHint}>{t("editArticle.readOnlyHint")}</Text>
        )}
      </View>

      {/* Title */}
      <Text style={styles.label}>{t("newArticle.headline")}</Text>
      <TextInput
        style={[styles.input, errors.title ? styles.inputError : null, !editable && styles.inputDisabled]}
        value={title}
        editable={editable}
        onChangeText={(v) => { setTitle(v); clearErr("title"); }}
        placeholder={t("newArticle.headlinePlaceholder")}
        multiline numberOfLines={2}
      />
      <FieldError message={errors.title} />

      {/* Summary — multi-line textarea. `textAlignVertical: top` is required
          on Android so the caret starts at the top instead of being centered
          vertically (iOS already does this with multiline). */}
      <Text style={styles.label}>{t("newArticle.summary")}</Text>
      <TextInput
        style={[styles.input, styles.textarea, !editable && styles.inputDisabled]}
        value={summary}
        editable={editable}
        onChangeText={setSummary}
        placeholder={t("newArticle.summaryPlaceholder")}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />

      {/* Body */}
      <Text style={styles.label}>{t("newArticle.body")}</Text>
      <TextInput
        style={[styles.input, { height: 200, textAlignVertical: "top" }, errors.body ? styles.inputError : null, !editable && styles.inputDisabled]}
        value={body}
        editable={editable}
        onChangeText={(v) => { setBody(v); clearErr("body"); }}
        placeholder={t("newArticle.bodyPlaceholder")}
        multiline
      />
      <FieldError message={errors.body} />

      {/* AI Translate — only when editable. Solid brand-red pill with a
          sparkles icon to signal an assistive AI action. */}
      {editable && (
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
        </View>
      ) : (
        <View style={styles.chipRow}>
          {categories.map((c) => {
            const active = categoryId === c.id;
            return (
              <TouchableOpacity
                key={c.id}
                disabled={!editable}
                onPress={() => { setCategoryId(c.id); clearErr("categoryId"); }}
                style={[
                  styles.chip,
                  active && { backgroundColor: c.color || "#FF2C2C", borderColor: c.color || "#FF2C2C" },
                  !editable && !active && styles.chipDisabled,
                ]}
              >
                <Text style={[styles.chipText, active && { color: "#fff" }]}>{c.name || c.nameEn || c.slug}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      <FieldError message={errors.categoryId} />

      {/* Photo — only swappable when editable; the existing image is always shown */}
      <Text style={styles.label}>{t("newArticle.featuredImage")}</Text>
      {editable && (
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

      {/* Action buttons — only when editable.
          SUBMITTED: [Delete] + [Save Changes].
          DRAFT:     [Delete] + [Save Draft] + [Submit for Review]. */}
      {editable && (
        <View style={styles.submitRow}>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDelete}
            disabled={busy}
          >
            <Ionicons name="trash-outline" size={16} color="#dc2626" />
            <Text style={styles.deleteText}>
              {deleting ? t("editArticle.deleting") : t("editArticle.deleteAction")}
            </Text>
          </TouchableOpacity>

          {isDraft ? (
            <>
              <TouchableOpacity
                style={styles.saveDraftBtn}
                onPress={handleSave}
                disabled={busy}
              >
                <Text style={styles.saveDraftText}>
                  {saving ? t("editArticle.saving") : t("newArticle.saveDraft")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSubmitReview}
                disabled={busy}
              >
                <Text style={styles.saveText}>
                  {submitting ? t("newArticle.submitting") : t("newArticle.submitReview")}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSave}
              disabled={busy}
            >
              <Text style={styles.saveText}>
                {saving ? t("editArticle.saving") : t("editArticle.saveChanges")}
              </Text>
            </TouchableOpacity>
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

  statusBanner: { borderRadius: 10, padding: 12, marginBottom: 16 },
  statusBannerLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },
  readOnlyHint: { fontSize: 12, color: "#555", marginTop: 4 },

  label: { fontSize: 12, fontWeight: "700", color: "#555", marginBottom: 4, marginTop: 8 },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 14, fontSize: 15, marginBottom: 8 },
  // Summary textarea — grows from ~4 lines tall, content top-anchored.
  textarea: { minHeight: 100, paddingTop: 12, lineHeight: 22 },
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
  // Save Draft button — neutral, sits between Delete and the prominent
  // Submit-for-Review button on a draft.
  saveDraftBtn: { flex: 1, padding: 16, backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center", justifyContent: "center" },
  saveDraftText: { fontSize: 14, fontWeight: "700", color: "#475569" },
  saveBtn: { flex: 2, padding: 16, backgroundColor: "#FF2C2C", borderRadius: 10, alignItems: "center" },
  saveText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
