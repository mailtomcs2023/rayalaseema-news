import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { ReporterEditShell } from "../_components/edit-shell";
import { PhoneForm } from "./phone-form";

export default async function ReporterPhoneEditPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  if (!userId) redirect("/login");
  if (role !== "REPORTER") redirect("/profile");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true, reporterProfile: { select: { id: true } } },
  });
  if (!user?.reporterProfile) redirect("/reporter/profile");

  const pending = await prisma.profileUpdateRequest.findFirst({
    where: {
      reporterProfileId: user.reporterProfile.id,
      status: "PENDING",
      field: "phone",
    },
    select: { newValue: true },
  });

  return (
    <ReporterEditShell
      title="Phone"
      subtitle="Edits go to the admin for approval. The current value stays live until approved."
    >
      <PhoneForm
        initialPhone={user.phone ?? ""}
        pendingPhone={pending?.newValue ?? null}
      />
    </ReporterEditShell>
  );
}
