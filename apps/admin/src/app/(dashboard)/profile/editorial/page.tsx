import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { EditShell } from "../_components/edit-shell";
import { EditorialForm } from "./editorial-form";

export default async function EditorialEditPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  if (!userId) redirect("/login");
  if (role === "REPORTER") redirect("/reporter/profile");

  const data = await prisma.user.findUnique({
    where: { id: userId },
    select: { yearsExperience: true },
  });
  if (!data) redirect("/login");

  return (
    <EditShell
      title="Editorial"
      subtitle="Years of journalism experience. Feeds the Person JSON-LD on your author page."
    >
      <EditorialForm initialYears={data.yearsExperience ?? null} />
    </EditShell>
  );
}
