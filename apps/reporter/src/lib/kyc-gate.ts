import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { useRouter } from "expo-router";

// Mirrors the Prisma KycStatus enum.
export type KycStatus = "PENDING" | "SUBMITTED" | "VERIFIED" | "REJECTED";

// Stored under "user" on login by /api/reporter/login.
async function readCachedUserState(): Promise<{
  status: KycStatus | null;
  registrationComplete: boolean;
}> {
  try {
    const raw = await AsyncStorage.getItem("user");
    if (!raw) return { status: null, registrationComplete: true };
    const u = JSON.parse(raw);
    return {
      status: (u.kycStatus as KycStatus) || null,
      // Older login responses didn't include the flag; default to TRUE so
      // existing self-registered reporters aren't mis-classified as
      // incomplete.
      registrationComplete: u.registrationComplete !== false,
    };
  } catch {
    return { status: null, registrationComplete: true };
  }
}

type Router = ReturnType<typeof useRouter>;

/**
 * Gate for article-creation entry points (FAB, empty-state CTAs, etc).
 *
 * Returns true only if the reporter's KYC is VERIFIED - in which case the
 * caller proceeds with the navigation. Otherwise an Alert tailored to the
 * current state explains the block; the caller does nothing further.
 *
 * Three blocking states, in order of precedence:
 *   1. Registration incomplete (admin-created reporter, profile not filled).
 *      Wins over KYC status because there's no point asking them to upload
 *      docs they haven't typed an address for yet. CTA → /complete-registration.
 *   2. KYC state (PENDING / SUBMITTED / REJECTED). CTA → /kyc.
 *
 * The server enforces the same rule on POST /api/reporter/articles, so this
 * is a UX hint - not the security boundary.
 */
export async function requireVerifiedKyc(
  t: (k: string) => string,
  router: Router,
): Promise<boolean> {
  const { status, registrationComplete } = await readCachedUserState();
  if (status === "VERIFIED") return true;

  // Registration incomplete trumps KYC state - the reporter literally
  // hasn't told us their phone / address / pincode yet, so an "Upload
  // documents" CTA would land them on a screen that asks for KYC docs
  // before the personal step.
  if (!registrationComplete) {
    Alert.alert(t("kyc.gate.incompleteTitle"), t("kyc.gate.incomplete"), [
      { text: t("kyc.gate.completeCta"), onPress: () => router.push("/complete-registration") },
      { text: t("common.ok"), style: "cancel" },
    ]);
    return false;
  }

  // PENDING / null → reporter hasn't uploaded docs yet, point them at KYC.
  // SUBMITTED      → docs uploaded, waiting on admin; no actionable button.
  // REJECTED       → admin sent it back; CTA points back at KYC to resubmit.
  let messageKey = "kyc.gate.pending";
  let showCta = true;
  if (status === "SUBMITTED") { messageKey = "kyc.gate.submitted"; showCta = false; }
  else if (status === "REJECTED") { messageKey = "kyc.gate.rejected"; showCta = true; }

  const buttons: { text: string; onPress?: () => void; style?: "cancel" | "default" }[] = [
    { text: t("common.ok"), style: "cancel" },
  ];
  if (showCta) {
    buttons.unshift({
      text: t("kyc.gate.goCta"),
      onPress: () => router.push("/kyc"),
    });
  }

  Alert.alert(t("kyc.gate.title"), t(messageKey), buttons);
  return false;
}
