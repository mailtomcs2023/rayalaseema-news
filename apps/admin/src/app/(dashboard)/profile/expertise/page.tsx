import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { EditShell } from "../_components/edit-shell";
import { ChipEditor } from "../_components/chip-editor";

export default async function ExpertiseEditPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  if (!userId) redirect("/login");
  if (role === "REPORTER") redirect("/reporter/profile");

  const data = await prisma.user.findUnique({
    where: { id: userId },
    select: { expertise: true },
  });
  if (!data) redirect("/login");

  return (
    <EditShell
      title="Expertise"
      subtitle="Topics you cover. Surfaced on your author page and in Person JSON-LD."
    >
      <ChipEditor
        initial={(data.expertise ?? []).filter(Boolean)}
        field="expertise"
        inputLabel="Add an expertise area"
        inputPlaceholder="e.g. Politics, Cricket, State budget"
      />
    </EditShell>
  );
}
