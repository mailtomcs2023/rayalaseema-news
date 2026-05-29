import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "../api/client";
import { useT } from "../i18n";

type KycStatus = "PENDING" | "SUBMITTED" | "VERIFIED" | "REJECTED";

interface KycUi {
  // Tinted hero card colors
  bg: string;            // soft tint for the whole card
  accent: string;        // bold colour for icon chip + CTA + step dots
  text: string;          // title colour
  icon: keyof typeof Ionicons.glyphMap;
  // Progress: index of the step (0-based) that's CURRENT.
  // Earlier steps render as completed, later as inactive.
  step: 0 | 1 | 2;
  title: string;
  msg: string;
  cta?: { label: string; route: string };
  eta?: string;            // small italic line under CTA (SUBMITTED only)
  draftsHint?: string;     // small line below message (SUBMITTED only)
}

// Reads the cached reporter profile and renders the KYC status as a hero
// card. Returns null for VERIFIED reporters so verified users see no
// banner. PENDING / REJECTED have an action CTA; SUBMITTED has an ETA.
//
// The reporter object is set on login by /api/reporter/login and includes:
//   kycStatus: PENDING | SUBMITTED | VERIFIED | REJECTED
//   kycRejectionNote: string | null
//   registrationComplete: boolean - false for admin-created reporters who
//     haven't filled in their own personal details yet. When false (and
//     status is still PENDING) the banner swaps "Upload documents" for
//     "Complete registration" and routes to the multi-step finish flow.
export function KycBanner() {
  const { t } = useT();
  const router = useRouter();
  const [status, setStatus] = useState<KycStatus | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [registrationComplete, setRegistrationComplete] = useState<boolean>(true);

  // Fast path on first mount: read whatever's cached in AsyncStorage so the
  // banner renders in one frame, no network wait.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem("user").then((raw) => {
      if (cancelled || !raw) return;
      try {
        const u = JSON.parse(raw);
        setStatus((u.kycStatus as KycStatus) || null);
        setNote(u.kycRejectionNote || null);
        // Default to TRUE if the field is missing (older login responses
        // didn't send it) so existing self-registered reporters don't get
        // mis-classified as incomplete.
        setRegistrationComplete(u.registrationComplete !== false);
      } catch {}
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Authoritative path: every time this screen comes into focus, hit the
  // server. Catches admin-side changes (VERIFIED, REJECTED, etc.) that the
  // app couldn't have known about from a stale login cache. The fresh
  // status is mirrored back into AsyncStorage so other components reading
  // `user.kycStatus` (Submit-for-Review gate, Earnings screen) see it too.
  const refreshFromServer = useCallback(async () => {
    try {
      const data = await api("/api/reporter/profile");
      const fresh = (data?.profile?.kycStatus as KycStatus) || null;
      const freshNote = (data?.profile?.kycRejectionNote as string | null) ?? null;
      const freshRegComplete = data?.registrationComplete !== false;
      if (!fresh) return;
      setStatus(fresh);
      setNote(freshNote);
      setRegistrationComplete(freshRegComplete);
      const raw = await AsyncStorage.getItem("user");
      if (raw) {
        const u = JSON.parse(raw);
        if (
          u.kycStatus !== fresh ||
          u.kycRejectionNote !== freshNote ||
          u.registrationComplete !== freshRegComplete
        ) {
          await AsyncStorage.setItem(
            "user",
            JSON.stringify({
              ...u,
              kycStatus: fresh,
              kycRejectionNote: freshNote,
              registrationComplete: freshRegComplete,
            }),
          );
        }
      }
    } catch {
      // Network/auth failures fall back to whatever the cache said; the
      // api() helper already handles force-logout on 401.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshFromServer();
    }, [refreshFromServer]),
  );

  if (!status || status === "VERIFIED") return null;

  // Admin-created reporter on first sign-in: minimal "complete
  // registration" card that previews the 3 sections they're about to
  // fill so the flow doesn't feel like a black box.
  if (status === "PENDING" && !registrationComplete) {
    return (
      <CompleteRegistrationCard
        onPress={() => router.push("/complete-registration")}
        t={t}
      />
    );
  }

  const ui = getKycUi(status, t);

  return (
    <View style={[styles.card, { backgroundColor: ui.bg }]}>
      {/* Top row: icon chip + title block */}
      <View style={styles.topRow}>
        <View style={[styles.iconChip, { backgroundColor: ui.accent }]}>
          <Ionicons name={ui.icon} size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: ui.text }]}>{ui.title}</Text>
          <Text style={styles.msg}>{ui.msg}</Text>
        </View>
      </View>

      {/* Progress dots - three steps, current one filled with accent,
          earlier ones filled with a check, later ones empty. */}
      <View style={styles.steps}>
        {([
          { idx: 0, label: t("kyc.step1") },
          { idx: 1, label: t("kyc.step2") },
          { idx: 2, label: t("kyc.step3") },
        ] as const).map(({ idx, label }, i, arr) => {
          const isDone = idx < ui.step;
          const isCurrent = idx === ui.step;
          const dotBg = isDone ? ui.accent : isCurrent ? ui.accent : "#fff";
          const dotBorder = isDone || isCurrent ? ui.accent : "#d1d5db";
          const labelColor = isDone || isCurrent ? ui.text : "#9ca3af";
          return (
            <React.Fragment key={idx}>
              <View style={styles.stepCol}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: dotBg, borderColor: dotBorder },
                    isCurrent && styles.dotCurrent,
                  ]}
                >
                  {isDone ? (
                    <Ionicons name="checkmark" size={11} color="#fff" />
                  ) : isCurrent ? (
                    <View style={styles.dotInner} />
                  ) : null}
                </View>
                <Text style={[styles.stepLabel, { color: labelColor }]} numberOfLines={1}>
                  {label}
                </Text>
              </View>
              {i < arr.length - 1 && (
                <View
                  style={[
                    styles.connector,
                    { backgroundColor: idx < ui.step ? ui.accent : "#e5e7eb" },
                  ]}
                />
              )}
            </React.Fragment>
          );
        })}
      </View>

      {/* SUBMITTED - ETA + drafts hint */}
      {ui.eta ? (
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={13} color={ui.accent} />
          <Text style={[styles.metaText, { color: ui.text }]}>{ui.eta}</Text>
        </View>
      ) : null}
      {ui.draftsHint ? (
        <View style={styles.metaRow}>
          <Ionicons name="information-circle-outline" size={13} color="#6b7280" />
          <Text style={styles.draftsText}>{ui.draftsHint}</Text>
        </View>
      ) : null}

      {/* REJECTED - admin's rejection note (italic, quoted) */}
      {status === "REJECTED" && note ? (
        <View style={styles.noteBox}>
          <Text style={styles.noteLabel}>{t("kyc.adminNote")}</Text>
          <Text style={styles.noteText}>“{note}”</Text>
        </View>
      ) : null}

      {/* CTA - bold accent button for PENDING / REJECTED */}
      {ui.cta ? (
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: ui.accent }]}
          onPress={() => router.push(ui.cta!.route as any)}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>{ui.cta.label}</Text>
          <Ionicons name="arrow-forward" size={16} color="#fff" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// Each status maps to its own visual identity + the actionable step in the
