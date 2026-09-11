import { notFound } from 'next/navigation';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { requireEntitlementForReadAction } from '@/app-layer/guards/requireEntitlement';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { ClinicalTestForm } from '../ClinicalTestForm';
import { CLINICAL_TESTS_PATH } from '../paths';
import {
  CLINICAL_ASSESSMENT_KIND_CATEGORY_CODE,
  buildClinicalAssessmentKindSelectOptions,
} from '@/modules/tests/clinicalTestAssessmentKind';

type PageProps = { params: Promise<{ id: string }> };

export default async function EditClinicalTestPage({ params }: PageProps) {
  const workspace = await requireDoctorWorkspaceContext();
  const session = workspace.session;
  const { id } = await params;
  const deps = buildAppDeps();
  const includePlatformBase = (await requireEntitlementForReadAction(workspace, 'exercise_catalog'))
    .ok;
  const test = await deps.clinicalTests.getClinicalTest(id, { includePlatformBase });
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
    <DoctorAppShell title="Редактирование теста" user={session.user} backHref={CLINICAL_TESTS_PATH}>
      <ClinicalTestForm
        test={test}
        externalUsageSnapshot={usage}
        assessmentKindSelectOptions={assessmentKindSelectOptions}
      />
    </DoctorAppShell>
  );
}
