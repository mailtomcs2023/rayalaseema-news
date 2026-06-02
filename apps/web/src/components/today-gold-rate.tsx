// "Today's Gold Rate" card - Andhra Pradesh rates from Lalithaa Jewellery's
// API (see lib/lalithaa-rates.ts). Server component: rates are in the SSR
// HTML (no flash), refreshed via the source's 30-min cache. Renders nothing
// if the source is unreachable, so it never shows a broken/empty card.

import { getApGoldRates, formatRateTimestamp } from "@/lib/lalithaa-rates";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export async function TodayGoldRate() {
  const r = await getApGoldRates();
  if (!r) return null;

  const rows = [
    { label: "Gold (22KT / 1g)", value: r.goldPerGram },
    { label: "Silver (1g)", value: r.silverPerGram },
    { label: "Platinum (1g)", value: r.platinumPerGram },
  ];

  return (
    <section className="tgr" aria-label="Today's Gold Rate">
      <h2 className="tgr-title">Today&apos;s Gold Rate</h2>
      <dl className="tgr-list">
        {rows.map((row) => (
          <div key={row.label} className="tgr-row">
            <dt className="tgr-label">{row.label}</dt>
            <dd className="tgr-value">{inr(row.value)}</dd>
          </div>
        ))}
      </dl>
      {r.updatedAt && (
        <p className="tgr-updated">Last updated: {formatRateTimestamp(r.updatedAt)}</p>
      )}
      <style>{`
        .tgr {
          background: #fff;
          border: 1px solid var(--paper-edge, rgba(0,0,0,0.08));
          border-radius: 10px;
          padding: 16px 18px;
          max-width: 360px;
          font-family: var(--font-telugu-body), sans-serif;
        }
        .tgr-title {
          margin: 0 0 12px;
          font-family: var(--font-telugu-heading), serif;
          font-size: 17px;
          font-weight: 800;
          color: var(--n-900, #111827);
        }
        .tgr-list { margin: 0; padding: 0; }
        .tgr-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          padding: 9px 0;
          border-bottom: 1px solid var(--paper-edge, rgba(0,0,0,0.06));
        }
        .tgr-row:last-child { border-bottom: none; }
        .tgr-label { color: var(--n-600, #4b5563); font-size: 14px; }
        .tgr-value {
          margin: 0;
          font-size: 18px;
          font-weight: 800;
          color: var(--brand, #E01B1B);
          font-variant-numeric: tabular-nums;
        }
        .tgr-updated {
          margin: 12px 0 0;
          font-size: 12px;
          color: var(--n-500, #6b7280);
        }
      `}</style>
    </section>
  );
}
