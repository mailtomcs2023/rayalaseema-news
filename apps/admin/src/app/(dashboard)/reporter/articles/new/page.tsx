import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { ReporterShell } from "@/components/reporter/reporter-shell";
import { KycBanner } from "@/components/reporter/kyc-banner";
import { ArticleEditor } from "@/components/reporter/article-editor";

// New-article page for the reporter web portal. Mirrors the Expo
// NewArticleScreen (create mode). KYC is a HARD gate: unverified reporters
// are bounced back to /reporter so the KYC banner there nudges them to the
// upload screen. (Previously we let them draft and only blocked "Submit
// for Review" - too easy to miss the difference.)
export default async function NewReporterArticle() {
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
  const kycVerified = profile?.kycStatus === "VERIFIED";
  if (!kycVerified) redirect("/reporter");

  return (
    <ReporterShell kycStatus="VERIFIED">
      <div style={{ paddingTop: 16 }}>
        <KycBanner userId={userId} />
        <ArticleEditor kycVerified={kycVerified} />
      </div>
    </ReporterShell>
  );
}
