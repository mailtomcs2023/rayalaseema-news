import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Image, Alert, ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { api, uploadImage } from "../api/client";
import { useT } from "../i18n";

type DocKey = "photoUri" | "aadhaarFrontUri" | "aadhaarBackUri" | "panCardUri";

interface DocSpec {
  key: DocKey;
  serverField: string; // POST body field name the server expects
  section: keyof FormErrors;
}

const DOCS: DocSpec[] = [
  { key: "photoUri", serverField: "photoUrl", section: "photo" },
  { key: "aadhaarFrontUri", serverField: "aadhaarFrontUrl", section: "aadhaarFront" },
  { key: "aadhaarBackUri", serverField: "aadhaarBackUrl", section: "aadhaarBack" },
  { key: "panCardUri", serverField: "panCardUrl", section: "panCard" },
];

interface FormErrors {
  photo?: string;
  aadhaarNumber?: string;
  aadhaarFront?: string;
  aadhaarBack?: string;
  panNumber?: string;
  panCard?: string;
}

// 12-digit Aadhaar formatter — "1234 5678 9012" — for readability while typing.
const formatAadhaar = (s: string) => s.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
const PAN_RE = /^[A-Z]{3}[CHFATBLJGP][A-Z]\d{4}[A-Z]$/;

// In-app KYC document submission.
//
// Used by reporters whose accounts exist but who haven't uploaded identity
// docs yet:
//   - PENDING   — admin-created accounts. They land here from the home
//                 banner's "Upload documents" CTA.
//   - REJECTED  — verified-then-bounced reporters re-submitting after
//                 fixing whatever the admin called out.
// On success, status flips to SUBMITTED and the cached `user.kycStatus`
// in AsyncStorage is updated so the banner re-renders correctly.
export function KycUploadScreen() {
  const { t } = useT();
  const router = useRouter();

  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [docs, setDocs] = useState<Record<DocKey, string>>({
    photoUri: "",
    aadhaarFrontUri: "",
    aadhaarBackUri: "",
    panCardUri: "",
  });
  const [busyKey, setBusyKey] = useState<DocKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const setDoc = (k: DocKey, uri: string) => setDocs((d) => ({ ...d, [k]: uri }));

  const pickImage = async (k: DocKey) => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.7 });
    if (!r.canceled) setDoc(k, r.assets[0].uri);
  };
  const takePhoto = async (k: DocKey) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert(t("register.cameraPermission"));
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!r.canceled) setDoc(k, r.assets[0].uri);
  };

  const validate = (): FormErrors => {
    const e: FormErrors = {};
    if (!docs.photoUri) e.photo = t("validation.docRequired");
    if (aadhaarNumber.replace(/\D/g, "").length !== 12) e.aadhaarNumber = t("validation.aadhaar");
    if (!docs.aadhaarFrontUri) e.aadhaarFront = t("validation.docRequired");
    if (!docs.aadhaarBackUri) e.aadhaarBack = t("validation.docRequired");
    if (!PAN_RE.test(panNumber.toUpperCase())) e.panNumber = t("validation.pan");
    if (!docs.panCardUri) e.panCard = t("validation.docRequired");
    return e;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      // Upload each image in parallel — the helper returns the public URL.
      const uploaded: Record<string, string> = {};
      await Promise.all(
        DOCS.map(async (d) => {
          uploaded[d.serverField] = await uploadImage(docs[d.key]);
        }),
      );

      await api("/api/reporter/kyc", {
        method: "PATCH",
        body: {
          aadhaarNumber: aadhaarNumber.replace(/\D/g, ""),
          panNumber: panNumber.toUpperCase(),
          ...uploaded,
        },
      });

      // Refresh cached user so the KycBanner re-renders as SUBMITTED.
      const raw = await AsyncStorage.getItem("user");
      if (raw) {
        const u = JSON.parse(raw);
        await AsyncStorage.setItem(
          "user",
          JSON.stringify({ ...u, kycStatus: "SUBMITTED", kycRejectionNote: null }),
        );
      }

      Alert.alert(t("kyc.submitSuccessTitle"), t("kyc.submitSuccessMsg"), [
        { text: t("common.ok"), onPress: () => router.replace("/home") },
      ]);
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message || "Submission failed");
    }
    setSubmitting(false);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <Text style={styles.intro}>{t("kyc.screenIntro")}</Text>

      {/* Photo */}
      <Section title={t("kyc.sectionPhoto")} done={!!docs.photoUri} index={1} total={3}>
        <DocPicker
          uri={docs.photoUri}
          label={t("register.takeSelfie")}
          icon="camera-reverse-outline"
          busy={busyKey === "photoUri"}
          onCamera={() => takePhoto("photoUri")}
          onGallery={() => pickImage("photoUri")}
          onRemove={() => setDoc("photoUri", "")}
          error={errors.photo}
          t={t}
        />
      </Section>

      {/* Aadhaar */}
      <Section title={t("kyc.sectionAadhaar")} done={
        aadhaarNumber.replace(/\D/g, "").length === 12 && !!docs.aadhaarFrontUri && !!docs.aadhaarBackUri
      } index={2} total={3}>
        <Text style={styles.label}>{t("register.aadhaarNumber")}</Text>
        <TextInput
          style={[styles.input, errors.aadhaarNumber ? styles.inputError : null]}
          value={formatAadhaar(aadhaarNumber)}
          onChangeText={(v) => {
            setAadhaarNumber(v.replace(/[^0-9]/g, "").slice(0, 12));
            setErrors((e) => ({ ...e, aadhaarNumber: undefined }));
          }}
          keyboardType="number-pad"
          placeholder="1234 5678 9012"
          maxLength={14}
        />
        {errors.aadhaarNumber ? <Text style={styles.errText}>{errors.aadhaarNumber}</Text> : null}

        <Text style={styles.label}>{t("register.aadhaarFront")}</Text>
        <DocPicker
          uri={docs.aadhaarFrontUri}
          label={t("common.camera")}
          icon="camera-outline"
          busy={busyKey === "aadhaarFrontUri"}
          onCamera={() => takePhoto("aadhaarFrontUri")}
          onGallery={() => pickImage("aadhaarFrontUri")}
          onRemove={() => setDoc("aadhaarFrontUri", "")}
          error={errors.aadhaarFront}
          t={t}
        />
        <Text style={styles.label}>{t("register.aadhaarBack")}</Text>
        <DocPicker
          uri={docs.aadhaarBackUri}
          label={t("common.camera")}
          icon="camera-outline"
          busy={busyKey === "aadhaarBackUri"}
          onCamera={() => takePhoto("aadhaarBackUri")}
          onGallery={() => pickImage("aadhaarBackUri")}
          onRemove={() => setDoc("aadhaarBackUri", "")}
          error={errors.aadhaarBack}
          t={t}
        />
      </Section>

      {/* PAN */}
      <Section title={t("kyc.sectionPan")} done={
        PAN_RE.test(panNumber.toUpperCase()) && !!docs.panCardUri
      } index={3} total={3}>
        <Text style={styles.label}>{t("register.panNumber")}</Text>
        <TextInput
          style={[styles.input, errors.panNumber ? styles.inputError : null]}
          value={panNumber}
          onChangeText={(v) => {
            setPanNumber(v.toUpperCase());
            setErrors((e) => ({ ...e, panNumber: undefined }));
          }}
          autoCapitalize="characters"
          placeholder="ABCPD1234E"
          maxLength={10}
        />
        {errors.panNumber ? <Text style={styles.errText}>{errors.panNumber}</Text> : null}

        <Text style={styles.label}>{t("register.panCard")}</Text>
        <DocPicker
          uri={docs.panCardUri}
          label={t("common.camera")}
          icon="camera-outline"
          busy={busyKey === "panCardUri"}
          onCamera={() => takePhoto("panCardUri")}
          onGallery={() => pickImage("panCardUri")}
          onRemove={() => setDoc("panCardUri", "")}
          error={errors.panCard}
          t={t}
        />
      </Section>

      <TouchableOpacity
        style={[styles.submit, submitting && styles.submitBusy]}
        disabled={submitting}
        onPress={handleSubmit}
        activeOpacity={0.85}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="cloud-upload" size={18} color="#fff" />
            <Text style={styles.submitText}>{t("kyc.submit")}</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

