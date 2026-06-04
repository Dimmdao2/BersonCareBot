import { notFound } from "next/navigation";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { TreatmentProgramConstructorClient } from "./TreatmentProgramConstructorClient";
import { buildTreatmentProgramLibraryPickers } from "../buildTreatmentProgramLibraryPickers";
import { TREATMENT_PROGRAM_TEMPLATES_PATH } from "../paths";

type PageProps = { params: Promise<{ id: string }> };

export default async function TreatmentProgramTemplateEditorPage(props: PageProps) {
  const session = await requireDoctorAccess();
  const { id } = await props.params;
  const deps = buildAppDeps();

  let detail;
  let usage;
  try {
    [detail, usage] = await Promise.all([
      deps.treatmentProgram.getTemplate(id),
      deps.treatmentProgram.getTreatmentProgramTemplateUsage(id),
    ]);
  } catch {
    notFound();
  }

  const [exercises, lfkTemplates, testSets, clinicalTests, recommendations, contentPagesAll, bodyRegionItems] =
    await Promise.all([
      deps.lfkExercises.listExercises({ includeArchived: false }),
      deps.lfkTemplates.listTemplates({ statusIn: ["draft", "published"], includeExerciseDetails: true }),
      deps.testSets.listTestSets({ includeArchived: false }),
      deps.clinicalTests.listClinicalTests({ archiveScope: "active" }),
      deps.recommendations.listRecommendations({ includeArchived: false }),
      deps.contentPages.listAll(),
      deps.references.listActiveItemsByCategoryCode("body_region"),
    ]);

  const bodyRegionIdToCode = Object.fromEntries(bodyRegionItems.map((it) => [it.id, it.code]));

  const library = buildTreatmentProgramLibraryPickers({
    exercises,
    lfkTemplates,
    testSets,
    clinicalTests,
    recommendations,
    contentPagesAll,
    bodyRegionIdToCode,
  });

  return (
    <DoctorAppShell
      title={detail.title}
      user={session.user}
     
      backHref={TREATMENT_PROGRAM_TEMPLATES_PATH}
    >
      <TreatmentProgramConstructorClient
        templateId={id}
        initialDetail={detail}
        library={library}
        externalUsageSnapshot={usage}
      />
    </DoctorAppShell>
  );
}
