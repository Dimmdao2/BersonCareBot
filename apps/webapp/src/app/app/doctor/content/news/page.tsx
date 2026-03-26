import Link from "next/link";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { PageSection } from "@/components/common/layout/PageSection";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { env } from "@/config/env";
import { getPool } from "@/infra/db/client";
import { AppShell } from "@/shared/ui/AppShell";
import { NewsForms } from "./NewsForms";

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
  let quoteRows: {
    id: string;
    body_text: string;
    author: string | null;
    is_active: boolean;
    sort_order: number;
    archived_at: Date | null;
  }[] = [];

  if (env.DATABASE_URL) {
    try {
      const pool = getPool();
      const n = await pool.query(
        `SELECT id, title, body_md, is_visible, sort_order, archived_at FROM news_items ORDER BY sort_order DESC, created_at DESC`
      );
      newsRows = n.rows as typeof newsRows;
      const q = await pool.query(
        `SELECT id, body_text, author, is_active, sort_order, archived_at FROM motivational_quotes ORDER BY sort_order ASC, created_at ASC`
      );
      quoteRows = q.rows as typeof quoteRows;
    } catch {
      /* ignore */
    }
  }

  return (
    <AppShell title="Новости и мотивация" user={session.user} variant="doctor" backHref="/app/doctor/content">
      <PageSection as="section" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0">Новости и цитаты для главной пациента</h2>
          <Link href="/app/doctor/content" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            К списку страниц
          </Link>
        </div>
        {!env.DATABASE_URL ? (
          <p className="text-muted-foreground">Нужна база данных для управления новостями.</p>
        ) : (
          <NewsForms newsRows={newsRows} quoteRows={quoteRows} />
        )}
      </PageSection>
    </AppShell>
  );
}
