"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Eye, EyeOff, AlertCircle, ShieldCheck, Pencil, ClipboardCheck, Newspaper } from "lucide-react";

// Demo-only quick-login cards. Each tap auto-fills + submits the credentials
// for a seeded test account so reviewers can flip between roles without
// retyping. Source of truth for these passwords is
// packages/db/scripts/seed-test-users.ts — keep in sync.
const DEMO_ROLES = [
  { key: "admin",     label: "Admin",      email: "admin@rayalaseemanews.com",     password: "admin123",     accent: "#dc2626", Icon: ShieldCheck    },
  { key: "editor",    label: "Editor",     email: "editor@rayalaseemanews.com",    password: "editor123",    accent: "#2563eb", Icon: Pencil         },
  { key: "subeditor", label: "Sub Editor", email: "subeditor@rayalaseemanews.com", password: "subeditor123", accent: "#7c3aed", Icon: ClipboardCheck },
  { key: "reporter",  label: "Reporter",   email: "reporter@rayalaseemanews.com",  password: "reporter123",  accent: "#16a34a", Icon: Newspaper      },
] as const;

// Mirrors the rules a NextAuth credentials provider can actually enforce. We
// don't validate password complexity at the client (admin passwords are set
// by other admins; the user typing here just needs to match an existing
// hash), but a non-empty value is required.
const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type FieldErrors = Partial<Record<keyof z.infer<typeof loginSchema>, string>>;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  // Clearing a field's error as soon as the user starts editing keeps the
  // form from feeling "stuck" after a failed validation.
  const clearFieldError = (field: keyof FieldErrors) => {
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  // Shared sign-in path used by both the form submit and the demo-role
  // cards. Centralising it means the demo buttons skip Zod (their values
  // are hardcoded + known-good) but still hit the same NextAuth + redirect
  // logic as a normal login.
  const signInWith = async (emailVal: string, passwordVal: string) => {
    setError("");
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email: emailVal,
        password: passwordVal,
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
      await signIn("credentials", { email: emailVal, password: passwordVal, callbackUrl: "/" });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Client-side validation. Field errors render under each input; the form
    // never reaches the network call when invalid.
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        email: flat.email?.[0],
        password: flat.password?.[0],
      });
      return;
    }
    setFieldErrors({});
    await signInWith(parsed.data.email, parsed.data.password);
  };

  // Click handler for a demo-role card. Mirrors the form fields so the user
  // sees which account they're being signed in as, then submits.
  const handleDemoLogin = async (role: (typeof DEMO_ROLES)[number]) => {
    setEmail(role.email);
    setPassword(role.password);
    setFieldErrors({});
    await signInWith(role.email, role.password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Rayalaseema News" className="h-12 mx-auto" />
          <CardTitle className="text-xl">Admin CMS</CardTitle>
          <CardDescription>Sign in to manage content</CardDescription>
        </CardHeader>

        <CardContent>
          {error ? (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle />
              <AlertTitle>Login failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {/* noValidate so the browser's native HTML5 popups don't fire
              before our Zod validation runs — keeps error UX consistent. */}
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearFieldError("email"); }}
                placeholder="Enter admin email id"
                autoComplete="email"
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
              />
              {fieldErrors.email ? (
                <p id="email-error" className="text-xs text-destructive">{fieldErrors.email}</p>
              ) : null}
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
                  onChange={(e) => { setPassword(e.target.value); clearFieldError("password"); }}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  className="pr-10"
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={fieldErrors.password ? "password-error" : undefined}
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
              {fieldErrors.password ? (
                <p id="password-error" className="text-xs text-destructive">{fieldErrors.password}</p>
              ) : null}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#FF2C2C] hover:bg-[#C81E1E] text-white"
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>

            {/* Quick demo login — one tap per role, auto-submits with the
                seeded test credentials. Only rendered in development so
                production never exposes the canned passwords. NODE_ENV is
                statically replaced by Next at build time, so the block is
                fully dead-code-eliminated from the prod bundle (not just
                hidden via CSS). */}
            {process.env.NODE_ENV !== "production" && (
              <div>
                <p className="text-[11px] text-muted-foreground text-center mb-2 uppercase tracking-wide">
                  Quick demo login
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {DEMO_ROLES.map((role) => {
                    const { Icon } = role;
                    return (
                      <Tooltip key={role.key}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => handleDemoLogin(role)}
                            className="group flex flex-col items-center justify-center gap-1 rounded-lg border bg-card px-2 py-3 text-xs font-medium transition-colors hover:border-foreground/40 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Icon className="size-4" style={{ color: role.accent }} />
                            <span className="leading-tight">{role.label}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="font-mono text-[11px] leading-snug">
                            <div>{role.email}</div>
                            <div className="opacity-70">{role.password}</div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
