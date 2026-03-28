import Link from "next/link";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { PageSection } from "@/components/common/layout/PageSection";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { env } from "@/config/env";
import { getPool } from "@/infra/db/client";
import { AppShell } from "@/shared/ui/AppShell";
import { NewsListClient } from "./NewsListClient";

export default async function DoctorContentNewsPage() {
  const session = await requireDoctorAccess();

  let newsRows: {
    id: string;
    title: string;
    body_md: string;
    is_visible: boolean;
    sort_order: number;
    archived_at: Date | null;
  }[] = [];

  if (env.DATABASE_URL) {
    try {
      const pool = getPool();
      const n = await pool.query(
        `SELECT id, title, body_md, is_visible, sort_order, archived_at FROM news_items ORDER BY sort_order DESC, created_at DESC`,
      );
      newsRows = n.rows as typeof newsRows;
    } catch {
      /* ignore */
    }
  }

  return (
    <AppShell title="Новости" user={session.user} variant="doctor" backHref="/app/doctor/content">
      <PageSection as="section" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-lg font-semibold">Новости для главной пациента</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/app/doctor/content/motivation" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Мотивация
            </Link>
            <Link href="/app/doctor/content" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              К списку страниц
            </Link>
          </div>
        </div>
        {!env.DATABASE_URL ? (
          <p className="text-muted-foreground">Нужна база данных для управления новостями.</p>
        ) : (
          <NewsListClient newsRows={newsRows} />
        )}
      </PageSection>
    </AppShell>
  );
}
