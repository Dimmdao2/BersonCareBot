import { Suspense } from "react";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import type { TemplateStatus } from "@/modules/lfk-templates/types";
import { LfkTemplatesPageClient } from "./LfkTemplatesPageClient";

type PageProps = {
  searchParams?: Promise<{ status?: string }>;
};

export default async function DoctorLfkTemplatesPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const sp = (await searchParams) ?? {};
  const statusRaw = typeof sp.status === "string" ? sp.status.trim() : "";
  const status: TemplateStatus | undefined =
    statusRaw === "draft" || statusRaw === "published" || statusRaw === "archived" ? statusRaw : undefined;

  const deps = buildAppDeps();
  const [list, exercises] = await Promise.all([
    deps.lfkTemplates.listTemplates({
      status: status ?? null,
      includeExerciseDetails: true,
    }),
    deps.lfkExercises.listExercises({ includeArchived: false }),
  ]);

  const exerciseCatalog = exercises.map((e) => ({
    id: e.id,
    title: e.title,
    firstMedia: e.media[0] ?? null,
  }));

  const initialStatusFilter: "" | TemplateStatus = status ?? "";

  return (
    <AppShell title="Шаблоны ЛФК" user={session.user} variant="doctor" backHref="/app/doctor">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Загрузка…</p>}>
        <LfkTemplatesPageClient
          templates={list}
          exerciseCatalog={exerciseCatalog}
          initialStatusFilter={initialStatusFilter}
        />
      </Suspense>
    </AppShell>
  );
}
