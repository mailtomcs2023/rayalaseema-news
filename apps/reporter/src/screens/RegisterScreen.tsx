import React, { useState, useLayoutEffect, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Image, Platform, Modal } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useT } from "../i18n";
import { LanguageToggle } from "../components/LanguageToggle";
import { FieldError } from "../components/FieldError";
import { step1Schema, step2Schema, step3Schema, fieldErrors, PAN_RE, PAN_HOLDER_TYPES } from "../lib/validation";
import { API_URL } from "../api/client";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter, useNavigation } from "expo-router";
import { constituenciesByDistrict } from "../data/locations";
import { pincodeToDistrict, pincodeToConstituency } from "../data/pincodes";

// API_URL is the single source of truth in api/client.ts — imported above.

// fetch() that rejects after `ms` instead of hanging forever — keeps the
// Submit button from getting stuck on "Submitting..." if the API is unreachable.
const fetchWithTimeout = (url: string, options: RequestInit = {}, ms = 25000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
};

// Aadhaar is stored as raw 12 digits; shown grouped "1234 5678 9012" per the
// UIDAI convention. The spaces are presentation-only — stripped on every edit.
const formatAadhaar = (digits: string) => digits.replace(/(\d{4})(?=\d)/g, "$1 ");

// Rayalaseema region districts. Slugs must match District.slug in the DB
// (packages/db/prisma/location-data.json).
const districts = [
  { label: "కర్నూలు (Kurnool)", value: "kurnool" },
  { label: "నంద్యాల (Nandyal)", value: "nandyal" },
  { label: "అనంతపురం (Anantapur)", value: "ananthapuramu" },
  { label: "శ్రీ సత్యసాయి (Sri Sathya Sai)", value: "sri-sathya-sai" },
  { label: "వై.యస్.ఆర్ కడప (YSR Kadapa)", value: "ysr-kadapa" },
  { label: "అన్నమయ్య (Annamayya)", value: "annamayya" },
  { label: "తిరుపతి (Tirupati)", value: "tirupati" },
  { label: "చిత్తూరు (Chittoor)", value: "chittoor" },
];

