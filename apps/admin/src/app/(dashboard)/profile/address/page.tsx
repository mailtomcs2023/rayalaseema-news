import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { EditShell } from "../_components/edit-shell";
import { AddressForm } from "./address-form";

export default async function AddressEditPage() {
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
          address: true,
          city: true,
          pincode: true,
          primaryDistrict: true,
        },
      },
    },
  });
  if (!user) redirect("/login");
  const p = user.reporterProfile;

  return (
    <EditShell
      title="Address"
      subtitle="Where you're based. Pincode auto-fills district + city when it's in Rayalaseema."
    >
      <AddressForm
        initial={{
          address: p?.address ?? "",
          city: p?.city ?? "",
          pincode: p?.pincode ?? "",
          primaryDistrict: p?.primaryDistrict ?? "",
        }}
      />
    </EditShell>
  );
}
