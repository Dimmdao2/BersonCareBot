/**
 * Дневник пациента (MVP): недельный график самочувствия (ComposedChart).
 *
 * Недельный dashboard остаётся основной композицией. Ниже него показываются только назначенные
 * симптомы: одна модалка записи текущей интенсивности и истории. Вкладки ЛФК и QuickAdd не восстановлены.
 */
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  getOptionalPatientSession,
  patientRscPersonalDataGate,
} from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { PATIENT_DIARY_UI_LABEL } from '@/app-layer/routes/navigation';
import { PatientPlanTodayRemindersCard } from '@/app/app/patient/treatment/program-detail/PatientPlanTodayRemindersCard';
import { DiarySectionGuestAccess } from '@/shared/ui/patient/guestAccess';
import { PatientAppShell } from '@/shared/ui/patient/PatientAppShell';
import { AppContentLoading } from '@/shared/ui/AppContentLoading';
import { buildDiaryPlanReminderStrip } from '@/modules/patient-diary/buildDiaryPlanReminderStrip';
import { resolvePatientCanViewAuthOnlyContent } from '@/app-layer/platform-access';
import { PatientDiaryAuthenticatedMain } from './PatientDiaryAuthenticatedMain';
import { runWithWebappDbOperationFamily } from '@/infra/db/saasIsolationOperationContext';
import { resolvePatientEnrollmentOrganizationId } from '@/app/api/booking/bookingTenant';
import { resolveOrganizationWorkspaceModules } from '@/app-layer/guards/workspaceModuleAccess';
import { withPatientOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';

type PageProps = {
  searchParams?: Promise<{ week?: string | string[] }>;
};

export default async function PatientDiaryPage({ searchParams }: PageProps) {
  const session = await getOptionalPatientSession();
  const dataGate = await patientRscPersonalDataGate(session, routePaths.diary);
  if (dataGate === 'guest') {
    return (
      <PatientAppShell
        title={PATIENT_DIARY_UI_LABEL}
        user={session?.user ?? null}
        backHref="/app/patient"
        backLabel="Меню"
      >
        <DiarySectionGuestAccess session={session} returnTo={routePaths.diary} />
      </PatientAppShell>
    );
  }
  const s = session!;
  const sp = searchParams != null ? await searchParams : {};
  const weekRaw = sp.week;
  const week = Array.isArray(weekRaw) ? weekRaw[0] : weekRaw;
  const canViewAuthOnlyContent = await resolvePatientCanViewAuthOnlyContent(s);
  const deps = buildAppDeps();
  const patientOrganization = await resolvePatientEnrollmentOrganizationId(deps, s.user.userId);
  if (!patientOrganization.ok) notFound();
  const workspaceModules = await withPatientOrganizationPrincipal(
    {
      organizationId: patientOrganization.organizationId,
      platformUserId: s.user.userId,
      source: 'app.patient.diary.workspace-modules',
    },
    () => resolveOrganizationWorkspaceModules(deps, patientOrganization.organizationId),
  );
  const planReminderStrip = workspaceModules.rehabilitation
    ? await runWithWebappDbOperationFamily('patient_diary', () =>
        buildDiaryPlanReminderStrip(deps, s.user.userId, canViewAuthOnlyContent),
      )
    : null;

  return (
    <PatientAppShell
      title={PATIENT_DIARY_UI_LABEL}
      user={s.user}
      backHref="/app/patient"
      backLabel="Меню"
      patientShellAboveTitleSlot={
        planReminderStrip ? <PatientPlanTodayRemindersCard {...planReminderStrip} /> : null
      }
    >
      <Suspense fallback={<AppContentLoading className="py-10" />}>
        <PatientDiaryAuthenticatedMain
          userId={s.user.userId}
          organizationId={patientOrganization.organizationId}
          rehabilitationEnabled={workspaceModules.rehabilitation}
          week={week}
        />
      </Suspense>
    </PatientAppShell>
  );
}