// 3-step pipeline. Keeping this as a pure function keeps the JSX above lean.
//
// The "admin-created, profile-incomplete" variant is rendered by
// CompleteRegistrationCard below and doesn't pass through here at all.
function getKycUi(status: KycStatus, t: (k: string) => string): KycUi {
  switch (status) {
    case "REJECTED":
      return {
        bg: "#fff1f1",
        accent: "#dc2626",
        text: "#7f1d1d",
        icon: "alert-circle",
        step: 1, // back at the "documents" step
        title: t("kyc.rejectedTitle"),
        msg: t("kyc.rejectedMsg"),
        cta: { label: t("kyc.ctaResubmit"), route: "/kyc" },
      };
    case "SUBMITTED":
      return {
        bg: "#eef4ff",
        accent: "#2563eb",
        text: "#1e3a8a",
        icon: "hourglass",
        step: 2, // documents done, verification in progress
        title: t("kyc.submittedTitle"),
        msg: t("kyc.submittedMsg"),
        eta: t("kyc.etaUsually"),
        // No "drafts still work" hint anymore - drafts are blocked too while
        // KYC is pending. The msg above already explains the state.
      };
    // PENDING + registration complete: docs upload remains.
    default:
      return {
        bg: "#fff7ed",
        accent: "#f59e0b",
        text: "#7c2d12",
        icon: "document-text",
        step: 1,
        title: t("kyc.pendingTitle"),
        msg: t("kyc.pendingMsg"),
        cta: { label: t("kyc.ctaUpload"), route: "/kyc" },
      };
  }
}

