import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { requireEntitlementForReadAction } from '@/app-layer/guards/requireEntitlement';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { TestSetForm } from '../TestSetForm';
import { TEST_SETS_PATH } from '../paths';
import { clinicalTestLibraryRows } from '../clinicalTestLibraryRows';

export default async function NewTestSetPage() {
  const workspace = await requireDoctorWorkspaceContext();
  const session = workspace.session;
  const deps = buildAppDeps();
  const includePlatformBase = (await requireEntitlementForReadAction(workspace, 'exercise_catalog'))
    .ok;
  const clinicalTestsForPicker = await deps.clinicalTests.listClinicalTests({
    archiveScope: 'active',
    includePlatformBase,
  });
  const clinicalTestsLibrary = clinicalTestLibraryRows(clinicalTestsForPicker);
  return (
    <DoctorAppShell title="Новый набор тестов" user={session.user} backHref={TEST_SETS_PATH}>
      <TestSetForm clinicalTestsLibrary={clinicalTestsLibrary} />
    </DoctorAppShell>
  );
}
