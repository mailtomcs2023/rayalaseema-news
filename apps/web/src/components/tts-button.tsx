"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Free, browser-native Telugu TTS via the Web Speech API (`speechSynthesis`).
 * No server call, no Azure cost. Voice quality depends on the user's device:
 *  - Android Chrome: Google Telugu voice (good)
 *  - Windows: te-IN voice if installed via Settings → Time & Language → Language → Add language → Telugu → Speech
 *  - iOS Safari: limited Telugu support pre-iOS 18; otherwise will skip with a notice
 *
 * Falls back to a disabled state with a hint if no Telugu voice is found on
 * the device. Strips article HTML before reading.
 */
export function TTSButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "playing" | "paused" | "unsupported">("idle");
  const [voiceReady, setVoiceReady] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setState("unsupported");
      return;
    }
    // Voices load asynchronously on most browsers. Listen for voiceschanged
    // and pick a Telugu one when it shows up.
    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      const teVoice = voices.find((v) => v.lang === "te-IN" || v.lang.startsWith("te"));
      setVoiceReady(!!teVoice);
    };
    pickVoice();
    window.speechSynthesis.onvoiceschanged = pickVoice;

    return () => {
      window.speechSynthesis.cancel();
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const handleClick = () => {
    if (state === "unsupported") return;

    if (state === "playing") {
      window.speechSynthesis.pause();
      setState("paused");
      return;
    }
    if (state === "paused") {
      window.speechSynthesis.resume();
      setState("playing");
      return;
    }

    // Fresh play - strip HTML & limit length (browsers choke past ~30k chars).
    const cleanText = text
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/Source:[\s\S]*$/, "")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 8000);

    if (cleanText.length < 5) return;

    const utter = new SpeechSynthesisUtterance(cleanText);
    utter.lang = "te-IN";
    utter.rate = 0.95;
    utter.pitch = 1;
    utter.volume = 1;

    const voices = window.speechSynthesis.getVoices();
    const teVoice =
      voices.find((v) => v.lang === "te-IN") ||
      voices.find((v) => v.lang.startsWith("te"));
    if (teVoice) utter.voice = teVoice;

    utter.onend = () => setState("idle");
    utter.onerror = () => setState("idle");

    utterRef.current = utter;
    window.speechSynthesis.cancel(); // clear any stale queue
    window.speechSynthesis.speak(utter);
    setState("playing");
  };

  if (state === "unsupported") {
    return null; // hide button on browsers without the API
  }

  const disabled = !voiceReady && state === "idle";

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      title={disabled ? "మీ పరికరంలో తెలుగు వాయిస్ లేదు" : ""}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "8px 16px",
        background: state === "playing" ? "#fef2f2" : "#f3f4f6",
        border: "1px solid #e5e7eb", borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 13, fontWeight: 600,
        color: state === "playing" ? "#dc2626" : disabled ? "#bbb" : "#555",
        opacity: disabled ? 0.6 : 1,
        transition: "all 0.15s",
      }}>
      {state === "playing" ? (
        <>
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
          ఆపండి
        </>
      ) : state === "paused" ? (
        <>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          కొనసాగించు
        </>
      ) : (
        <>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"/></svg>
          వినండి
        </>
      )}
    </button>
  );
}
