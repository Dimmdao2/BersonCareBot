import Link from "next/link";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import {
  LESSON_CONTENT_SECTION,
  LESSON_CONTENT_SECTION_LEGACY,
} from "@/modules/treatment-program/types";
import type { TreatmentProgramLibraryPickers } from "./[id]/TreatmentProgramConstructorClient";
import { TreatmentProgramTemplatesPageClient } from "./TreatmentProgramTemplatesPageClient";
import { TREATMENT_PROGRAM_TEMPLATES_PATH } from "./paths";

type PageProps = {
  searchParams?: Promise<{ selected?: string }>;
};

export default async function TreatmentProgramTemplatesPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();

  const [items, exercises, lfkTemplates, testSets, recommendations, contentPagesAll] = await Promise.all([
    deps.treatmentProgram.listTemplates({ includeArchived: false }),
    deps.lfkExercises.listExercises({ includeArchived: false }),
    deps.lfkTemplates.listTemplates({}),
    deps.testSets.listTestSets({ includeArchived: false }),
    deps.recommendations.listRecommendations({ includeArchived: false }),
    deps.contentPages.listAll(),
  ]);

  const library: TreatmentProgramLibraryPickers = {
    exercises: exercises.map((e) => ({ id: e.id, title: e.title })),
    lfkComplexes: lfkTemplates
      .filter((t) => t.status !== "archived")
      .map((t) => ({ id: t.id, title: t.title })),
    testSets: testSets.map((t) => ({ id: t.id, title: t.title })),
    recommendations: recommendations.map((r) => ({ id: r.id, title: r.title })),
    lessons: contentPagesAll
      .filter(
        (p) =>
          (p.section === LESSON_CONTENT_SECTION || p.section === LESSON_CONTENT_SECTION_LEGACY) &&
          !p.deletedAt,
      )
      .map((p) => ({ id: p.id, title: p.title })),
  };

  const sp = (await searchParams) ?? {};
  const raw = typeof sp.selected === "string" ? sp.selected.trim() : "";
  const initialSelectedId = raw && items.some((t) => t.id === raw) ? raw : null;

  return (
    <AppShell title="Шаблоны программ" user={session.user} variant="doctor" backHref="/app/doctor">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Конструктор этапов шаблона лечебной программы (таблицы{" "}
            <code className="text-xs">treatment_program_templates</code> и связанные).
          </p>
          <Link href={`${TREATMENT_PROGRAM_TEMPLATES_PATH}/new`} className={cn(buttonVariants())}>
            Новый шаблон
          </Link>
        </div>
        <TreatmentProgramTemplatesPageClient
          templates={items}
          library={library}
          initialSelectedId={initialSelectedId}
        />
      </div>
    </AppShell>
  );
}
