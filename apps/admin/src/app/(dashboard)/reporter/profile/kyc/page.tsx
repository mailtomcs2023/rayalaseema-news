import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { decryptProfileFields } from "@/lib/crypto/kyc";
import { ReporterEditShell } from "../_components/edit-shell";
import { KycForm } from "./kyc-form";

export default async function ReporterKycEditPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  if (!userId) redirect("/login");
  if (role !== "REPORTER") redirect("/profile");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      reporterProfile: {
        select: {
          id: true,
          aadhaarNumber: true,
          panNumber: true,
          kycStatus: true,
        },
      },
    },
  });
  if (!user?.reporterProfile) redirect("/reporter/profile");
  const p = decryptProfileFields(user.reporterProfile);

  const pending = await prisma.profileUpdateRequest.findMany({
    where: {
      reporterProfileId: user.reporterProfile.id,
      status: "PENDING",
      field: { in: ["aadhaarNumber", "panNumber"] },
    },
    select: { field: true, newValue: true },
  });
  const pendingByField = Object.fromEntries(
    pending.map((r) => [r.field, r.newValue]),
  );

  return (
    <ReporterEditShell
      title="KYC documents"
      subtitle="Aadhaar and PAN numbers. Document photos must be uploaded from the mobile app."
    >
      <KycForm
        initial={{
          aadhaarNumber: p.aadhaarNumber ?? "",
          panNumber: p.panNumber ?? "",
        }}
        pendingByField={pendingByField}
        kycStatus={user.reporterProfile.kycStatus}
      />
    </ReporterEditShell>
  );
}
