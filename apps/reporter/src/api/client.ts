import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { router } from "expo-router";
import { getAuthToken, clearAuthToken } from "../lib/secure-token";

// Clears stored credentials and bounces the user to /login. Triggered when
// any reporter endpoint returns 401 - typically because the admin toggled
// the reporter inactive, or the token expired / was revoked.
let forcingLogout = false;
async function forceLogout(reason: string) {
  if (forcingLogout) return;
  forcingLogout = true;
  try {
    await clearAuthToken();
    await AsyncStorage.removeItem("user");
    // Clear the one-shot KYC-nudge flag too - next sign-in (potentially a
    // different reporter on the same device) should get the same first-
    // landing prompt. Without this, the second account silently skips
    // /kyc on the first launch.
    await AsyncStorage.removeItem("kyc_nudge_seen");
    // Best-effort navigation. If the router isn't mounted yet (e.g. cold
    // start before the root layout renders), the index gate sees the empty
    // auth-token on its next pass and redirects there anyway.
    try {
      router.replace("/login");
    } catch {}
  } finally {
    // Release the guard after a tick so subsequent in-flight failures don't
    // queue a redundant navigation - but a fresh user session can still
    // trigger it later.
    setTimeout(() => {
      forcingLogout = false;
    }, 500);
  }
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log("[reporter] force-logout:", reason);
  }
}

// In dev we ask Expo Go what host *it* loaded the bundle from - that's the
// same machine running the admin API, so the phone is guaranteed to be able
// to reach it. This self-heals across DHCP-IP changes and different networks
// without anyone editing .env.
function devApiUrl(): string | null {
  // hostUri: "192.168.1.5:8081" - Metro/dev bundler. expoGoConfig variants
  // cover older SDKs and dev-client builds.
  const hostUri =
    (Constants.expoConfig as any)?.hostUri ||
    (Constants as any).expoGoConfig?.developer?.tool ||
    (Constants as any).manifest2?.extra?.expoGo?.developer?.tool ||
    "";
  const host = hostUri.split(":")[0];
  return host ? `http://${host}:3001` : null;
}

// Priority: explicit override → dev auto-detect → production URL.
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (__DEV__ ? devApiUrl() : null) ||
  "https://admin.rayalaseemaexpress.com";

if (__DEV__) {
  // One-line log so you can see which host the app is talking to.
  // eslint-disable-next-line no-console
  console.log("[reporter] API_URL =", API_URL);
}

interface ApiOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export async function api(path: string, options: ApiOptions = {}) {
  const token = await getAuthToken();

  // RN fetch has no default timeout - a silently-dropped TCP connection
  // (wrong IP, firewall drop) hangs the UI for ~60s. 10s is more than
  // enough for a healthy dev server and converts hangs into real errors.
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 10000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "Request failed" }));
      // 401 from a reporter endpoint means the token is invalid OR the
      // reporter has been deactivated in the admin portal. Wipe local
      // credentials and bounce to /login so the next render is clean.
      if (res.status === 401) {
        await forceLogout(`401 from ${path}`);
        throw new Error(error.error || "Session ended. Please log in again.");
      }
      throw new Error(error.error || `HTTP ${res.status}`);
    }

    return res.json();
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms (${API_URL}${path})`);
    }
    // Network errors from RN fetch surface as "Network request failed" with
    // no detail. Tag them with the URL so we know what was unreachable.
    if (/network request failed/i.test(e?.message || "")) {
      throw new Error(`Network error reaching ${API_URL} - phone can't connect to the dev server`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function uploadImage(uri: string): Promise<string> {
  const token = await getAuthToken();
  const formData = new FormData();
  const filename = uri.split("/").pop() || "photo.jpg";
  // Normalise the extension - "jpg" must map to the "image/jpeg" MIME type.
  const ext = (/\.(\w+)$/.exec(filename)?.[1] || "jpg").toLowerCase();
  const type = ext === "jpg" ? "image/jpeg" : `image/${ext}`;

  formData.append("file", { uri, name: filename, type } as any);

  const res = await fetch(`${API_URL}/api/reporter/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (res.status === 401) {
    await forceLogout("401 from /api/reporter/upload");
    throw new Error("Session ended. Please log in again.");
  }

  const data = await res.json();
  if (!data.url) throw new Error(data.error || "Upload failed");
  return data.url;
}
