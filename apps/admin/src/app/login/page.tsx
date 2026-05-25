"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
        // Middleware redirects to role-appropriate landing on the next page
        // load — REPORTER → /reporter-home, SUB_EDITOR → /review, etc.
        window.location.href = "/";
      } else {
        setError("Login failed. Try again.");
        setLoading(false);
      }
    } catch {
      // If signIn throws, fall back to the redirect-based flow.
      await signIn("credentials", { email, password, callbackUrl: "/" });
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f3f4f6",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 4px 24px rgba(0,0,0,0.1)",
          padding: "clamp(24px, 6vw, 40px)",
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src="/logo.png" alt="Rayalaseema Express" style={{ height: 48, margin: "0 auto" }} />
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#333", marginTop: 12 }}>Admin CMS</h1>
          <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>Sign in to manage content</p>
        </div>

        {/* Error */}
        {error ? (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 16,
              fontSize: 13,
              color: "#dc2626",
            }}
          >
            {error}
          </div>
        ) : null}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@rayalaseemaexpress.com"
              required
              autoComplete="email"
              className="h-10"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            {/* Relative wrapper so the eye toggle absolutely positions inside
                the input's right padding without breaking the shadcn Input. */}
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                autoComplete="current-password"
                className="h-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" disabled={loading} className="h-10 w-full bg-[#FF2C2C] hover:bg-[#C81E1E] text-white">
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        {/* Demo credentials */}
        <div
          style={{
            marginTop: 24,
            padding: "12px 14px",
            background: "#f9fafb",
            borderRadius: 8,
            fontSize: 12,
            color: "#888",
          }}
        >
          <p style={{ fontWeight: 700, color: "#666", marginBottom: 4 }}>Demo Credentials:</p>
          <p>Admin: admin@rayalaseemaexpress.com / admin123</p>
          <p>Editor: editor@rayalaseemaexpress.com / editor123</p>
        </div>
      </div>
    </div>
  );
}
