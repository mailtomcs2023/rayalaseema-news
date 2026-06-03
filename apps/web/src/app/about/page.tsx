import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/footer";

export const metadata = { title: "మా గురించి | Rayalaseema News" };

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 16px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: "#111" }}>మా గురించి</h1>
        <p style={{ fontSize: 16, color: "#888", marginBottom: 32 }}>About Rayalaseema News</p>
        <div className="article-body" style={{ fontSize: 16, lineHeight: 2, color: "#333" }}>
          <p><strong>రాయలసీమ న్యూస్</strong> రాయలసీమ ప్రాంతం నుండి నమ్మకమైన, నిష్పక్షపాతమైన వార్తలు అందించడం మా లక్ష్యం.</p>

          <p>కర్నూలు, నంద్యాల, అనంతపురం, శ్రీ సత్యసాయి, వై.యస్.ఆర్ కడప, తిరుపతి, అన్నమయ్య, చిత్తూరు జిల్లాల వార్తలు, రాజకీయాలు, క్రీడలు, వ్యాపారం, వ్యవసాయం, విద్య మరియు మరిన్ని విభాగాల్లో తాజా సమాచారం అందిస్తున్నాము.</p>

          <h2>మా దృష్టి</h2>
          <p>రాయలసీమ ప్రాంతానికి అంకితమైన డిజిటల్ వార్తా వేదికగా, ప్రతి మండలం, ప్రతి జిల్లా నుండి వార్తలు అందించడం మా ధ్యేయం. గ్రామీణ ప్రాంతాల నుండి పట్టణాల వరకు, ప్రతి ఒక్కరి గొంతుక వినిపించేలా చేయడం మా ప్రయత్నం.</p>

          <h2>Our Mission</h2>
          <p>Rayalaseema News is dedicated to delivering trustworthy, unbiased news from the Rayalaseema region of Andhra Pradesh. We cover 8 districts with hyper-local coverage down to the mandal level.</p>

          <h2>సంప్రదించండి</h2>
          <p>Email: <a href="mailto:editor@rayalaseemanews.com">editor@rayalaseemanews.com</a></p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
