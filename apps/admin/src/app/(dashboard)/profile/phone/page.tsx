import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { EditShell } from "../_components/edit-shell";
import { PhoneForm } from "./phone-form";

export default async function PhoneEditPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  if (!userId) redirect("/login");
  if (role === "REPORTER") redirect("/reporter/profile");

  const data = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true },
  });
  if (!data) redirect("/login");

  return (
    <EditShell
      title="Phone"
      subtitle="Only the editorial team can see this. Used for desk-side coordination."
    >
      <PhoneForm initialPhone={data.phone ?? ""} />
    </EditShell>
  );
}
