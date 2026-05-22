import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { translations, type Lang } from "./translations";

export type { Lang } from "./translations";
export { LANGUAGE_NAMES } from "./translations";

const STORAGE_KEY = "app-language";

// Pick the device language on first launch — Telugu if the phone is set to
// Telugu, English otherwise. The reporter can override this via the toggle.
// Uses Intl (built into Hermes) so no native locale module is needed.
function detectDeviceLang(): Lang {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
    return locale.startsWith("te") ? "te" : "en";
  } catch {
    return "en";
  }
}

type TranslateParams = Record<string, string | number>;

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, params?: TranslateParams) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

// Walk a dotted key path ("register.fullName") into a translation object.
function resolve(dict: unknown, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // getLocales() is synchronous, so we get the right default with no flash.
  const [lang, setLangState] = useState<Lang>(detectDeviceLang);

  // A saved choice (if any) overrides the device default.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === "en" || saved === "te") setLangState(saved);
      })
      .catch(() => {});
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const t = useCallback(
    (key: string, params?: TranslateParams) => {
      let value = resolve(translations[lang], key) ?? resolve(translations.en, key) ?? key;
      if (params) {
        for (const [name, replacement] of Object.entries(params)) {
          value = value.split(`{${name}}`).join(String(replacement));
        }
      }
      return value;
    },
    [lang],
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useT(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useT must be used within a LanguageProvider");
  return ctx;
}
