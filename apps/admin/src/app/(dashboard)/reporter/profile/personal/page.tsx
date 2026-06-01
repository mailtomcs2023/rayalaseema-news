import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { decryptProfileFields } from "@/lib/crypto/kyc";
import { ReporterEditShell } from "../_components/edit-shell";
import { PersonalForm } from "./personal-form";

export default async function ReporterPersonalEditPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  if (!userId) redirect("/login");
  if (role !== "REPORTER") redirect("/profile");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      reporterProfile: {
        select: {
          id: true,
          fatherName: true,
          gender: true,
          dateOfBirth: true,
          specialization: true,
        },
      },
    },
  });
  if (!user?.reporterProfile) redirect("/reporter/profile");
  const p = decryptProfileFields(user.reporterProfile);

  // Pending requests for the fields on this page - surface them so the
  // reporter can see what's already under admin review.
  const pending = await prisma.profileUpdateRequest.findMany({
    where: {
      reporterProfileId: user.reporterProfile.id,
      status: "PENDING",
      field: { in: ["fatherName", "gender", "dateOfBirth", "specialization"] },
    },
    select: { field: true, newValue: true },
  });
  const pendingByField = Object.fromEntries(
    pending.map((r) => [r.field, r.newValue]),
  );

  return (
    <ReporterEditShell
      title="Personal info"
      subtitle="Edits go to the admin for approval. The current value stays live until approved."
    >
      <PersonalForm
        initial={{
          fatherName: p.fatherName ?? "",
          gender: p.gender ?? "",
          dateOfBirth: p.dateOfBirth
            ? new Date(p.dateOfBirth).toISOString().slice(0, 10)
            : "",
          specialization: p.specialization ?? "",
        }}
        pendingByField={pendingByField}
      />
    </ReporterEditShell>
  );
}
