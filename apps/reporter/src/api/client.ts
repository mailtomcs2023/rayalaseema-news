import AsyncStorage from "@react-native-async-storage/async-storage";

const API_URL = process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? "http://10.0.2.2:3001" : "https://admin.rayalaseemaexpress.com");

interface ApiOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

export async function api(path: string, options: ApiOptions = {}) {
  const token = await AsyncStorage.getItem("auth-token");

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function uploadImage(uri: string): Promise<string> {
  const token = await AsyncStorage.getItem("auth-token");
  const formData = new FormData();
  const filename = uri.split("/").pop() || "photo.jpg";
  // Normalise the extension — "jpg" must map to the "image/jpeg" MIME type.
  const ext = (/\.(\w+)$/.exec(filename)?.[1] || "jpg").toLowerCase();
  const type = ext === "jpg" ? "image/jpeg" : `image/${ext}`;

  formData.append("file", { uri, name: filename, type } as any);

  const res = await fetch(`${API_URL}/api/reporter/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  const data = await res.json();
  if (!data.url) throw new Error(data.error || "Upload failed");
  return data.url;
}
