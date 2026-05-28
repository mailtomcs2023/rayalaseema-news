// /reporter/earnings - web mirror of the mobile EarningsScreen.
// Three lifecycle tabs (Pending / Approved / Settled) + per-category
// breakdown. Same shape as /api/reporter/earnings but server-rendered
// using session auth (the API is bearer-token based for the Expo app).

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { ReporterShell } from "@/components/reporter/reporter-shell";
import { KycBanner } from "@/components/reporter/kyc-banner";
import { ReporterEarningsClient } from "@/components/reporter/earnings-client";

export default async function ReporterEarningsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = (session.user as any).id as string | undefined;
  const role = (session.user as any).role as string | undefined;
  if (role && role !== "REPORTER") redirect("/");
  if (!userId) redirect("/login");

  const profile = await prisma.reporterProfile.findUnique({
    where: { userId },
    select: { kycStatus: true },
  });
  const locked = !profile || profile.kycStatus !== "VERIFIED";

  // Same query the API does, with the same status filter. Include CANCELLED
  // so the reporter sees the full lifecycle of every payment (and the
  // rejection note attached to a cancelled one). PROCESSING + DISPUTED
  // unused in v1.
  const rows = locked
    ? []
    : await prisma.contentPayment.findMany({
        where: {
          journalistId: userId,
          status: { in: ["CALCULATED", "APPROVED", "PAID", "CANCELLED"] },
        },
        include: {
          content: {
            select: {
              id: true,
              title: true,
              slug: true,
              rejectionNote: true,
              category: { select: { name: true, nameEn: true, slug: true, color: true } },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      });

  // Serialize for the client component (Date → ISO string).
  const payments = rows.map((p) => ({
    id: p.id,
    amount: p.totalAmount,
    currency: p.currency,
    status: p.status as "CALCULATED" | "APPROVED" | "PAID" | "CANCELLED",
    createdAt: p.createdAt.toISOString(),
    approvedAt: p.approvedAt?.toISOString() ?? null,
    paidAt: p.paidAt?.toISOString() ?? null,
    paymentMethod: p.paymentMethod ?? null,
    transactionId: p.transactionId ?? null,
    note: p.note ?? null,
    rejectionNote: p.content.rejectionNote ?? null,
    article: {
      id: p.content.id,
      title: p.content.title,
      slug: p.content.slug,
      // Category.nameEn is nullable in the schema; fall back to the Telugu
      // `name` so the client always gets a non-null display string.
      category: p.content.category
        ? {
            slug: p.content.category.slug,
            name: p.content.category.name,
            nameEn: p.content.category.nameEn ?? p.content.category.name,
            color: p.content.category.color ?? null,
          }
        : null,
    },
  }));

  return (
    <ReporterShell>
      <div style={{ paddingTop: 16 }}>
        <KycBanner userId={userId} />
        <ReporterEarningsClient payments={payments} locked={locked} />
      </div>
    </ReporterShell>
  );
}