// A collapsible-looking section header with a "done" checkmark when complete.
function Section({
  title, done, index, total, children,
}: {
  title: string; done: boolean; index: number; total: number; children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={[styles.stepPill, done ? styles.stepPillDone : null]}>
          {done ? <Ionicons name="checkmark" size={12} color="#fff" /> : <Text style={styles.stepPillText}>{index}</Text>}
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>
          {index}/{total}
        </Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

// Two visual states, matching the register-flow Step 2 pattern:
//   - No upload yet → Camera + Gallery side-by-side.
//   - Uploaded     → preview only, with a small "×" at top-right to remove
//                    it. Tapping × calls `onRemove`, which the parent uses
//                    to clear the URI and bring back the upload buttons.
function DocPicker({
  uri, label, icon, busy, onCamera, onGallery, onRemove, error, t,
}: {
  uri: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  busy?: boolean;
  onCamera: () => void;
  onGallery: () => void;
  onRemove: () => void;
  error?: string;
  t: (k: string) => string;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      {uri ? (
        <View style={styles.previewWrap}>
          <Image source={{ uri }} style={styles.preview} />
          <TouchableOpacity
            style={styles.previewRemove}
            onPress={onRemove}
            hitSlop={10}
            accessibilityLabel="Remove photo"
          >
            <Ionicons name="close" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.docRow}>
          <TouchableOpacity style={[styles.docBtn, !!error && styles.docBtnError]} onPress={onCamera} disabled={busy}>
            <Ionicons name={icon} size={16} color="#555" />
            <Text style={styles.docBtnText}>{label}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.docBtn, !!error && styles.docBtnError]} onPress={onGallery} disabled={busy}>
            <Ionicons name="images-outline" size={16} color="#555" />
            <Text style={styles.docBtnText}>{t("common.gallery")}</Text>
          </TouchableOpacity>
        </View>
      )}
      {error ? <Text style={styles.errText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f3f4f6" },
  intro: { fontSize: 13, color: "#555", marginBottom: 14, lineHeight: 19 },

  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  sectionHead: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "#f3f4f6",
  },
  stepPill: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "#e5e7eb",
    alignItems: "center", justifyContent: "center",
  },
  stepPillDone: { backgroundColor: "#16a34a" },
  stepPillText: { fontSize: 11, fontWeight: "800", color: "#555" },
  sectionTitle: { flex: 1, fontSize: 14, fontWeight: "800", color: "#111" },
  sectionCount: { fontSize: 11, color: "#9ca3af", fontWeight: "700" },
  sectionBody: { padding: 14 },

  label: { fontSize: 12, fontWeight: "700", color: "#555", marginTop: 6, marginBottom: 6 },
  input: {
    backgroundColor: "#f9fafb", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8,
    padding: 12, fontSize: 14,
  },
  inputError: { borderColor: "#dc2626" },
  errText: { fontSize: 11, color: "#dc2626", marginTop: 4, fontWeight: "600" },

  docRow: { flexDirection: "row", gap: 8 },
  docBtn: {
    flex: 1, flexDirection: "row", gap: 6, padding: 12,
    backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb",
    alignItems: "center", justifyContent: "center",
  },
  docBtnError: { borderColor: "#fecaca" },
  docBtnText: { fontSize: 13, fontWeight: "700", color: "#555" },
  // Preview is positioned (relative) so the absolute × can sit on top of it.
  // Geometry matches the register flow's renderDoc so this screen feels like
  // a continuation, not a redesign.
  previewWrap: { position: "relative" },
  preview: { width: "100%", height: 160, borderRadius: 8 },
  previewRemove: {
    position: "absolute", top: 8, right: 8,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center", justifyContent: "center",
  },

  submit: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#FF2C2C", padding: 16, borderRadius: 12, marginTop: 6,
    shadowColor: "#FF2C2C", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  submitBusy: { opacity: 0.7 },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
