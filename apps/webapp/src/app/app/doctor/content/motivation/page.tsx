import Link from "next/link";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { PageSection } from "@/components/common/layout/PageSection";
import { buttonVariants } from "@/components/ui/button-variants";
import { env } from "@/config/env";
import { getPool } from "@/infra/db/client";
import { cn } from "@/lib/utils";
import { AppShell } from "@/shared/ui/AppShell";
import { MotivationListClient, type QuoteRow } from "../news/MotivationListClient";

export default async function DoctorContentMotivationPage() {
  const session = await requireDoctorAccess();
  let quoteRows: QuoteRow[] = [];
  if (env.DATABASE_URL) {
    try {
      const pool = getPool();
      const r = await pool.query<{
        id: string;
        body_text: string;
        author: string | null;
        is_active: boolean;
        sort_order: number;
        archived_at: Date | null;
      }>(
        `SELECT id::text, body_text, author, is_active, sort_order, archived_at
         FROM motivational_quotes
         ORDER BY sort_order ASC, created_at ASC`,
      );
      quoteRows = r.rows.map((row) => ({
        id: row.id,
        body_text: row.body_text,
        author: row.author,
        is_active: row.is_active,
        sort_order: row.sort_order,
        archived_at: row.archived_at,
      }));
    } catch {
      /* empty */
    }
  }

  return (
    <AppShell title="Мотивация" user={session.user} variant="doctor" backHref="/app/doctor/content">
      <PageSection id="doctor-content-motivation" as="section" className="flex flex-col gap-6">
        <div className="flex w-full flex-wrap gap-2">
          <Link href="/app/doctor/content" className={cn(buttonVariants({ variant: "outline", size: "default" }), "flex-1 basis-0 justify-center sm:flex-none")}>
            Все страницы контента
          </Link>
          <Link href="/app/doctor/content/news" className={cn(buttonVariants({ variant: "outline", size: "default" }), "flex-1 basis-0 justify-center sm:flex-none")}>
            Новости
          </Link>
        </div>
        <MotivationListClient quoteRows={quoteRows} />
      </PageSection>
    </AppShell>
  );
}
