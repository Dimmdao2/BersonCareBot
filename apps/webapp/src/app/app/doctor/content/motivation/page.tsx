import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { PageSection } from "@/components/common/layout/PageSection";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { AppShell } from "@/shared/ui/AppShell";
import { MotivationListClient, type QuoteRow } from "./MotivationListClient";

export default async function DoctorContentMotivationPage() {
  const session = await requireDoctorAccess();
  let quoteRows: QuoteRow[] = [];
  try {
    const deps = buildAppDeps();
    quoteRows = await deps.doctorMotivationQuotesEditor.listQuotesForEditor();
  } catch {
    /* empty: нет БД / ошибка чтения */
  }

  return (
    <AppShell title="Мотивация" user={session.user} variant="doctor" backHref="/app/doctor/content">
      <PageSection id="doctor-content-motivation" as="section" className="flex flex-col gap-4">
        <div className="flex w-full flex-wrap gap-2">
          <Link href="/app/doctor/content" className={cn(buttonVariants({ variant: "outline", size: "default" }), "flex-1 basis-0 justify-center sm:flex-none")}>
            Все страницы контента
          </Link>
        </div>
        <MotivationListClient quoteRows={quoteRows} />
      </PageSection>
    </AppShell>
  );
}
