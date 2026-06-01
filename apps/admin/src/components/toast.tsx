"use client";

// Tiny toast queue - no external lib, no context provider. The page that
// wants toasts holds the state and uses the `useToasts` hook to push them.
// Auto-dismiss after 5 s; click any toast to dismiss early.

import { useCallback, useState } from "react";

export type ToastType = "info" | "success" | "warn" | "error";
export interface Toast { id: string; type: ToastType; msg: string }

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  const push = useCallback((type: ToastType, msg: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, msg }]);
    setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);
  return { toasts, push, dismiss };
}

const STYLES: Record<ToastType, React.CSSProperties> = {
  info:    { background: "#dbeafe", color: "#1e40af", borderLeft: "4px solid #2563eb" },
  success: { background: "#dcfce7", color: "#166534", borderLeft: "4px solid #16a34a" },
  warn:    { background: "#fef3c7", color: "#92400e", borderLeft: "4px solid #f59e0b" },
  error:   { background: "#fee2e2", color: "#991b1b", borderLeft: "4px solid #dc2626" },
};

export function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, maxWidth: 380 }}>
      {toasts.map((t) => (
        <button key={t.id} onClick={() => onDismiss(t.id)}
          style={{
            ...STYLES[t.type],
            padding: "10px 14px",
            borderRadius: 6,
            border: "none",
            textAlign: "left",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
            animation: "toast-in 0.18s ease-out",
          }}>
          {t.msg}
        </button>
      ))}
      <style>{`@keyframes toast-in { from { transform: translateX(20px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }`}</style>
    </div>
  );
}
