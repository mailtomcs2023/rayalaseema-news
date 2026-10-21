import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { EditShell } from "../_components/edit-shell";
import { SelfServiceCard } from "@/components/press-card/self-service-card";

export default async function StaffPressCardPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  if (!userId) redirect("/login");
  if (role === "REPORTER") redirect("/reporter/profile/press-card");

  return (
    <EditShell
      title="Press ID card"
      subtitle="Issued by an admin or editor. Download the PDF or check your card's status here."
    >
      <SelfServiceCard userId={userId} kycHref="/profile/kyc" />
    </EditShell>
  );
}
