import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { decryptProfileFields } from "@/lib/crypto/kyc";
import { EditShell } from "../_components/edit-shell";
import { BankForm } from "./bank-form";

export default async function BankEditPage() {
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
          upiId: true,
          bankName: true,
          bankAccount: true,
          bankIfsc: true,
          bankBranch: true,
        },
      },
    },
  });
  if (!user) redirect("/login");
  const p = decryptProfileFields(user.reporterProfile);

  return (
    <EditShell
      title="Bank / payment"
      subtitle="Where payouts go. Double-check the account number and IFSC - mistakes here delay payment."
    >
      <BankForm
        initial={{
          upiId: p?.upiId ?? "",
          bankName: p?.bankName ?? "",
          bankAccount: p?.bankAccount ?? "",
          bankIfsc: p?.bankIfsc ?? "",
          bankBranch: p?.bankBranch ?? "",
        }}
      />
    </EditShell>
  );
}
