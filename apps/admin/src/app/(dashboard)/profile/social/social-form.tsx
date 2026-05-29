"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const URL_RE = /^https?:\/\/.+/i;

export function SocialForm({
  initialTwitter,
  initialLinkedin,
  initialFacebook,
}: {
  initialTwitter: string;
  initialLinkedin: string;
  initialFacebook: string;
}) {
  const router = useRouter();
  const [twitter, setTwitter] = useState(initialTwitter);
  const [linkedin, setLinkedin] = useState(initialLinkedin);
  const [facebook, setFacebook] = useState(initialFacebook);
  const [busy, setBusy] = useState(false);

  const liInvalid = linkedin.trim() !== "" && !URL_RE.test(linkedin.trim());
  const fbInvalid = facebook.trim() !== "" && !URL_RE.test(facebook.trim());
  const dirty =
    twitter.trim() !== initialTwitter.trim() ||
    linkedin.trim() !== initialLinkedin.trim() ||
    facebook.trim() !== initialFacebook.trim();

  const save = async () => {
    if (liInvalid || fbInvalid) {
      toast.error("URLs must start with http:// or https://");
      return;
    }
    setBusy(true);
    try {
      const cleanTwitter = twitter.trim().replace(/^@/, "");
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          twitterHandle: cleanTwitter || null,
          linkedinUrl: linkedin.trim() || null,
          facebookUrl: facebook.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || `Save failed (HTTP ${res.status})`);
        return;
      }
      toast.success("Social profiles updated.");
      router.push("/profile");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Label htmlFor="sf-twitter" className="text-xs">
          Twitter / X handle
        </Label>
        <Input
          id="sf-twitter"
          value={twitter}
          onChange={(e) => setTwitter(e.target.value)}
          disabled={busy}
          className="mt-1"
          placeholder="username (without @)"
          maxLength={40}
        />
      </div>
      <div>
        <Label htmlFor="sf-linkedin" className="text-xs">
          LinkedIn URL
        </Label>
        <Input
          id="sf-linkedin"
          value={linkedin}
          onChange={(e) => setLinkedin(e.target.value)}
          disabled={busy}
          className="mt-1"
          placeholder="https://linkedin.com/in/your-handle"
          maxLength={300}
        />
        {liInvalid && (
          <p className="mt-1 text-xs text-destructive">
            Must start with http:// or https://
          </p>
        )}
      </div>
      <div>
        <Label htmlFor="sf-facebook" className="text-xs">
          Facebook URL
        </Label>
        <Input
          id="sf-facebook"
          value={facebook}
          onChange={(e) => setFacebook(e.target.value)}
          disabled={busy}
          className="mt-1"
          placeholder="https://facebook.com/your.page"
          maxLength={300}
        />
        {fbInvalid && (
          <p className="mt-1 text-xs text-destructive">
            Must start with http:// or https://
          </p>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="outline" onClick={() => router.push("/profile")} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={save}
          disabled={busy || liInvalid || fbInvalid || !dirty}
        >
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
