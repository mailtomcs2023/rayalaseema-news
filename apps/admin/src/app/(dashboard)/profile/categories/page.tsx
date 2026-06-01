import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { EditShell } from "../_components/edit-shell";
import { CategoriesForm } from "./categories-form";

export default async function CategoriesEditPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  if (!userId) redirect("/login");
  if (role === "REPORTER") redirect("/reporter/profile");

  const [user, allCategories] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        assignedCategories: { select: { categoryId: true } },
      },
    }),
    prisma.category.findMany({
      where: { active: true },
      select: { id: true, name: true, nameEn: true, color: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  if (!user) redirect("/login");

  const selectedIds = user.assignedCategories.map((a) => a.categoryId);

  return (
    <EditShell
      title="Assigned categories"
      subtitle="Sub-editors are pooled into a review queue for the categories they own. Articles in these categories will route to you."
    >
      <CategoriesForm
        initialIds={selectedIds}
        categories={allCategories.map((c) => ({
          id: c.id,
          label: c.nameEn || c.name,
          subLabel: c.nameEn && c.name !== c.nameEn ? c.name : undefined,
          color: c.color || "#888",
        }))}
      />
    </EditShell>
  );
}
