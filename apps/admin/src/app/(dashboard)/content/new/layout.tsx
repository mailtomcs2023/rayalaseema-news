// Server-side KYC guard for the create-content flow.
//
// The page itself is a client component (type-picker w/ inflight refs),
// so we sit this server-component layout next to it to enforce KYC on
// direct URL navigation. The in-app "+ New Article" / "+ New Content"
// CTAs are *also* gated client-side via <KycGatedLink> for instant
// feedback, but typing /content/new in the address bar bypasses that -
// this layer catches it.
//
// ADMIN bypasses. Non-ADMIN users whose kycStatus isn't VERIFIED get
// bounced back to /content with ?kyc=blocked, which the list page reads
// once to fire a red toast (matches the in-app gate's message exactly).

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";

export default async function NewContentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  const userId = (session?.user as any)?.id as string | undefined;

  if (userId && role && role !== "ADMIN") {
    const profile = await prisma.reporterProfile.findUnique({
      where: { userId },
      select: { kycStatus: true },
    });
    if (profile?.kycStatus !== "VERIFIED") {
      redirect("/content?kyc=blocked");
    }
  }

  return <>{children}</>;
}
