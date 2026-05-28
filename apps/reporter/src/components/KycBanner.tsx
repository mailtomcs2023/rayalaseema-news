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
export function KycBanner() {
  const { t } = useT();
  const router = useRouter();
  const [status, setStatus] = useState<KycStatus | null>(null);
  const [note, setNote] = useState<string | null>(null);

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
      if (!fresh) return;
      setStatus(fresh);
      setNote(freshNote);
      const raw = await AsyncStorage.getItem("user");
      if (raw) {
        const u = JSON.parse(raw);
        if (u.kycStatus !== fresh || u.kycRejectionNote !== freshNote) {
          await AsyncStorage.setItem(
            "user",
            JSON.stringify({ ...u, kycStatus: fresh, kycRejectionNote: freshNote }),
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
    // PENDING - account exists, docs not uploaded yet.
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
