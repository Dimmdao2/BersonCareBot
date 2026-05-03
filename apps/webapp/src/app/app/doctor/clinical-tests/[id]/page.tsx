import { notFound } from "next/navigation";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { ClinicalTestForm } from "../ClinicalTestForm";
import { CLINICAL_TESTS_PATH } from "../paths";
import {
  CLINICAL_ASSESSMENT_KIND_CATEGORY_CODE,
  buildClinicalAssessmentKindSelectOptions,
} from "@/modules/tests/clinicalTestAssessmentKind";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditClinicalTestPage({ params }: PageProps) {
  const session = await requireDoctorAccess();
  const { id } = await params;
  const deps = buildAppDeps();
  const test = await deps.clinicalTests.getClinicalTest(id);
  if (!test) notFound();
  const usage = await deps.clinicalTests.getClinicalTestUsage(test.id);
  const assessmentRefItems = await deps.references.listActiveItemsByCategoryCode(
    CLINICAL_ASSESSMENT_KIND_CATEGORY_CODE,
  );
  const assessmentKindSelectOptions = buildClinicalAssessmentKindSelectOptions(
    assessmentRefItems,
    test.assessmentKind,
  );

  return (
    <AppShell title="Редактирование теста" user={session.user} variant="doctor" backHref={CLINICAL_TESTS_PATH}>
      <ClinicalTestForm test={test} externalUsageSnapshot={usage} assessmentKindSelectOptions={assessmentKindSelectOptions} />
    </AppShell>
  );
}