// Very minimal card for admin-created reporters on first sign-in.
// Title row (with time meta on the right) + 3 inline numbered steps +
// CTA. Steps share row width with flex:1 each, so the card has no
// dead right-side gap regardless of language.
function CompleteRegistrationCard({
  onPress,
  t,
}: {
  onPress: () => void;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  const steps = [
    t("welcome.step1Short"),
    t("welcome.step2Short"),
    t("welcome.step3Short"),
  ];

  return (
    <View style={welcomeStyles.card}>
      <View style={welcomeStyles.headRow}>
        <Text style={welcomeStyles.title}>{t("kyc.completeRegistrationTitle")}</Text>
        <Text style={welcomeStyles.meta}>{t("welcome.metaShort")}</Text>
      </View>

      <View style={welcomeStyles.stepsRow}>
        {steps.map((label, i) => (
          <View key={i} style={welcomeStyles.stepCol}>
            <View style={welcomeStyles.numChip}>
              <Text style={welcomeStyles.numText}>{i + 1}</Text>
            </View>
            <Text style={welcomeStyles.stepLabel} numberOfLines={1}>{label}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={welcomeStyles.cta} onPress={onPress} activeOpacity={0.85}>
        <Text style={welcomeStyles.ctaText}>{t("kyc.ctaCompleteRegistration")}</Text>
        <Ionicons name="arrow-forward" size={16} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 14,
    marginTop: 14,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    // Hairline border + soft shadow so the card reads as a card even when its
    // tinted background (#eef4ff / #fff7ed / #fff1f1) is close in value to the
    // screen's #f3f4f6 - otherwise SUBMITTED in particular blends in.
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  topRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  iconChip: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 16, fontWeight: "800", lineHeight: 20 },
  msg: { fontSize: 13, color: "#4b5563", marginTop: 3, lineHeight: 18 },

  // Progress
  steps: {
    flexDirection: "row", alignItems: "flex-start",
    paddingVertical: 4, paddingHorizontal: 4,
  },
  stepCol: { alignItems: "center", width: 70 },
  dot: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, backgroundColor: "#fff",
  },
  dotCurrent: {
    // Subtle ring around the current step so it pops.
    shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  dotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
  stepLabel: { fontSize: 10, fontWeight: "700", marginTop: 6, textAlign: "center" },
  connector: {
    flex: 1, height: 2, marginTop: 10, alignSelf: "flex-start",
    marginHorizontal: -8,
  },

  // Meta rows under the title (eta + drafts hint)
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 12, fontWeight: "700" },
  draftsText: { fontSize: 11, color: "#6b7280" },

  // Rejection note for REJECTED state - flat-left, rounded-right callout
  // so the red accent border reads as an inset marker (admin's note),
  // not a floating card.
  noteBox: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#dc2626",
  },
  noteLabel: {
    fontSize: 10, fontWeight: "800", color: "#7f1d1d",
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  noteText: { fontSize: 13, color: "#7f1d1d", fontStyle: "italic", marginTop: 3, lineHeight: 18 },

  // CTA button
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  ctaText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});

// Compact "complete registration" card. Title + time meta on one
// row, 3 inline numbered steps below using flex:1 columns, then a
// full-width amber CTA. White bg + thin amber border, no shadow.
const welcomeStyles = StyleSheet.create({
  card: {
    marginHorizontal: 14,
    marginTop: 14,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  title: { fontSize: 15, fontWeight: "800", color: "#111", lineHeight: 20, flex: 1 },
  meta: { fontSize: 11, fontWeight: "700", color: "#b45309" },

  // Steps row - each column shares width equally so labels of any
  // length (Telugu glyphs run wider) stay aligned and don't push the
  // others off-screen.
  stepsRow: { flexDirection: "row", alignItems: "center" },
  stepCol: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  numChip: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#f59e0b",
  },
  numText: { color: "#fff", fontSize: 10, fontWeight: "800", lineHeight: 12 },
  stepLabel: { flex: 1, fontSize: 12, fontWeight: "600", color: "#374151", lineHeight: 16 },

  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#f59e0b",
  },
  ctaText: { color: "#fff", fontSize: 13, fontWeight: "800" },
});
