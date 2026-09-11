import { notFound } from 'next/navigation';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { requireEntitlementForReadAction } from '@/app-layer/guards/requireEntitlement';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { TestSetForm } from '../TestSetForm';
import { TEST_SETS_PATH } from '../paths';
import Link from 'next/link';
import { buttonVariants } from '@/shared/ui/doctor/primitives/button-variants';
import { cn } from '@/lib/utils';
import { clinicalTestLibraryRows } from '../clinicalTestLibraryRows';

type PageProps = { params: Promise<{ id: string }> };

export default async function EditTestSetPage({ params }: PageProps) {
  const workspace = await requireDoctorWorkspaceContext();
  const session = workspace.session;
  const { id } = await params;
  const deps = buildAppDeps();
  const includePlatformBase = (await requireEntitlementForReadAction(workspace, 'exercise_catalog'))
    .ok;
  const testSet = await deps.testSets.getTestSet(id);
  if (!testSet) notFound();
  const usage = await deps.testSets.getTestSetUsage(testSet.id);
  const clinicalTestsForPicker = await deps.clinicalTests.listClinicalTests({
    archiveScope: 'active',
    includePlatformBase,
  });
  const clinicalTestsLibrary = clinicalTestLibraryRows(clinicalTestsForPicker);

  return (
    <DoctorAppShell title="Набор тестов" user={session.user} backHref={TEST_SETS_PATH}>
      <div className="flex flex-col gap-8">
        <p className="text-sm text-muted-foreground">
          <Link
            href="/app/doctor/clinical-tests"
            className={cn(buttonVariants({ variant: 'link' }), 'h-auto p-0')}
          >
            Библиотека тестов
          </Link>
          {' — добавляйте тесты через кнопку «Добавить из библиотеки» в составе набора.'}
        </p>
        <TestSetForm
          testSet={testSet}
          externalUsageSnapshot={usage}
          clinicalTestsLibrary={clinicalTestsLibrary}
        />
      </div>
    </DoctorAppShell>
  );
}
