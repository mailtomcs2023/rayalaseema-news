import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// Reporter auth token storage.
//
// SecureStore wraps iOS Keychain / Android EncryptedSharedPreferences, so the
// token is encrypted at rest and isolated to this app. AsyncStorage is plain
// disk and readable by anyone with file access (e.g. a backup, a rooted
// device, ADB on a debug build).
//
// SecureStore is unavailable on web/Expo Go-on-web — we fall back to
// AsyncStorage there so dev still works.
//
// First read on each device transparently migrates a pre-existing
// AsyncStorage token into SecureStore and removes the plain copy.

const TOKEN_KEY = "auth-token";
const SECURE_AVAILABLE = Platform.OS === "ios" || Platform.OS === "android";

let migrated = false;
async function migrateOnce() {
  if (migrated || !SECURE_AVAILABLE) return;
  migrated = true;
  try {
    const existing = await SecureStore.getItemAsync(TOKEN_KEY);
    if (existing) return;
    const legacy = await AsyncStorage.getItem(TOKEN_KEY);
    if (legacy) {
      await SecureStore.setItemAsync(TOKEN_KEY, legacy);
      await AsyncStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Best-effort migration — if SecureStore throws (e.g. user has no
    // device passcode on iOS pre-13), fall back to AsyncStorage so the app
    // still works.
  }
}

export async function getAuthToken(): Promise<string | null> {
  await migrateOnce();
  if (SECURE_AVAILABLE) {
    try {
      const v = await SecureStore.getItemAsync(TOKEN_KEY);
      if (v) return v;
    } catch {}
  }
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setAuthToken(token: string): Promise<void> {
  if (SECURE_AVAILABLE) {
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      // Clean any stale AsyncStorage copy from a previous app version.
      await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
      return;
    } catch {}
  }
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearAuthToken(): Promise<void> {
  if (SECURE_AVAILABLE) {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {}
  }
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
}
