import { notFound } from "next/navigation";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import {
  LESSON_CONTENT_SECTION,
  LESSON_CONTENT_SECTION_LEGACY,
} from "@/modules/treatment-program/types";
import { TreatmentProgramConstructorClient } from "./TreatmentProgramConstructorClient";
import type { TreatmentProgramLibraryPickers } from "./TreatmentProgramConstructorClient";
import { TREATMENT_PROGRAM_TEMPLATES_PATH } from "../paths";

type PageProps = { params: Promise<{ id: string }> };

export default async function TreatmentProgramTemplateEditorPage(props: PageProps) {
  const session = await requireDoctorAccess();
  const { id } = await props.params;
  const deps = buildAppDeps();

  let detail;
  try {
    detail = await deps.treatmentProgram.getTemplate(id);
  } catch {
    notFound();
  }

  const [exercises, lfkTemplates, testSets, recommendations, contentPagesAll] = await Promise.all([
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

  return (
    <AppShell
      title={detail.title}
      user={session.user}
      variant="doctor"
      backHref={TREATMENT_PROGRAM_TEMPLATES_PATH}
    >
      <TreatmentProgramConstructorClient templateId={id} initialDetail={detail} library={library} />
    </AppShell>
  );
}
