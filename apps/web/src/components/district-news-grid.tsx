"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { articleHref } from "@/lib/article-href";

interface DistrictNews {
  district: { name: string; nameEn: string; slug: string };
  articles: {
    id: string;
    title: string;
    slug: string;
    summary: string | null;
    featuredImage: string | null;
    publishedAt: string | null;
    category: { name: string; color: string };
    // Optional - only populated when the upstream API includes constituency.
    // Falls through to /news/ fallback URL otherwise.
    constituency?: { slug: string; district: { slug: string } } | null;
  }[];
}

export function DistrictNewsGrid({ districts }: { districts: DistrictNews[] }) {
  const [myDistrict, setMyDistrict] = useState<string | null>(null);

  useEffect(() => {
    const d = localStorage.getItem("my-district");
    if (d && d !== "all") setMyDistrict(d);
  }, []);

  if (!districts.length) return null;

  const myData = myDistrict ? districts.find((d) => d.district.slug === myDistrict) : null;
  const otherDistricts = myData
    ? districts.filter((d) => d.district.slug !== myDistrict)
    : districts;

  return (
    <div>
      {/* Section Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0 8px" }}>
        <div style={{ width: 5, height: 24, borderRadius: 3, background: "var(--color-brand)" }} />
        <h2 style={{ fontSize: 18, fontWeight: 900, color: "var(--color-brand)" }}>రాయలసీమ వార్తలు</h2>
        <span style={{ fontSize: 12, color: "#888", marginLeft: 4 }}>8 జిల్లాలు</span>
        {myDistrict && (
          <button onClick={() => { localStorage.removeItem("my-district"); setMyDistrict(null); window.location.reload(); }}
            style={{ marginLeft: "auto", fontSize: 10, color: "var(--color-brand)", background: "#fff1f1", border: "1px solid #fecaca", borderRadius: 4, padding: "3px 10px", cursor: "pointer", fontWeight: 600 }}>
            జిల్లా మార్చు
          </button>
        )}
      </div>

      {/* === MY DISTRICT: Featured big section === */}
      {myData && myData.articles.length > 0 && (
        <div className="my-district-featured">
          <Link href={`/${myData.district.slug}`} style={{ textDecoration: "none", color: "#fff" }}>
            <div className="my-district-header">
              <span style={{ color: "#fff" }}>★ {myData.district.name} వార్తలు</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }}>మీ జిల్లా &rarr;</span>
            </div>
          </Link>
          <div className="my-district-body">
            {/* Left: big featured article */}
            <div className="my-district-main">
              <Link href={articleHref(myData.articles[0])} style={{ textDecoration: "none" }}>
                {myData.articles[0].featuredImage ? (
                  <img src={myData.articles[0].featuredImage} alt="" className="my-district-img" loading="lazy" />
                ) : (
                  <div className="my-district-img" style={{ background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: "#ccc", fontWeight: 800, fontSize: 32 }}>RE</span>
                  </div>
                )}
                <h3 className="my-district-title">{myData.articles[0].title}</h3>
                {myData.articles[0].summary && (
                  <p className="my-district-summary">{myData.articles[0].summary}</p>
                )}
              </Link>
            </div>
            {/* Right: list of more articles */}
            <div className="my-district-list">
              {myData.articles.slice(1).map((a) => (
                <Link key={a.id} href={articleHref(a)} style={{ textDecoration: "none" }}>
                  <div className="my-district-item">
                    <span className="my-district-bullet" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span className="my-district-item-cat" style={{ background: a.category.color }}>{a.category.name}</span>
                      <p className="my-district-item-title">{a.title}</p>
                    </div>
                    {a.featuredImage && (
                      <img src={a.featuredImage} alt="" style={{ width: 70, height: 50, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} loading="lazy" />
                    )}
                  </div>
                </Link>
              ))}
              <Link href={`/${myData.district.slug}`} className="my-district-more">
                {myData.district.name} వార్తలు అన్నీ చూడండి &rarr;
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* === OTHER DISTRICTS: Compact grid === */}
      <div className="district-news-grid">
        {otherDistricts.map(({ district, articles }) => {
          const main = articles[0];
          const rest = articles.slice(1);

          return (
            <div key={district.slug} className="district-news-card">
              <Link href={`/${district.slug}`} style={{ textDecoration: "none" }}>
                <div className="district-news-header">
                  <span className="district-news-name">{district.name}</span>
                  <svg width="12" height="12" fill="none" stroke="var(--color-brand)" strokeWidth="2" viewBox="0 0 24 24" style={{ opacity: 0.5 }}><path d="M9 5l7 7-7 7"/></svg>
                </div>
              </Link>

              {main ? (
                <>
                  <Link href={articleHref(main)} style={{ textDecoration: "none" }}>
                    <div style={{ padding: "0 10px" }}>
                      {main.featuredImage ? (
                        <img src={main.featuredImage} alt="" style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover", borderRadius: 4, display: "block" }} loading="lazy" />
                      ) : (
                        <div style={{ width: "100%", aspectRatio: "16/10", background: "#f3f4f6", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ color: "#ccc", fontWeight: 800, fontSize: 20 }}>RE</span>
                        </div>
                      )}
                      <h3 className="district-news-title">{main.title}</h3>
                    </div>
                  </Link>
                  {rest.map((a) => (
                    <Link key={a.id} href={articleHref(a)} style={{ textDecoration: "none" }}>
                      <div className="district-news-item">
                        <span className="district-news-bullet" />
                        <span className="district-news-item-title">{a.title}</span>
                      </div>
                    </Link>
                  ))}
                </>
              ) : (
                <div style={{ padding: "20px 10px", textAlign: "center" }}>
                  <p style={{ fontSize: 12, color: "#aaa" }}>వార్తలు త్వరలో...</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        /* === MY DISTRICT FEATURED === */
        .my-district-featured, .district-news-grid {
          font-family: "Noto Sans Telugu", "Mandali", sans-serif;
        }
        .my-district-featured {
          background: #fff;
          border-radius: 10px;
          overflow: hidden;
          border: 2px solid var(--color-brand);
          margin-bottom: 10px;
        }
        .my-district-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          background: var(--color-brand);
          color: #fff;
          font-size: 15px;
          font-weight: 900;
        }
        .my-district-body {
          display: flex;
          gap: 16px;
          padding: 14px;
        }
        .my-district-main {
          flex: 0 0 45%;
        }
        .my-district-img {
          width: 100%;
          aspect-ratio: 16/10;
          object-fit: cover;
          border-radius: 6px;
          display: block;
        }
        .my-district-title {
          font-size: 16px;
          font-weight: 800;
          color: #111;
          line-height: 1.5;
          margin-top: 8px;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .my-district-title:hover { color: var(--color-brand); }
        .my-district-summary {
          font-size: 13px;
          color: #666;
          line-height: 1.6;
          margin-top: 4px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .my-district-list {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .my-district-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 6px 0;
          border-bottom: 1px solid #f5f5f5;
        }
        .my-district-item:hover .my-district-item-title { color: var(--color-brand); }
        .my-district-bullet {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--color-brand); margin-top: 8px; flex-shrink: 0;
        }
        .my-district-item-cat {
          display: inline-block;
          font-size: 9px; font-weight: 700; color: #fff;
          padding: 1px 6px; border-radius: 3px; margin-bottom: 2px;
        }
        .my-district-item-title {
          font-size: 13px; font-weight: 700; color: #222;
          line-height: 1.5;
          display: -webkit-box; -webkit-line-clamp: 2;
          -webkit-box-orient: vertical; overflow: hidden;
        }
        .my-district-more {
          display: block;
          text-align: center;
          padding: 8px;
          font-size: 13px;
          font-weight: 700;
          color: var(--color-brand);
          text-decoration: none;
          border-top: 1px solid #f0f0f0;
          margin-top: auto;
        }
        .my-district-more:hover { text-decoration: underline; }

        /* === OTHER DISTRICTS GRID === */
        .district-news-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .district-news-card {
          flex: 0 0 calc((100% - 24px) / 4);
          background: #fff;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid #eee;
          padding-bottom: 10px;
          transition: box-shadow 0.15s;
        }
        .district-news-card:hover {
          box-shadow: 0 2px 12px rgba(0,0,0,0.08);
        }
        .district-news-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 7px 10px;
          background: #f8f9fa;
          border-bottom: 2px solid var(--color-brand);
        }
        .district-news-name {
          font-size: 13px;
          font-weight: 900;
          color: var(--color-brand);
        }
        .district-news-title {
          font-size: 13px;
          font-weight: 700;
          color: #222;
          line-height: 1.5;
          margin-top: 6px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .district-news-card:hover .district-news-title {
          color: var(--color-brand);
        }
        .district-news-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 4px 10px;
        }
        .district-news-bullet {
          width: 5px; height: 5px; border-radius: 50%;
          background: #ccc; margin-top: 7px; flex-shrink: 0;
        }
        .district-news-item:hover .district-news-bullet { background: var(--color-brand); }
        .district-news-item-title {
          font-size: 12px; font-weight: 600; color: #555;
          line-height: 1.5;
          display: -webkit-box; -webkit-line-clamp: 2;
          -webkit-box-orient: vertical; overflow: hidden;
        }
        .district-news-item:hover .district-news-item-title { color: var(--color-brand); }

        /* Mobile */
        @media (max-width: 768px) {
          .my-district-body { flex-direction: column; gap: 10px; }
          .my-district-main { flex: none; }
          .district-news-card { flex: 0 0 calc((100% - 8px) / 2); }
        }
        @media (max-width: 480px) {
          .district-news-card { flex: 0 0 100%; }
        }
      `}</style>
    </div>
  );
}
