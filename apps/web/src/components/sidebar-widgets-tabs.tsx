"use client";

import { useState } from "react";
import { BullionWidget, ForexWidget, CricketWidget, MandiWidget } from "@/components/market-widgets";
import { WeatherWidget } from "@/components/weather-widget";
import { HoroscopeWidget } from "@/components/horoscope-widget";
import { PollWidget } from "@/components/poll-widget";

type TabKey = "market" | "live" | "poll";

const tabs: { key: TabKey; label: string }[] = [
  { key: "market", label: "మార్కెట్" },
  { key: "live", label: "లైవ్" },
  { key: "poll", label: "పోల్" },
];

export function SidebarWidgetsTabs() {
  const [active, setActive] = useState<TabKey>("market");

  return (
    <div className="panel" style={{ marginTop: "var(--sp-2)", overflow: "hidden" }}>
      <div role="tablist" style={{ display: "flex", borderBottom: "2px solid var(--brand)" }}>
        {tabs.map((t) => {
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.key)}
              style={{
                flex: 1,
                padding: "var(--sp-2) var(--sp-1)",
                fontSize: "var(--t-xs)",
                fontWeight: "var(--w-head)" as any,
                letterSpacing: "0.04em",
                textTransform: "uppercase" as const,
                border: "none",
                cursor: "pointer",
                background: isActive ? "var(--brand)" : "transparent",
                color: isActive ? "var(--brand-on)" : "var(--n-600)",
                transition: "background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease)",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ padding: "var(--sp-1) 0" }}>
        {active === "market" && (
          <>
            <BullionWidget />
            <ForexWidget />
            <MandiWidget />
          </>
        )}
        {active === "live" && (
          <>
            <CricketWidget />
            <WeatherWidget />
            <HoroscopeWidget />
          </>
        )}
        {active === "poll" && <PollWidget />}
      </div>
    </div>
  );
}
