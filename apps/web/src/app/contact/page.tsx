import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/footer";

export const metadata = { title: "సంప్రదించండి | Rayalaseema News" };

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 16px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: "#111" }}>సంప్రదించండి</h1>
        <p style={{ fontSize: 16, color: "#888", marginBottom: 32 }}>Contact Us</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "#111" }}>Editorial</h3>
            <p style={{ fontSize: 14, color: "#555", lineHeight: 2 }}>
              Email: <a href="mailto:editor@rayalaseemanews.com" style={{ color: "var(--color-brand)" }}>editor@rayalaseemanews.com</a><br />
              News Tips: <a href="mailto:news@rayalaseemanews.com" style={{ color: "var(--color-brand)" }}>news@rayalaseemanews.com</a>
            </p>
          </div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "#111" }}>Advertising</h3>
            <p style={{ fontSize: 14, color: "#555", lineHeight: 2 }}>
              Email: <a href="mailto:ads@rayalaseemanews.com" style={{ color: "var(--color-brand)" }}>ads@rayalaseemanews.com</a><br />
              For ad rates and media kit
            </p>
          </div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "#111" }}>Grievance Officer</h3>
            <p style={{ fontSize: 14, color: "#555", lineHeight: 2 }}>
              As per IT Act, 2000<br />
              Email: <a href="mailto:grievance@rayalaseemanews.com" style={{ color: "var(--color-brand)" }}>grievance@rayalaseemanews.com</a><br />
              Response: Within 36 hours
            </p>
          </div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "#111" }}>General</h3>
            <p style={{ fontSize: 14, color: "#555", lineHeight: 2 }}>
              Email: <a href="mailto:info@rayalaseemanews.com" style={{ color: "var(--color-brand)" }}>info@rayalaseemanews.com</a><br />
              Andhra Pradesh, India
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
