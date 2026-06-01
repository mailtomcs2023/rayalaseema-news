import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { EditShell } from "../_components/edit-shell";
import { PersonalForm } from "./personal-form";

// Personal info edit page for staff (ADMIN / EDITOR / SUB_EDITOR / USER).
// Combines a few User-row fields (name, bio) with the ReporterProfile-row
// fields that staff also fill via the onboarding KYC wizard. We surface
// them all together so the user sees "personal" as one tab, even though
// the data lives in two tables and saves go to two endpoints.

export default async function PersonalInfoEditPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  if (!userId) redirect("/login");
  if (role === "REPORTER") redirect("/reporter/profile");

  const data = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      bio: true,
      yearsExperience: true,
      reporterProfile: {
        select: {
          fatherName: true,
          dateOfBirth: true,
          gender: true,
          experience: true,
          specialization: true,
        },
      },
    },
  });
  if (!data) redirect("/login");

  const p = data.reporterProfile;

  return (
    <EditShell
      title="Personal info"
      subtitle="Your display name, bio, and identity details. These appear on your author page and feed the company-internal directory."
    >
      <PersonalForm
        initial={{
          name: data.name ?? "",
          bio: data.bio ?? "",
          fatherName: p?.fatherName ?? "",
          dateOfBirth: p?.dateOfBirth
            ? new Date(p.dateOfBirth).toISOString().slice(0, 10)
            : "",
          gender: p?.gender ?? "",
          yearsExperience: data.yearsExperience,
          experience: p?.experience ?? "",
          specialization: p?.specialization ?? "",
        }}
      />
    </EditShell>
  );
}
