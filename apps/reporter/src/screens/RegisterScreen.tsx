import React, { useState, useLayoutEffect, useRef, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Image, Platform, Modal, KeyboardAvoidingView, Keyboard } from "react-native";
import { TextInput } from "../components/Input";
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

// DOB stored as ISO "YYYY-MM-DD"; shown as "Jun-15-2000" in the UI so the
// reporter reads it left-to-right the way a printed ID card shows it.
const DOB_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDOBDisplay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${DOB_MONTHS[m - 1]}-${String(d).padStart(2, "0")}-${y}`;
}

// Field label that colours the trailing "*" red. Many of the register
// labels live in i18n as "Full Name *" / "Email *"; rendering them through
// this component splits the asterisk onto its own <Text> so it gets the
// brand red without touching every translation string.
function FieldLabel({ children, style }: { children: string; style?: any }) {
  const idx = children.lastIndexOf(" *");
  if (idx < 0) return <Text style={style}>{children}</Text>;
  return (
    <Text style={style}>
      {children.slice(0, idx)}
      <Text style={{ color: "#FF2C2C" }}> *</Text>
    </Text>
  );
}

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
  const [showExperiencePicker, setShowExperiencePicker] = useState(false);

  // Predefined experience ranges shown in the modal picker (Step 1).
  // The stored value is the localized label so the admin journalist page
  // sees the same string regardless of language toggled at submit time.
  const experienceKeys = ["none", "lt1", "oneToThree", "threeToFive", "fiveToTen", "tenPlus"] as const;
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

  // Used to lift focused inputs (especially the multiline Address field) a
  // bit higher above the keyboard. iOS's automaticallyAdjustKeyboardInsets
  // alone leaves it flush against the keyboard; Android's adjustResize
  // doesn't scroll at all.
  const scrollRef = useRef<ScrollView>(null);
  // Tracks the current scroll content offset so the focus handler knows how
  // much extra to scroll on top of the field's on-screen position.
  const scrollY = useRef(0);
  const addressY = useRef(0);

  // Live keyboard height — used as dynamic bottom padding on the ScrollView
  // so fields near the end of the form can scroll up *into* the visible area
  // when the keyboard is open, without leaving dead space when it's closed.
  const [keyboardSpace, setKeyboardSpace] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvt, (e) => {
      setKeyboardSpace(e.endCoordinates?.height ?? 280);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardSpace(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Smoothly scroll any focused TextInput so its top sits ~100 px from the top
  // of the ScrollView — well clear of the keyboard. Uses measureLayout, which
  // is reliable on the New Architecture (Fabric) where the legacy
  // scrollResponderScrollNativeHandleToKeyboard helper is a no-op for many
  // input types. The 80 ms delay lets the keyboard begin animating in first
  // so the layout is settled when we measure.
  const handleInputFocus = (e: any) => {
    const target: any = e?.target;
    if (!target || typeof target.measure !== "function") return;
    // `measure` returns the field's absolute on-screen position (pageY).
    // Combined with the live scroll offset we track via onScroll, we can
    // compute exactly how far to scroll so the field sits at a comfortable
    // height above the keyboard. Works the same on Fabric/Paper and
    // iOS/Android — no node-handle gymnastics.
    setTimeout(() => {
      target.measure(
        (_x: number, _y: number, _w: number, _h: number, _pageX: number, pageY: number) => {
          // Target on-screen position: ~220 px from the top of the screen.
          // Leaves room for the nav header above and ~400 px below for the
          // keyboard + a small margin. Skip the scroll if the field is
          // already above that line.
          const desiredTop = 220;
          if (pageY <= desiredTop) return;
          const delta = pageY - desiredTop;
          scrollRef.current?.scrollTo({
            y: scrollY.current + delta,
            animated: true,
          });
        },
      );
    }, 80);
  };

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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      // iOS uses `padding` so the bottom inputs get pushed above the keyboard.
      // Android relies on the activity's adjustResize (Expo default) — setting
      // a behavior here on Android often fights the native resize and ends up
      // with double-padding.
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      // Bottom padding grows by the keyboard height while it's open so the
      // last fields can scroll up into the visible area. When the keyboard
      // closes, padding collapses back to its base value — no dead space.
      contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 20, paddingBottom: 60 + keyboardSpace }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
      // Live-track scroll Y so handleInputFocus can compute the correct
      // delta to scroll a focused field to the desired on-screen position.
      onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
      scrollEventThrottle={16}
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
          <FieldLabel style={styles.label}>{t("register.fullName")}</FieldLabel>
          <TextInput style={[styles.input, errors.fullName ? styles.inputError : null]} placeholder={t("register.fullNamePlaceholder")} value={form.fullName} onChangeText={(v) => update("fullName", v)} onFocus={handleInputFocus} />
          <FieldError message={errors.fullName} />
          <FieldLabel style={styles.label}>{t("register.email")}</FieldLabel>
          <TextInput style={[styles.input, errors.email ? styles.inputError : null]} placeholder={t("register.emailPlaceholder")} value={form.email} onChangeText={(v) => update("email", v)} keyboardType="email-address" autoCapitalize="none" onFocus={handleInputFocus} />
          <FieldError message={errors.email} />
          <FieldLabel style={styles.label}>{t("register.phone")}</FieldLabel>
          <TextInput style={[styles.input, errors.phone ? styles.inputError : null]} placeholder={t("register.phonePlaceholder")} value={form.phone} onChangeText={(v) => update("phone", v.replace(/[^0-9]/g, "").slice(0, 10))} keyboardType="phone-pad" maxLength={10} onFocus={handleInputFocus} />
          <FieldError message={errors.phone} />
          <FieldLabel style={styles.label}>{t("register.password")}</FieldLabel>
          <View style={styles.passwordRow}>
            <View style={[styles.passwordField, errors.password ? styles.inputError : null]}>
              <TextInput
                style={styles.passwordInput}
                placeholder={t("register.passwordPlaceholder")}
                value={form.password}
                onChangeText={(v) => update("password", v)}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                onFocus={handleInputFocus}
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
          <FieldLabel style={styles.label}>{t("register.dob")}</FieldLabel>
          <TouchableOpacity style={[styles.input, styles.dateField]} onPress={() => setShowDatePicker(true)} activeOpacity={0.7}>
            <Text numberOfLines={1} style={form.dateOfBirth ? styles.dateValue : styles.datePlaceholder}>
              {form.dateOfBirth ? formatDOBDisplay(form.dateOfBirth) : t("register.dob")}
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
          <FieldLabel style={styles.label}>{t("register.pincode")}</FieldLabel>
          <TextInput
            style={[styles.input, errors.pincode ? styles.inputError : null]}
            placeholder={t("register.pincodePlaceholder")}
            value={form.pincode}
            onChangeText={onPincodeChange}
            keyboardType="numeric"
            maxLength={6}
            onFocus={handleInputFocus}
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

          <FieldLabel style={styles.label}>{t("register.primaryDistrict")}</FieldLabel>
          <View style={styles.chipRow}>
            {districts.map((d) => (
              <TouchableOpacity key={d.value} onPress={() => setForm((f) => ({ ...f, primaryDistrict: d.value, city: "" }))}
                style={[styles.chip, form.primaryDistrict === d.value && styles.chipActive]}>
                <Text style={[styles.chipText, form.primaryDistrict === d.value && styles.chipTextActive]}>{d.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* City = assembly constituency within the selected district — tap to choose */}
          <FieldLabel style={styles.label}>{t("register.city")}</FieldLabel>
          <TouchableOpacity style={[styles.input, styles.dateField]} onPress={() => setShowCityPicker(true)} activeOpacity={0.7}>
            <Text numberOfLines={1} style={form.city ? styles.dateValue : styles.datePlaceholder}>
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

          <FieldLabel style={styles.label}>{t("register.address")}</FieldLabel>
          <TextInput
            style={styles.input}
            placeholder={t("register.addressPlaceholder")}
            value={form.address}
            onChangeText={(v) => update("address", v)}
            multiline
            onFocus={handleInputFocus}
          />

          {/* Previous media experience — select from a fixed set of ranges
              instead of free text. The stored value is the localized label,
              so the admin Journalist page sees the same string. */}
          <FieldLabel style={styles.label}>{t("register.experienceLabel")}</FieldLabel>
          <TouchableOpacity style={[styles.input, styles.dateField]} onPress={() => setShowExperiencePicker(true)} activeOpacity={0.7}>
            <Text numberOfLines={1} style={form.experience ? styles.dateValue : styles.datePlaceholder}>
              {form.experience || t("register.experiencePlaceholder")}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#888" />
          </TouchableOpacity>
          <Modal visible={showExperiencePicker} transparent animationType="slide" onRequestClose={() => setShowExperiencePicker(false)}>
            <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowExperiencePicker(false)}>
              <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
                <View style={styles.modalBarSplit}>
                  <Text style={styles.modalTitle}>{t("register.experienceLabel")}</Text>
                  <TouchableOpacity onPress={() => setShowExperiencePicker(false)}>
                    <Text style={styles.modalDone}>{t("common.ok")}</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.cityList}>
                  {experienceKeys.map((key) => {
                    const label = t(`register.experienceOptions.${key}`);
                    const active = form.experience === label;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={styles.cityOption}
                        onPress={() => {
                          update("experience", label);
                          setShowExperiencePicker(false);
                        }}
                      >
                        <Text style={[styles.cityOptionText, active && styles.cityOptionTextActive]}>{label}</Text>
                        {active && <Ionicons name="checkmark" size={20} color="#FF2C2C" />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </TouchableOpacity>
          </Modal>

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
            <FieldLabel style={styles.label}>{t("register.aadhaarNumber")}</FieldLabel>
            <TextInput
              style={[styles.input, errors.aadhaarNumber ? styles.inputError : null]}
              placeholder={t("register.aadhaarPlaceholder")}
              value={formatAadhaar(form.aadhaarNumber)}
              onChangeText={(v) => update("aadhaarNumber", v.replace(/[^0-9]/g, "").slice(0, 12))}
              keyboardType="numeric"
              maxLength={14}
            />
            <FieldError message={errors.aadhaarNumber} />
            <FieldLabel style={styles.label}>{t("register.aadhaarFront")}</FieldLabel>
            {renderDoc("aadhaarFrontUri", t("common.camera"), "camera-outline", errors.aadhaarFrontUri)}
            <FieldLabel style={styles.label}>{t("register.aadhaarBack")}</FieldLabel>
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
            <FieldLabel style={styles.label}>{t("register.panNumber")}</FieldLabel>
            <TextInput
              style={[styles.input, errors.panNumber ? styles.inputError : null]}
              placeholder={t("register.panPlaceholder")}
              value={form.panNumber}
              onChangeText={onPanChange}
              autoCapitalize="characters"
              maxLength={10}
            />
            <FieldError message={errors.panNumber} />
            <FieldLabel style={styles.label}>{t("register.panCard")}</FieldLabel>
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
          <FieldLabel style={styles.label}>{t("register.upiId")}</FieldLabel>
          <TextInput style={[styles.input, errors.upiId ? styles.inputError : null]} placeholder={t("register.upiPlaceholder")} value={form.upiId} onChangeText={(v) => update("upiId", v.trim())} autoCapitalize="none" />
          <FieldError message={errors.upiId} />
          <FieldLabel style={styles.label}>{t("register.bankName")}</FieldLabel>
          <TextInput style={[styles.input, errors.bankName ? styles.inputError : null]} placeholder={t("register.bankNamePlaceholder")} value={form.bankName} onChangeText={(v) => update("bankName", v)} />
          <FieldError message={errors.bankName} />
          <FieldLabel style={styles.label}>{t("register.accountNumber")}</FieldLabel>
          <TextInput style={[styles.input, errors.bankAccount ? styles.inputError : null]} placeholder={t("register.accountNumberPlaceholder")} value={form.bankAccount} onChangeText={(v) => update("bankAccount", v.replace(/[^0-9]/g, "").slice(0, 18))} keyboardType="numeric" />
          <FieldError message={errors.bankAccount} />
          <FieldLabel style={styles.label}>{t("register.ifsc")}</FieldLabel>
          <TextInput style={[styles.input, errors.bankIfsc ? styles.inputError : null]} placeholder={t("register.ifscPlaceholder")} value={form.bankIfsc} onChangeText={(v) => update("bankIfsc", v.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 11))} autoCapitalize="characters" />
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
    </KeyboardAvoidingView>
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
  // flex:1 + marginRight gives the inner <Text> the full remaining width and
  // a gap from the chevron. Without it the chevron sat hard against the text
  // and clipped the trailing character ("City" → "Cit").
  dateValue: { flex: 1, marginRight: 8, fontSize: 14, lineHeight: 22, color: "#111" },
  datePlaceholder: { flex: 1, marginRight: 8, fontSize: 14, lineHeight: 22, color: "#9ca3af" },
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
