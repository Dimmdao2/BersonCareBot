import Link from "next/link";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { PageSection } from "@/components/common/layout/PageSection";
import { buttonVariants } from "@/components/ui/button-variants";
import { env } from "@/config/env";
import { getPool } from "@/infra/db/client";
import { cn } from "@/lib/utils";
import { AppShell } from "@/shared/ui/AppShell";
import { NewsListClient, type NewsRow } from "./NewsListClient";

export default async function DoctorContentNewsPage() {
  const session = await requireDoctorAccess();
  let newsRows: NewsRow[] = [];
  if (env.DATABASE_URL) {
    try {
      const pool = getPool();
      const r = await pool.query<{
        id: string;
        title: string;
        body_md: string;
        is_visible: boolean;
        sort_order: number;
        archived_at: Date | null;
      }>(
        `SELECT id::text, title, body_md, is_visible, sort_order, archived_at
         FROM news_items
         ORDER BY sort_order ASC, created_at ASC`,
      );
      newsRows = r.rows.map((row) => ({
        id: row.id,
        title: row.title,
        body_md: row.body_md,
        is_visible: row.is_visible,
        sort_order: row.sort_order,
        archived_at: row.archived_at,
      }));
    } catch {
      /* empty */
    }
  }

  return (
    <AppShell title="Новости" user={session.user} variant="doctor" backHref="/app/doctor/content">
      <PageSection id="doctor-content-news" as="section" className="flex flex-col gap-6">
        <div className="flex w-full flex-wrap gap-2">
          <Link href="/app/doctor/content" className={cn(buttonVariants({ variant: "outline", size: "default" }), "flex-1 basis-0 justify-center sm:flex-none")}>
            Все страницы контента
          </Link>
          <Link href="/app/doctor/content/motivation" className={cn(buttonVariants({ variant: "outline", size: "default" }), "flex-1 basis-0 justify-center sm:flex-none")}>
            Мотивация
          </Link>
        </div>
        <NewsListClient newsRows={newsRows} />
      </PageSection>
    </AppShell>
  );
}
