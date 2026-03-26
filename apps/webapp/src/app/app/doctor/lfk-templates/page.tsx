import Link from "next/link";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TemplateStatus } from "@/modules/lfk-templates/types";

type PageProps = {
  searchParams?: Promise<{ status?: string }>;
};

const STATUS_LABEL: Record<TemplateStatus, string> = {
  draft: "Черновик",
  published: "Опубликован",
  archived: "Архив",
};

export default async function DoctorLfkTemplatesPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const sp = (await searchParams) ?? {};
  const statusRaw = sp.status;
  const status: TemplateStatus | undefined =
    statusRaw === "draft" || statusRaw === "published" || statusRaw === "archived" ? statusRaw : undefined;

  const deps = buildAppDeps();
  const list = await deps.lfkTemplates.listTemplates({ status: status ?? null });

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
          <ul className="grid gap-3 sm:grid-cols-2">
            {list.map((t) => (
              <li key={t.id}>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle className="text-base">
                      <Link
                        href={`/app/doctor/lfk-templates/${t.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {t.title}
                      </Link>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                    <Badge variant="secondary">{STATUS_LABEL[t.status]}</Badge>
                    <span>Упражнений: {t.exerciseCount ?? t.exercises.length}</span>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
