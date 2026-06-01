import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { EditShell } from "../_components/edit-shell";
import { SocialForm } from "./social-form";

export default async function SocialEditPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  if (!userId) redirect("/login");
  if (role === "REPORTER") redirect("/reporter/profile");

  const data = await prisma.user.findUnique({
    where: { id: userId },
    select: { twitterHandle: true, linkedinUrl: true, facebookUrl: true },
  });
  if (!data) redirect("/login");

  return (
    <EditShell
      title="Social profiles"
      subtitle="Public links shown on your author page. Drive sameAs entries in Person JSON-LD."
    >
      <SocialForm
        initialTwitter={data.twitterHandle ?? ""}
        initialLinkedin={data.linkedinUrl ?? ""}
        initialFacebook={data.facebookUrl ?? ""}
      />
    </EditShell>
  );
}
