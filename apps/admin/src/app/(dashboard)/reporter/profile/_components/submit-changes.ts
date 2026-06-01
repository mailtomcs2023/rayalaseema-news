import { toast } from "sonner";

// Submits a batch of dirty fields to the reporter request-change API one
// at a time (the endpoint accepts a single field per POST). Returns a
// summary so the form can route the user back / show field-level errors.
//
// KYC-critical fields (aadhaarNumber, panNumber, etc.) flip kycStatus from
// VERIFIED → SUBMITTED on submission - the API handles that side effect.

export type FieldChange = { field: string; value: unknown; label?: string };

export type SubmitResult = {
  ok: boolean;
  successCount: number;
  failures: { field: string; label?: string; error: string }[];
  kycPaused: boolean;
};

export async function submitProfileChanges(
  changes: FieldChange[],
): Promise<SubmitResult> {
  const failures: SubmitResult["failures"] = [];
  let successCount = 0;
  let kycPaused = false;

  for (const c of changes) {
    try {
      const res = await fetch("/api/reporter/profile/request-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: c.field, value: c.value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        failures.push({
          field: c.field,
          label: c.label,
          error: data.error || `HTTP ${res.status}`,
        });
        continue;
      }
      successCount += 1;
      if (data.kycPaused) kycPaused = true;
    } catch (e) {
      failures.push({
        field: c.field,
        label: c.label,
        error: e instanceof Error ? e.message : "Network error",
      });
    }
  }

  const ok = failures.length === 0;

  if (ok) {
    toast.success(
      successCount === 1
        ? "Change request submitted for admin review."
        : `${successCount} change requests submitted for admin review.`,
      kycPaused
        ? {
            description:
              "KYC paused until admin verifies your update. You can still write articles.",
          }
        : undefined,
    );
  } else if (successCount > 0) {
    toast.warning(
      `${successCount} saved, ${failures.length} failed`,
      {
        description: failures
          .map((f) => `${f.label || f.field}: ${f.error}`)
          .join(" · "),
      },
    );
  } else {
    toast.error(failures[0]?.error || "Save failed.", {
      description:
        failures.length > 1
          ? `${failures.length} fields failed.`
          : undefined,
    });
  }

  return { ok, successCount, failures, kycPaused };
}
