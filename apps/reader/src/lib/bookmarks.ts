import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import type { Article } from "../api/client";

// Saved/bookmarked stories live entirely on-device (no user accounts in the
// reader app). We persist the full Article snapshot so the Saved tab can render
// offline without re-hitting the API.
const STORAGE_KEY = "saved-articles";

type Listener = () => void;
const listeners = new Set<Listener>();
let cache: Article[] | null = null;

async function load(): Promise<Article[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as Article[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

async function persist(next: Article[]) {
  cache = next;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  listeners.forEach((l) => l());
}

export async function toggleBookmark(article: Article): Promise<boolean> {
  const list = await load();
  const exists = list.some((a) => a.id === article.id);
  if (exists) {
    // Removing - a light selection tick (fire-and-forget; ignored if the user
    // disabled haptics).
    Haptics.selectionAsync().catch(() => {});
    await persist(list.filter((a) => a.id !== article.id));
    return false;
  }
  // Saving - a slightly firmer impact so "saved" feels more deliberate than
  // "removed". Newest saved first.
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  await persist([article, ...list]);
  return true;
}

// Subscribe a component to the saved-list. Returns the live list + helpers.
// Shared cache + listener set means every screen stays in sync the moment a
// bookmark is toggled anywhere.
export function useBookmarks() {
  const [items, setItems] = useState<Article[]>(cache ?? []);

  useEffect(() => {
    let mounted = true;
    const sync = () => mounted && setItems(cache ?? []);
    listeners.add(sync);
    load().then(sync);
    return () => {
      mounted = false;
      listeners.delete(sync);
    };
  }, []);

  const isSaved = useCallback((id: string) => items.some((a) => a.id === id), [items]);

  return { items, isSaved, toggle: toggleBookmark };
}
