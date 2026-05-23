import React, { useEffect, useState } from "react";
import {
  View, Text, Modal, TextInput, TouchableOpacity, StyleSheet, Image, Alert,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useT } from "../../i18n";
import { api, uploadImage } from "../../api/client";
import { DismissKeyboard } from "../../components/DismissKeyboard";
import { FIELDS, type FieldMeta, type PendingRequest } from "./meta";

// Bottom-sheet modal used by every section screen to edit one field at a
// time. Critical fields show a warning before submit; on success it calls
// onAfterSubmit so the parent can refresh.
export function EditSheet({ visible, field, currentValue, pending, onClose, onAfterSubmit }: {
  visible: boolean;
  field: string | null;
  currentValue: unknown;
  pending?: PendingRequest;
  onClose: () => void;
  onAfterSubmit: () => Promise<void>;
}) {
  const { t } = useT();
  const meta: FieldMeta | undefined = field ? FIELDS[field] : undefined;

  const [text, setText] = useState("");
  const [date, setDate] = useState<Date | null>(null);
  const [multi, setMulti] = useState<string[]>([]);   // for kind: "string-array" with options
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset state every time the sheet opens for a new field.
  useEffect(() => {
    if (visible && meta && field) {
      setError(null);
      setImageUri(null);
      setShowDatePicker(false);
      if (meta.kind === "string-array") {
        const arr = Array.isArray(currentValue) ? (currentValue as string[]) : [];
        setMulti(arr);
        setText(arr.join(", "));   // text fallback if there are no options
      } else if (meta.kind === "date") {
        const parsed = currentValue ? new Date(currentValue as string) : null;
        setDate(parsed && !isNaN(parsed.getTime()) ? parsed : null);
        setText("");
      } else if (meta.kind === "url") {
        setText("");
      } else {
        setText(currentValue == null ? "" : String(currentValue));
      }
    }
  }, [visible, field, meta, currentValue]);

  if (!visible || !field || !meta) return null;

  const fieldLabel = t(`profile.${meta.labelKey}`);

  const pickImage = async (source: "camera" | "library") => {
    try {
      const perm = source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t("common.error"), "Permission required");
        return;
      }
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (result.canceled || !result.assets[0]) return;
      setImageUri(result.assets[0].uri);
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message);
    }
  };

  const submitRequest = async (newValue: unknown) => {
    setSubmitting(true);
    setError(null);
    try {
      await api("/api/reporter/profile/request-change", {
        method: "POST",
        body: { field, value: newValue },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t("profile.submittedTitle"), t("profile.submittedMsg"));
      await onAfterSubmit();
    } catch (e: any) {
      setError(e.message || "Request failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    Haptics.selectionAsync();

    // Build payload based on kind + control.
    let value: unknown;
    if (meta.kind === "url") {
      if (!imageUri) { setError(t("profile.newValue")); return; }
      setUploading(true);
      try {
        value = await uploadImage(imageUri);
      } catch (e: any) {
        setError(e.message || "Upload failed");
        setUploading(false);
        return;
      }
      setUploading(false);
    } else if (meta.kind === "string-array") {
      // Multi-select chips for option-backed fields; comma-string fallback
      // for free-form arrays.
      value = meta.options
        ? multi
        : text.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (meta.kind === "date") {
      // Local YYYY-MM-DD to avoid timezone day-shift (admin sees same day).
      value = date
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
        : "";
    } else {
      value = text.trim();
    }

    const proceed = async () => { await submitRequest(value); };

    if (meta.critical === "kyc") {
      Alert.alert(t("profile.kycWarningTitle"), t("profile.kycWarningMsg"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("profile.continueSubmit"), style: "destructive", onPress: proceed },
      ]);
    } else if (meta.critical === "bank") {
      Alert.alert(t("profile.bankWarningTitle"), t("profile.bankWarningMsg"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("profile.continueSubmit"), onPress: proceed },
      ]);
    } else {
      await proceed();
    }
  };

  const withdraw = async () => {
    if (!pending) return;
    Haptics.selectionAsync();
    setSubmitting(true);
    try {
      await api(`/api/reporter/profile/request-change?field=${encodeURIComponent(field)}`, { method: "DELETE" });
      await onAfterSubmit();
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={s.backdrop}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <DismissKeyboard>
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.header}>
            <Text style={s.title}>{t("profile.editTitle").replace("{field}", fieldLabel)}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#888" />
            </TouchableOpacity>
          </View>

          {meta.critical === "kyc" ? (
            <View style={[s.warnBox, s.warnKyc]}>
              <Ionicons name="alert-circle" size={16} color="#92400e" />
              <Text style={s.warnText}>{t("profile.kycWarningMsg")}</Text>
            </View>
          ) : meta.critical === "bank" ? (
            <View style={[s.warnBox, s.warnBank]}>
              <Ionicons name="alert-circle-outline" size={16} color="#1d4ed8" />
              <Text style={s.warnText}>{t("profile.bankWarningMsg")}</Text>
            </View>
          ) : null}

          {/* The right control for each kind:
                url               → image preview + camera / gallery
                date              → tap to open native picker
                string + options  → single-select chips (gender, specialization)
                string-array+opts → multi-select chips (languages)
                text              → larger multiline textarea (experience)
                string            → plain text input
              In every case the control starts from the current value so the
              reporter just tweaks it instead of retyping. */}
          <Text style={s.fieldLabel}>{fieldLabel}</Text>

          {meta.kind === "url" ? (
            <View>
              <Image
                source={imageUri ? { uri: imageUri } : currentValue ? { uri: String(currentValue) } : undefined}
                style={[s.currentImage, !imageUri && !currentValue && s.imagePlaceholder]}
              />
              <View style={s.pickRow}>
                <TouchableOpacity style={s.pickBtn} onPress={() => pickImage("camera")}>
                  <Ionicons name="camera-outline" size={18} color="#FF2C2C" />
                  <Text style={s.pickText}>{t("common.camera")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.pickBtn} onPress={() => pickImage("library")}>
                  <Ionicons name="image-outline" size={18} color="#FF2C2C" />
                  <Text style={s.pickText}>{t("common.gallery")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : meta.kind === "date" ? (
            <DateField
              date={date}
              show={showDatePicker}
              onShow={() => setShowDatePicker(true)}
              onChange={(d) => {
                if (Platform.OS === "android") setShowDatePicker(false);
                if (d) { setDate(d); setError(null); }
              }}
              onDismiss={() => setShowDatePicker(false)}
            />
          ) : meta.kind === "string" && meta.options ? (
            <ChipSelector
              options={meta.options}
              value={text}
              onChange={(v) => { setText(v); setError(null); }}
            />
          ) : meta.kind === "string-array" && meta.options ? (
            <MultiChipSelector
              options={meta.options}
              value={multi}
              onChange={(arr) => { setMulti(arr); setError(null); }}
            />
          ) : (
            <TextInput
              style={[s.input, meta.multiline && s.inputMultiline, error && s.inputError]}
              value={text}
              onChangeText={(v) => { setText(v); setError(null); }}
              multiline={meta.multiline}
              numberOfLines={meta.multiline ? 6 : 1}
              keyboardType={meta.numeric ? "number-pad" : "default"}
              autoCapitalize={field === "bankIfsc" || field === "panNumber" ? "characters" : "sentences"}
              placeholder={meta.kind === "string-array" ? "Telugu, English" : ""}
            />
          )}
          {error ? <Text style={s.errorText}>{error}</Text> : null}

          {pending?.status === "PENDING" ? (
            <TouchableOpacity style={s.withdrawBtn} onPress={withdraw} disabled={submitting}>
              <Ionicons name="trash-outline" size={16} color="#dc2626" />
              <Text style={s.withdrawText}>{t("profile.withdrawRequest")}</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[s.submitBtn, (submitting || uploading) && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting || uploading}
          >
            <Text style={s.submitBtnText}>
              {uploading ? t("common.loading") : submitting ? t("profile.submittingChange") : t("profile.submitChange")}
            </Text>
          </TouchableOpacity>
        </View>
        </DismissKeyboard>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Sub-controls used by the EditSheet ─────────────────────────────────────

// Single-select chip row. Used for gender, specialization, anything where the
// reporter should pick one from a small known list (vs free text).
function ChipSelector({ options, value, onChange }: {
  options: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <View style={s.chipRow}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => { Haptics.selectionAsync(); onChange(opt); }}
            style={[s.chip, active && s.chipActive]}
            activeOpacity={0.7}
          >
            <Text style={[s.chipText, active && s.chipTextActive]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Multi-select chip row for "languages" — tap toggles each option in/out of
// the selection set. Reporters can pick any combination.
function MultiChipSelector({ options, value, onChange }: {
  options: string[]; value: string[]; onChange: (arr: string[]) => void;
}) {
  const toggle = (opt: string) => {
    Haptics.selectionAsync();
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  };
  return (
    <View style={s.chipRow}>
      {options.map((opt) => {
        const active = value.includes(opt);
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => toggle(opt)}
            style={[s.chip, active && s.chipActive]}
            activeOpacity={0.7}
          >
            {active ? (
              <Ionicons name="checkmark" size={14} color="#fff" style={{ marginRight: 4 }} />
            ) : null}
            <Text style={[s.chipText, active && s.chipTextActive]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Date picker — a tappable field that opens the native DateTimePicker.
// On Android the picker is shown as a separate dialog; on iOS we wrap it in
// a modal so it overlays cleanly on top of the bottom sheet.
function DateField({ date, show, onShow, onChange, onDismiss }: {
  date: Date | null;
  show: boolean;
  onShow: () => void;
  onChange: (d: Date | null) => void;
  onDismiss: () => void;
}) {
  const { t } = useT();
  const display = date ? date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "—";
  return (
    <View>
      <TouchableOpacity style={s.dateField} onPress={onShow} activeOpacity={0.7}>
        <Ionicons name="calendar-outline" size={18} color="#FF2C2C" />
        <Text style={s.dateText}>{display}</Text>
      </TouchableOpacity>
      {Platform.OS === "android" && show ? (
        <DateTimePicker
          value={date || new Date(2000, 0, 1)}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={(event, picked) => {
            if (event?.type === "dismissed") { onDismiss(); return; }
            onChange(picked || null);
          }}
        />
      ) : null}
      {Platform.OS === "ios" && show ? (
        <Modal visible transparent animationType="slide" onRequestClose={onDismiss}>
          <TouchableOpacity style={s.iosDateBackdrop} activeOpacity={1} onPress={onDismiss}>
            <View style={s.iosDateSheet} onStartShouldSetResponder={() => true}>
              <View style={s.iosDateHeader}>
                <TouchableOpacity onPress={onDismiss}>
                  <Text style={s.iosDateDone}>{t("common.ok")}</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={date || new Date(2000, 0, 1)}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                onChange={(_, picked) => { if (picked) onChange(picked); }}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 28, maxHeight: "92%" },
  handle: { alignSelf: "center", width: 38, height: 4, borderRadius: 999, backgroundColor: "#d1d5db", marginBottom: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  title: { fontSize: 17, fontWeight: "800", color: "#111", flex: 1, marginRight: 8 },
  warnBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 11, borderRadius: 8, marginTop: 12 },
  warnKyc: { backgroundColor: "#fef3c7" },
  warnBank: { backgroundColor: "#dbeafe" },
  warnText: { fontSize: 12, color: "#555", flex: 1, lineHeight: 17 },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: "#555", marginBottom: 5, marginTop: 12 },
  currentImage: { width: "100%", height: 180, borderRadius: 10, marginTop: 4, backgroundColor: "#f3f4f6" },
  imagePlaceholder: { backgroundColor: "#f3f4f6" },
  pickRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  pickBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 12, borderWidth: 1, borderColor: "#FF2C2C", borderRadius: 10 },
  pickText: { color: "#FF2C2C", fontSize: 14, fontWeight: "700" },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 13, fontSize: 14, backgroundColor: "#fafafa" },
  inputMultiline: { minHeight: 140, textAlignVertical: "top", paddingTop: 12 },

  // Chip selectors (single + multi-select)
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  chip: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
    backgroundColor: "#fafafa", borderWidth: 1, borderColor: "#e5e7eb",
  },
  chipActive: { backgroundColor: "#FF2C2C", borderColor: "#FF2C2C" },
  chipText: { fontSize: 13, fontWeight: "600", color: "#374151" },
  chipTextActive: { color: "#fff", fontWeight: "700" },

  // Date field — tappable row that opens the native picker
  dateField: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10,
    padding: 14, backgroundColor: "#fafafa",
  },
  dateText: { fontSize: 14, fontWeight: "600", color: "#111" },

  // iOS-only modal that hosts the spinner picker (Android shows native dialog).
  iosDateBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  iosDateSheet: { backgroundColor: "#fff", borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 24 },
  iosDateHeader: { flexDirection: "row", justifyContent: "flex-end", padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#eef0f3" },
  iosDateDone: { color: "#FF2C2C", fontSize: 15, fontWeight: "700" },
  inputError: { borderColor: "#dc2626" },
  errorText: { color: "#dc2626", fontSize: 12, fontWeight: "600", marginTop: 6 },
  withdrawBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 14, padding: 10 },
  withdrawText: { color: "#dc2626", fontSize: 13, fontWeight: "700" },
  submitBtn: { backgroundColor: "#FF2C2C", borderRadius: 12, padding: 15, alignItems: "center", marginTop: 16 },
  submitBtnDisabled: { backgroundColor: "#999" },
  submitBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
