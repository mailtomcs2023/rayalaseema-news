import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { decryptProfileFields } from "@/lib/crypto/kyc";
import { ReporterEditShell } from "../_components/edit-shell";
import { AddressForm } from "./address-form";

export default async function ReporterAddressEditPage() {
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
          address: true,
          city: true,
          pincode: true,
          primaryDistrict: true,
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
      field: { in: ["address", "city", "pincode", "primaryDistrict"] },
    },
    select: { field: true, newValue: true },
  });
  const pendingByField = Object.fromEntries(
    pending.map((r) => [r.field, r.newValue]),
  );

  return (
    <ReporterEditShell
      title="Address"
      subtitle="Edits go to the admin for approval. The current value stays live until approved."
    >
      <AddressForm
        initial={{
          address: p.address ?? "",
          city: p.city ?? "",
          pincode: p.pincode ?? "",
          primaryDistrict: p.primaryDistrict ?? "",
        }}
        pendingByField={pendingByField}
      />
    </ReporterEditShell>
  );
}