export function RegisterScreen() {
  const { t } = useT();
  const router = useRouter();
  const navigation = useNavigation();
  const [step, setStep] = useState(1); // 1=personal, 2=documents, 3=bank
  const [showPassword, setShowPassword] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [pincodeInfo, setPincodeInfo] = useState<
    { status: "ok" | "outside"; district?: string } | null
  >(null);
  const [form, setForm] = useState({
    fullName: "", email: "", phone: "", password: "",
    dateOfBirth: "", gender: "", address: "", city: "", pincode: "",
    primaryDistrict: "kurnool",
    aadhaarNumber: "", panNumber: "",
    aadhaarFrontUri: "", aadhaarBackUri: "", panCardUri: "", photoUri: "",
    upiId: "", bankName: "", bankAccount: "", bankIfsc: "",
    experience: "",
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Used to lift the multiline Address field a bit higher above the keyboard
  // (automaticallyAdjustKeyboardInsets alone leaves it flush against it).
  const scrollRef = useRef<ScrollView>(null);
  const addressY = useRef(0);

  // A translate-style EN/తె toggle in the header lets the reporter pick a language.
  useLayoutEffect(() => {
    navigation.setOptions({
      title: t("nav.register"),
      headerRight: () => <LanguageToggle />,
    });
  }, [navigation, t]);

  const update = (key: string, value: string) => {
    setForm({ ...form, [key]: value });
    // Editing a field clears its validation error.
    setErrors((e) => (e[key] ? { ...e, [key]: "" } : e));
  };

  // Date of birth is kept in the form as a "YYYY-MM-DD" string.
  // Built from local date parts (not toISOString) to avoid a timezone day-shift.
  const toISODate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const dobAsDate = () => {
    const [y, m, d] = (form.dateOfBirth || "").split("-").map(Number);
    return y && m && d ? new Date(y, m - 1, d) : new Date(2000, 0, 1);
  };

  const onPickDate = (event: any, date?: Date) => {
    if (Platform.OS === "android") setShowDatePicker(false);
    if (event?.type === "dismissed" || !date) return;
    update("dateOfBirth", toISODate(date));
  };

  // Pincode → district auto-detect. Looked up against an offline map of all
  // Rayalaseema pincodes (apps/reporter/src/data/pincodes.ts) — no network.
  const onPincodeChange = (v: string) => {
    const digits = v.replace(/[^0-9]/g, "").slice(0, 6);
    if (digits.length < 6) {
      update("pincode", digits);
      setPincodeInfo(null);
      return;
    }
    const slug = pincodeToDistrict[digits];
    if (slug) {
      // Auto-fill district always; auto-fill the constituency (city) when the
      // pincode maps to one — otherwise clear it so the reporter picks.
      const constituency = pincodeToConstituency[digits] || "";
      setForm((f) => ({ ...f, pincode: digits, primaryDistrict: slug, city: constituency }));
      setPincodeInfo({ status: "ok", district: slug });
      setErrors((e) => (e.pincode ? { ...e, pincode: "" } : e));
    } else {
      update("pincode", digits);
      setPincodeInfo({ status: "outside" });
    }
  };

  // PAN is a fixed 10-char format — 5 letters, 4 digits, 1 letter (ABCPD1234E).
  // Each keystroke is routed into its slot's character class, so a malformed
  // PAN can't be entered. Slot 4 (0-indexed 3) must be a valid holder-type code.
  const onPanChange = (v: string) => {
    let pan = "";
    for (const ch of v.toUpperCase()) {
      const slot = pan.length;
      if (slot >= 10) break;
      let ok: boolean;
      if (slot === 3) ok = PAN_HOLDER_TYPES.includes(ch);          // holder-type letter
      else if (slot < 5 || slot === 9) ok = ch >= "A" && ch <= "Z"; // letter slots
      else ok = ch >= "0" && ch <= "9";                            // digit slots
      if (ok) pan += ch;
    }
    update("panNumber", pan);
  };

  // Build a 12-char password with at least one of each class.
  // Ambiguous chars (0/O/1/l/I) are omitted so it's easy to read and type.
  const generatePassword = () => {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghijkmnpqrstuvwxyz";
    const digits = "23456789";
    const symbols = "@#$%&*";
    const all = upper + lower + digits + symbols;
    const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
    const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
    while (chars.length < 12) chars.push(pick(all));
    // Fisher–Yates shuffle so the guaranteed chars aren't always up front.
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    update("password", chars.join(""));
    setShowPassword(true); // reveal it so the user can note it down
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const pickImage = async (key: string) => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.7 });
    if (!result.canceled) update(key, result.assets[0].uri);
  };

  const takePhoto = async (key: string) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert(t("register.cameraPermission"));
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) update(key, result.assets[0].uri);
  };

  const uploadFile = async (uri: string): Promise<string> => {
    if (!uri) return "";
    const formData = new FormData();
    const filename = uri.split("/").pop() || "doc.jpg";
    formData.append("file", { uri, name: filename, type: "image/jpeg" } as any);
    // Public upload endpoint — the reporter doesn't have a token yet during
    // registration, so the admin-auth `/api/upload` and the token-auth
    // `/api/reporter/upload` would both 401 silently here.
    const res = await fetchWithTimeout(`${API_URL}/api/upload/register`, { method: "POST", body: formData });
    const data = await res.json();
    if (!data.url) throw new Error(data.error || "Upload failed");
    return data.url;
  };

  const handleSubmit = async () => {
    const parsed = step3Schema(t).safeParse(form);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setLoading(true);

    try {
      // Upload documents
      const [aadhaarFront, aadhaarBack, panCard, photo] = await Promise.all([
        uploadFile(form.aadhaarFrontUri),
        uploadFile(form.aadhaarBackUri),
        uploadFile(form.panCardUri),
        uploadFile(form.photoUri),
      ]);

      // Create user + profile
      const res = await fetchWithTimeout(`${API_URL}/api/reporter/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          aadhaarFrontUrl: aadhaarFront,
          aadhaarBackUrl: aadhaarBack,
          panCardUrl: panCard,
          photoUrl: photo,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      Alert.alert(
        t("register.submittedTitle"),
        t("register.submittedMsg"),
        [{ text: t("common.ok"), onPress: () => router.replace("/login") }]
      );
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message);
    }
    setLoading(false);
  };

  // Each step's heading: "STEP n OF 3" counter + the step's own name.
  const stepHeadingKey =
    step === 1 ? "register.personalDetails"
    : step === 2 ? "register.kycDocuments"
    : "register.bankDetails";

  // Label of the currently-selected constituency (City), looked up by value.
  const cityLabel =
    (constituenciesByDistrict[form.primaryDistrict] || []).find((c) => c.value === form.city)?.label || "";

  // Step 2 (KYC) — "Require everything" before continuing to step 3.
  const passportDone = !!form.photoUri;
  const aadhaarDone = form.aadhaarNumber.length === 12 && !!form.aadhaarFrontUri && !!form.aadhaarBackUri;
  const panDone = PAN_RE.test(form.panNumber) && !!form.panCardUri;
  const step2Complete = passportDone && aadhaarDone && panDone;

  // Each step validates with Zod before advancing; failures become per-field
  // red borders + messages via the `errors` map.
  const goToStep2 = () => {
    const parsed = step1Schema(t).safeParse(form);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setStep(2);
  };

  const goToStep3 = () => {
    const parsed = step2Schema(t).safeParse(form);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setStep(3);
  };

  // One document slot: capture/pick buttons, or the preview with a remove (×).
  const renderDoc = (
    key: "photoUri" | "aadhaarFrontUri" | "aadhaarBackUri" | "panCardUri",
    cameraLabel: string,
    cameraIcon: keyof typeof Ionicons.glyphMap = "camera-outline",
    errorMsg?: string,
  ) => {
    const uri = form[key];
    if (uri) {
      return (
        <View style={styles.previewWrap}>
          <Image source={{ uri }} style={styles.preview} />
          <TouchableOpacity style={styles.previewRemove} onPress={() => update(key, "")}>
            <Ionicons name="close" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <>
        <View style={styles.docRow}>
          <TouchableOpacity style={[styles.docButton, errorMsg ? styles.inputError : null]} onPress={() => takePhoto(key)}>
            <Ionicons name={cameraIcon} size={16} color="#555" />
            <Text style={styles.docButtonText}>{cameraLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.docButton, errorMsg ? styles.inputError : null]} onPress={() => pickImage(key)}>
            <Ionicons name="images-outline" size={16} color="#555" />
            <Text style={styles.docButtonText}>{t("common.gallery")}</Text>
          </TouchableOpacity>
        </View>
        <FieldError message={errorMsg} />
      </>
    );
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 20 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
    >
      <Text style={styles.title}>{t("register.title")}</Text>

      {/* Progress */}
      <View style={styles.progress}>
        {[1, 2, 3].map((s) => (
          <View key={s} style={[styles.progressDot, step >= s && styles.progressDotActive]} />
        ))}
      </View>

      {/* Step heading — counter + the current step's name */}
      <Text style={styles.stepCounter}>{t("register.step", { step })}</Text>
      <Text style={styles.stepName}>{t(stepHeadingKey)}</Text>
      <View style={styles.stepDivider} />

      {step === 1 && (
        <>
          <TextInput style={[styles.input, errors.fullName ? styles.inputError : null]} placeholder={t("register.fullName")} value={form.fullName} onChangeText={(v) => update("fullName", v)} />
          <FieldError message={errors.fullName} />
          <TextInput style={[styles.input, errors.email ? styles.inputError : null]} placeholder={t("register.email")} value={form.email} onChangeText={(v) => update("email", v)} keyboardType="email-address" autoCapitalize="none" />
          <FieldError message={errors.email} />
          <TextInput style={[styles.input, errors.phone ? styles.inputError : null]} placeholder={t("register.phone")} value={form.phone} onChangeText={(v) => update("phone", v.replace(/[^0-9]/g, "").slice(0, 10))} keyboardType="phone-pad" maxLength={10} />
          <FieldError message={errors.phone} />
          <View style={styles.passwordRow}>
            <View style={[styles.passwordField, errors.password ? styles.inputError : null]}>
              <TextInput
                style={styles.passwordInput}
                placeholder={t("register.password")}
                value={form.password}
                onChangeText={(v) => update("password", v)}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowPassword(!showPassword);
                }}
                style={styles.iconButton}
                accessibilityLabel={showPassword ? t("register.hidePassword") : t("register.showPassword")}
              >
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color="#888" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={generatePassword}
              style={styles.generateIconButton}
              accessibilityLabel={t("register.generatePassword")}
            >
              <Ionicons name="sparkles-outline" size={22} color="#FF2C2C" />
            </TouchableOpacity>
          </View>
          <FieldError message={errors.password} />
          <TouchableOpacity style={[styles.input, styles.dateField]} onPress={() => setShowDatePicker(true)} activeOpacity={0.7}>
            <Text style={form.dateOfBirth ? styles.dateValue : styles.datePlaceholder}>
              {form.dateOfBirth || t("register.dob")}
            </Text>
            <Ionicons name="calendar-outline" size={20} color="#888" />
          </TouchableOpacity>

          {/* Android shows the native dialog on demand; iOS shows a spinner in a bottom sheet. */}
          {Platform.OS === "android" && showDatePicker && (
            <DateTimePicker value={dobAsDate()} mode="date" display="default" maximumDate={new Date()} onChange={onPickDate} />
          )}
          {Platform.OS === "ios" && (
            <Modal visible={showDatePicker} transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
              <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowDatePicker(false)}>
                <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
                  <View style={styles.modalBar}>
                    <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                      <Text style={styles.modalDone}>{t("common.ok")}</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={dobAsDate()}
                    mode="date"
                    display="spinner"
                    maximumDate={new Date()}
                    onChange={onPickDate}
                    themeVariant="light"
                  />
                </View>
              </TouchableOpacity>
            </Modal>
          )}
          {/* Pincode — typing 6 digits auto-detects the district */}
          <TextInput
            style={[styles.input, errors.pincode ? styles.inputError : null]}
            placeholder={t("register.pincode")}
            value={form.pincode}
            onChangeText={onPincodeChange}
            keyboardType="numeric"
            maxLength={6}
          />
          <FieldError message={errors.pincode} />
          {pincodeInfo?.status === "ok" && (
            <Text style={[styles.pincodeHint, styles.pincodeOk]}>
              {t("register.pincodeFound", {
                district: districts.find((d) => d.value === pincodeInfo.district)?.label || "",
              })}
            </Text>
          )}
          {pincodeInfo?.status === "outside" && (
            <Text style={[styles.pincodeHint, styles.pincodeWarn]}>{t("register.pincodeOutside")}</Text>
          )}

          <Text style={styles.label}>{t("register.primaryDistrict")}</Text>
          <View style={styles.chipRow}>
            {districts.map((d) => (
              <TouchableOpacity key={d.value} onPress={() => setForm((f) => ({ ...f, primaryDistrict: d.value, city: "" }))}
                style={[styles.chip, form.primaryDistrict === d.value && styles.chipActive]}>
                <Text style={[styles.chipText, form.primaryDistrict === d.value && styles.chipTextActive]}>{d.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* City = assembly constituency within the selected district — tap to choose */}
          <Text style={styles.label}>{t("register.city")}</Text>
          <TouchableOpacity style={[styles.input, styles.dateField]} onPress={() => setShowCityPicker(true)} activeOpacity={0.7}>
            <Text style={form.city ? styles.dateValue : styles.datePlaceholder}>
              {cityLabel || t("register.city")}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#888" />
          </TouchableOpacity>
          <Modal visible={showCityPicker} transparent animationType="slide" onRequestClose={() => setShowCityPicker(false)}>
            <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowCityPicker(false)}>
              <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
                <View style={styles.modalBarSplit}>
                  <Text style={styles.modalTitle}>{t("register.city")}</Text>
                  <TouchableOpacity onPress={() => setShowCityPicker(false)}>
                    <Text style={styles.modalDone}>{t("common.ok")}</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.cityList}>
                  {(constituenciesByDistrict[form.primaryDistrict] || []).map((c) => (
                    <TouchableOpacity
                      key={c.value}
                      style={styles.cityOption}
                      onPress={() => {
                        update("city", c.value);
                        setShowCityPicker(false);
                      }}
                    >
                      <Text style={[styles.cityOptionText, form.city === c.value && styles.cityOptionTextActive]}>
                        {c.label}
                      </Text>
                      {form.city === c.value && <Ionicons name="checkmark" size={20} color="#FF2C2C" />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </TouchableOpacity>
          </Modal>

          <TextInput
            style={styles.input}
            placeholder={t("register.address")}
            value={form.address}
            onChangeText={(v) => update("address", v)}
            multiline
            onLayout={(e) => { addressY.current = e.nativeEvent.layout.y; }}
            onFocus={() => setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, addressY.current - 110), animated: true }), 100)}
          />

          <TextInput style={[styles.input, { height: 80 }]} placeholder={t("register.experience")} value={form.experience} onChangeText={(v) => update("experience", v)} multiline />

          <TouchableOpacity style={styles.button} onPress={goToStep2}>
            <Text style={styles.buttonText}>{t("register.nextDocuments")}</Text>
          </TouchableOpacity>
        </>
      )}

      {step === 2 && (
        <>
          {/* Passport */}
          <View style={styles.kycCard}>
            <View style={styles.kycCardHead}>
              <Text style={styles.kycCardTitle}>
                {t("register.passportSection")}
                <Text style={styles.requiredStar}> *</Text>
              </Text>
              {passportDone && <Ionicons name="checkmark-circle" size={18} color="#16a34a" />}
            </View>
            {renderDoc("photoUri", t("register.takeSelfie"), "camera-reverse-outline", errors.photoUri)}
          </View>

          {/* Aadhaar */}
          <View style={styles.kycCard}>
            <View style={styles.kycCardHead}>
              <Text style={styles.kycCardTitle}>
                {t("register.aadhaarSection")}
                <Text style={styles.requiredStar}> *</Text>
              </Text>
              {aadhaarDone && <Ionicons name="checkmark-circle" size={18} color="#16a34a" />}
            </View>
            <TextInput
              style={[styles.input, errors.aadhaarNumber ? styles.inputError : null]}
              placeholder={t("register.aadhaarNumber")}
              value={formatAadhaar(form.aadhaarNumber)}
              onChangeText={(v) => update("aadhaarNumber", v.replace(/[^0-9]/g, "").slice(0, 12))}
              keyboardType="numeric"
              maxLength={14}
            />
            <FieldError message={errors.aadhaarNumber} />
            <Text style={styles.label}>{t("register.aadhaarFront")}</Text>
            {renderDoc("aadhaarFrontUri", t("common.camera"), "camera-outline", errors.aadhaarFrontUri)}
            <Text style={styles.label}>{t("register.aadhaarBack")}</Text>
            {renderDoc("aadhaarBackUri", t("common.camera"), "camera-outline", errors.aadhaarBackUri)}
          </View>

          {/* PAN */}
          <View style={styles.kycCard}>
            <View style={styles.kycCardHead}>
              <Text style={styles.kycCardTitle}>
                {t("register.panSection")}
                <Text style={styles.requiredStar}> *</Text>
              </Text>
              {panDone && <Ionicons name="checkmark-circle" size={18} color="#16a34a" />}
            </View>
            <TextInput
              style={[styles.input, errors.panNumber ? styles.inputError : null]}
              placeholder={t("register.panNumber")}
              value={form.panNumber}
              onChangeText={onPanChange}
              autoCapitalize="characters"
              maxLength={10}
            />
            <FieldError message={errors.panNumber} />
            <Text style={styles.label}>{t("register.panCard")}</Text>
            {renderDoc("panCardUri", t("common.camera"), "camera-outline", errors.panCardUri)}
          </View>

          <View style={styles.navRow}>
            <TouchableOpacity style={styles.backButton} onPress={() => setStep(1)}>
              <Ionicons name="chevron-back" size={18} color="#555" />
              <Text style={styles.backText}>{t("common.back")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, !step2Complete && styles.buttonDisabled]} onPress={goToStep3}>
              <Text style={styles.buttonText}>{t("register.nextBank")}</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </>
      )}

      {step === 3 && (
        <>
          <TextInput style={[styles.input, errors.upiId ? styles.inputError : null]} placeholder={t("register.upiId")} value={form.upiId} onChangeText={(v) => update("upiId", v.trim())} autoCapitalize="none" />
          <FieldError message={errors.upiId} />
          <TextInput style={[styles.input, errors.bankName ? styles.inputError : null]} placeholder={t("register.bankName")} value={form.bankName} onChangeText={(v) => update("bankName", v)} />
          <FieldError message={errors.bankName} />
          <TextInput style={[styles.input, errors.bankAccount ? styles.inputError : null]} placeholder={t("register.accountNumber")} value={form.bankAccount} onChangeText={(v) => update("bankAccount", v.replace(/[^0-9]/g, "").slice(0, 18))} keyboardType="numeric" />
          <FieldError message={errors.bankAccount} />
          <TextInput style={[styles.input, errors.bankIfsc ? styles.inputError : null]} placeholder={t("register.ifsc")} value={form.bankIfsc} onChangeText={(v) => update("bankIfsc", v.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 11))} autoCapitalize="characters" />
          <FieldError message={errors.bankIfsc} />

          <View style={styles.navRow}>
            <TouchableOpacity style={styles.backButton} onPress={() => setStep(2)}>
              <Ionicons name="chevron-back" size={18} color="#555" />
              <Text style={styles.backText}>{t("common.back")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSubmit} disabled={loading}>
              <Text style={styles.buttonText}>{loading ? t("register.submitting") : t("register.submit")}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  title: { fontSize: 22, fontWeight: "800", color: "#111", textAlign: "center", marginBottom: 14 },
  progress: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 18 },
  progressDot: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#e5e7eb" },
  progressDotActive: { backgroundColor: "#FF2C2C" },
  stepCounter: { fontSize: 11, fontWeight: "700", color: "#FF2C2C", letterSpacing: 1, textAlign: "center", textTransform: "uppercase", marginBottom: 3 },
  stepName: { fontSize: 18, lineHeight: 25, fontWeight: "800", color: "#111", textAlign: "center", marginBottom: 12 },
  stepDivider: { height: 1, backgroundColor: "#e5e7eb", marginBottom: 16 },
  label: { fontSize: 12, fontWeight: "600", color: "#555", marginBottom: 4, marginTop: 8 },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 14, fontSize: 14, marginBottom: 10, backgroundColor: "#fff" },
  inputError: { borderColor: "#dc2626" },
  pincodeHint: { fontSize: 12, lineHeight: 18, marginTop: -4, marginBottom: 10, paddingHorizontal: 4, color: "#888" },
  pincodeOk: { color: "#16a34a" },
  pincodeWarn: { color: "#dc2626" },
  dateField: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dateValue: { fontSize: 14, lineHeight: 22, color: "#111" },
  datePlaceholder: { fontSize: 14, lineHeight: 22, color: "#9ca3af" },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 24 },
  modalBar: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  modalDone: { color: "#FF2C2C", fontSize: 16, fontWeight: "700", lineHeight: 24 },
  modalBarSplit: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  modalTitle: { fontSize: 15, fontWeight: "700", color: "#111", lineHeight: 22 },
  cityList: { maxHeight: 360 },
  cityOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#f5f5f5" },
  cityOptionText: { fontSize: 14, lineHeight: 22, color: "#333" },
  cityOptionTextActive: { color: "#FF2C2C", fontWeight: "700" },
  passwordRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  passwordField: { flex: 1, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, backgroundColor: "#fff" },
  passwordInput: { flex: 1, padding: 14, fontSize: 14 },
  iconButton: { paddingHorizontal: 10, paddingVertical: 12 },
  generateIconButton: { width: 48, height: 48, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, backgroundColor: "#fff" },
  button: { backgroundColor: "#FF2C2C", borderRadius: 10, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, flex: 1 },
  buttonDisabled: { backgroundColor: "#999" },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  backButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2, paddingVertical: 16, borderRadius: 10, borderWidth: 1, borderColor: "#d1d5db", backgroundColor: "#fff" },
  backText: { color: "#555", fontSize: 15, fontWeight: "700" },
  navRow: { flexDirection: "row", alignItems: "center", marginTop: 16, gap: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb" },
  chipActive: { backgroundColor: "#FF2C2C", borderColor: "#FF2C2C" },
  chipText: { fontSize: 12, fontWeight: "600", color: "#555" },
  chipTextActive: { color: "#fff" },
  docRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  docButton: { flex: 1, flexDirection: "row", gap: 6, padding: 14, backgroundColor: "#f3f4f6", borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center", justifyContent: "center" },
  docButtonText: { fontSize: 13, fontWeight: "600", color: "#555" },
  preview: { width: "100%", height: 160, borderRadius: 8 },
  previewWrap: { marginTop: 2, marginBottom: 4 },
  previewRemove: { position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  kycCard: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb", padding: 14, marginBottom: 12 },
  kycCardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  kycCardTitle: { fontSize: 14, fontWeight: "700", color: "#111" },
  requiredStar: { color: "#FF2C2C", fontWeight: "700" },
});
