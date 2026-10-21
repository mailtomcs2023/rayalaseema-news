import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ReporterEditShell } from "../_components/edit-shell";
import { SelfServiceCard } from "@/components/press-card/self-service-card";

export default async function ReporterPressCardPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  if (!userId) redirect("/login");
  if (role !== "REPORTER") redirect("/");

  return (
    <ReporterEditShell title="Press ID card">
      <SelfServiceCard userId={userId} kycHref="/reporter/profile/kyc" />
    </ReporterEditShell>
  );
}
