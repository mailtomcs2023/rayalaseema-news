"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: "/",
      });

      if (result?.error) {
        setError("Invalid email or password");
        setLoading(false);
      } else if (result?.ok) {
        window.location.href = "/";
      } else {
        setError("Login failed. Try again.");
        setLoading(false);
      }
    } catch {
      // If signIn throws, try direct redirect approach
      await signIn("credentials", {
        email,
        password,
        callbackUrl: "/",
      });
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 400, background: "#fff", borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.1)", padding: "clamp(24px, 6vw, 40px)" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src="/logo.svg" alt="Rayalaseema Express" style={{ height: 48, margin: "0 auto" }} />
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#333", marginTop: 12 }}>Admin CMS</h1>
          <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>Sign in to manage content</p>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#dc2626" }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 6 }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@rayalaseemaexpress.com"
              required
              style={{ width: "100%", padding: "10px 14px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box" }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 6 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              style={{ width: "100%", padding: "10px 14px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box" }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", padding: "12px", background: loading ? "#999" : "#FF2C2C", color: "#fff",
              border: "none", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {/* Demo credentials */}
        <div style={{ marginTop: 24, padding: "12px 14px", background: "#f9fafb", borderRadius: 8, fontSize: 12, color: "#888" }}>
          <p style={{ fontWeight: 700, color: "#666", marginBottom: 4 }}>Demo Credentials:</p>
          <p>Admin: admin@rayalaseemaexpress.com / admin123</p>
          <p>Editor: editor@rayalaseemaexpress.com / editor123</p>
        </div>
      </div>
    </div>
  );
}
