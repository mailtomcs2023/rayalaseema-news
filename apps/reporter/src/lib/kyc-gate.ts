import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { useRouter } from "expo-router";

// Mirrors the Prisma KycStatus enum.
export type KycStatus = "PENDING" | "SUBMITTED" | "VERIFIED" | "REJECTED";

// Stored under "user" on login by /api/reporter/login.
async function readCachedKycStatus(): Promise<KycStatus | null> {
  try {
    const raw = await AsyncStorage.getItem("user");
    if (!raw) return null;
    const u = JSON.parse(raw);
    return (u.kycStatus as KycStatus) || null;
  } catch {
    return null;
  }
}

type Router = ReturnType<typeof useRouter>;

/**
 * Gate for article-creation entry points (FAB, empty-state CTAs, etc).
 *
 * Returns true only if the reporter's KYC is VERIFIED - in which case the
 * caller proceeds with the navigation. Otherwise an Alert tailored to the
 * current KYC state explains the block; the caller does nothing further.
 *
 * The server enforces the same rule on POST /api/reporter/articles, so this
 * is a UX hint - not the security boundary.
 */
export async function requireVerifiedKyc(
  t: (k: string) => string,
  router: Router,
): Promise<boolean> {
  const status = await readCachedKycStatus();
  if (status === "VERIFIED") return true;

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
