import Link from "next/link";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import type { TemplateStatus } from "@/modules/lfk-templates/types";
import { LfkTemplatesPageClient } from "./LfkTemplatesPageClient";

type PageProps = {
  searchParams?: Promise<{ status?: string }>;
};

export default async function DoctorLfkTemplatesPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const sp = (await searchParams) ?? {};
  const statusRaw = sp.status;
  const status: TemplateStatus | undefined =
    statusRaw === "draft" || statusRaw === "published" || statusRaw === "archived" ? statusRaw : undefined;

  const deps = buildAppDeps();
  const list = await deps.lfkTemplates.listTemplates({
    status: status ?? null,
    includeExerciseDetails: true,
  });

  return (
    <AppShell title="Шаблоны ЛФК" user={session.user} variant="doctor" backHref="/app/doctor">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <form method="get" className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Статус:</span>
            <select
              name="status"
              className="h-9 w-auto min-w-[10rem] rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={status ?? ""}
            >
              <option value="">Все</option>
              <option value="draft">Черновики</option>
              <option value="published">Опубликованные</option>
              <option value="archived">Архив</option>
            </select>
            <Button type="submit" variant="secondary" size="sm">
              Показать
            </Button>
          </form>
          <Link
            href="/app/doctor/lfk-templates/new"
            className={cn(buttonVariants(), "ml-auto")}
            id="doctor-lfk-templates-new-link"
          >
            Новый шаблон
          </Link>
        </div>

        {list.length === 0 ? (
          <p className="text-muted-foreground">Шаблонов пока нет.</p>
        ) : (
          <LfkTemplatesPageClient templates={list} />
        )}
      </div>
    </AppShell>
  );
}
