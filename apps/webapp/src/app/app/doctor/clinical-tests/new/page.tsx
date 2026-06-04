import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { ClinicalTestForm } from "../ClinicalTestForm";
import {
  CLINICAL_ASSESSMENT_KIND_CATEGORY_CODE,
  buildClinicalAssessmentKindSelectOptions,
} from "@/modules/tests/clinicalTestAssessmentKind";

export default async function NewClinicalTestPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const assessmentRefItems = await deps.references.listActiveItemsByCategoryCode(
    CLINICAL_ASSESSMENT_KIND_CATEGORY_CODE,
  );
  const assessmentKindSelectOptions = buildClinicalAssessmentKindSelectOptions(assessmentRefItems, null);
  return (
    <DoctorAppShell title="Новый тест" user={session.user} backHref="/app/doctor/clinical-tests">
      <ClinicalTestForm assessmentKindSelectOptions={assessmentKindSelectOptions} />
    </DoctorAppShell>
  );
}
