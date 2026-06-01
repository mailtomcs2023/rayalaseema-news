import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { decryptProfileFields } from "@/lib/crypto/kyc";
import { ReporterEditShell } from "../_components/edit-shell";
import { BankForm } from "./bank-form";

export default async function ReporterBankEditPage() {
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
          upiId: true,
          bankName: true,
          bankAccount: true,
          bankIfsc: true,
          bankBranch: true,
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
      field: { in: ["upiId", "bankName", "bankAccount", "bankIfsc", "bankBranch"] },
    },
    select: { field: true, newValue: true },
  });
  const pendingByField = Object.fromEntries(
    pending.map((r) => [r.field, r.newValue]),
  );

  return (
    <ReporterEditShell
      title="Bank / payment"
      subtitle="Where your earnings are paid out. Bank edits delay the next payout until admin verifies."
    >
      <BankForm
        initial={{
          upiId: p.upiId ?? "",
          bankName: p.bankName ?? "",
          bankAccount: p.bankAccount ?? "",
          bankIfsc: p.bankIfsc ?? "",
          bankBranch: p.bankBranch ?? "",
        }}
        pendingByField={pendingByField}
      />
    </ReporterEditShell>
  );
}
