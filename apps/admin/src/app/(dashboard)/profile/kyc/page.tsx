import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { decryptProfileFields } from "@/lib/crypto/kyc";
import { EditShell } from "../_components/edit-shell";
import { KycForm } from "./kyc-form";

export default async function KycEditPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  if (!userId) redirect("/login");
  if (role === "REPORTER") redirect("/reporter/profile");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      reporterProfile: {
        select: {
          aadhaarNumber: true,
          panNumber: true,
          aadhaarFrontUrl: true,
          aadhaarBackUrl: true,
          panCardUrl: true,
          photoUrl: true,
          kycStatus: true,
          kycRejectionNote: true,
        },
      },
    },
  });
  if (!user) redirect("/login");
  const p = decryptProfileFields(user.reporterProfile);

  return (
    <EditShell
      title="KYC documents"
      subtitle="Aadhaar + PAN numbers and document photos. Used to verify your identity for byline + payment."
    >
      <KycForm
        initial={{
          aadhaarNumber: p?.aadhaarNumber ?? "",
          panNumber: p?.panNumber ?? "",
          photoUrl: p?.photoUrl ?? "",
          aadhaarFrontUrl: p?.aadhaarFrontUrl ?? "",
          aadhaarBackUrl: p?.aadhaarBackUrl ?? "",
          panCardUrl: p?.panCardUrl ?? "",
        }}
        kycStatus={p?.kycStatus ?? "PENDING"}
        kycRejectionNote={p?.kycRejectionNote ?? null}
      />
    </EditShell>
  );
}
