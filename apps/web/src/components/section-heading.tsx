import type { LucideIcon } from "lucide-react";
import {
  Landmark, Trophy, Clapperboard, Briefcase, Flag, Globe, ShieldAlert,
  Cpu, HeartPulse, GraduationCap, Sprout, Newspaper, MapPin, Video,
  BookOpen, Images, Sparkles, Building2,
} from "lucide-react";
import Link from "next/link";

// Pick a lucide icon for a section by its category/district slug. Falls back to
// Newspaper. Extend the map as new sections appear.
const ICON_BY_SLUG: Record<string, LucideIcon> = {
  politics: Landmark,
  sports: Trophy,
  cricket: Trophy,
  ipl: Trophy,
  entertainment: Clapperboard,
  "movie-reviews": Clapperboard,
  tollywood: Clapperboard,
  bollywood: Clapperboard,
  hollywood: Clapperboard,
  business: Briefcase,
  national: Flag,
  "andhra-pradesh": Flag,
  telangana: Flag,
  international: Globe,
  crime: ShieldAlert,
  technology: Cpu,
  health: HeartPulse,
  education: GraduationCap,
  agriculture: Sprout,
  "district-news": MapPin,
  videos: Video,
  "web-stories": BookOpen,
  gallery: Images,
  devotional: Sparkles,
  "real-estate": Building2,
};

export function sectionIcon(slug?: string | null): LucideIcon {
  return (slug && ICON_BY_SLUG[slug]) || Newspaper;
}

// Reusable Eenadu-style ribbon section heading: a brand-red banner with a
// lucide icon + Telugu title and a folded ribbon tail on the right. Use it for
// every homepage section header so they all match.
//
//   <SectionHeading title="రాజకీయం" icon={Landmark} href="/politics" />
export function SectionHeading({
  title,
  icon: Icon,
  href,
}: {
  title: string;
  icon?: LucideIcon;
  href?: string;
}) {
  const inner = (
    <span className="sh-ribbon">
      {Icon ? <Icon className="sh-ribbon-ic" size={18} strokeWidth={2.4} aria-hidden="true" /> : null}
      <span className="sh-ribbon-tx">{title}</span>

      <style>{`
        .sh-ribbon {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: var(--brand, #E01B1B);
          color: #fff;
          padding: 9px 30px 9px 16px;
          font-family: var(--font-telugu-heading), sans-serif;
          font-weight: 800;
          font-size: 17px;
          line-height: 1;
          letter-spacing: 0.01em;
          border-radius: 4px 0 0 4px;
          /* pointed right edge - the ribbon "tag" tip */
          clip-path: polygon(0 0, calc(100% - 13px) 0, 100% 50%, calc(100% - 13px) 100%, 0 100%);
        }
        .sh-ribbon-ic { flex-shrink: 0; margin-top: -1px; }
        .sh-ribbon-tx { display: inline-block; padding-bottom: 2px; }
        /* folded-under tail behind the left edge → 3D ribbon depth */
        .sh-ribbon-wrap { position: relative; display: inline-block; }
        .sh-ribbon-wrap::before {
          content: "";
          position: absolute;
          left: 0;
          top: 100%;
          border-style: solid;
          border-width: 6px 7px 0 0;
          border-color: var(--brand-dark, #8E0F0F) transparent transparent transparent;
        }
        .sh-ribbon-link { text-decoration: none; display: inline-block; }
      `}</style>
    </span>
  );

  const ribbon = href ? (
    <Link href={href} className="sh-ribbon-link">{inner}</Link>
  ) : (
    inner
  );

  return <span className="sh-ribbon-wrap">{ribbon}</span>;
}
