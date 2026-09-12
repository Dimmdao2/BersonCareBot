/**
 * /app/doctor/patients/[userId]/visits/[visitId] — полноценная страница правки приёма (P4.5).
 *
 * ENCOUNTERS-05: просмотр остаётся компактной модалкой (карта пациента); эта страница — только
 * создание/правка. Существующий приём остаётся редактируемым после его даты (ENCOUNTER-PAGE-04).
 */
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireWorkspaceModuleForPage } from '@/app-layer/guards/workspaceModuleAccess';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { EncounterPageClient } from '../EncounterPageClient';
import { PatientEncounterPageShell } from '../PatientEncounterPageShell';
import { loadDoctorWorkspaceShell } from '../../../../loadDoctorWorkspaceShell';
import { resolvePatientTerms } from '@/modules/system-settings/patientTerms';

type PageProps = {
  params: Promise<{ userId: string; visitId: string }>;
};

export default async function EditEncounterPage({ params }: PageProps) {
  const { userId, visitId } = await params;
  if (
    !z.string().uuid().safeParse(userId).success ||
    !z.string().uuid().safeParse(visitId).success
  ) {
    notFound();
  }

  const shell = await loadDoctorWorkspaceShell();
  requireWorkspaceModuleForPage(shell.workspaceModules.encounters);
  const workspace = shell.workspaceAccess;
  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    workspace.organizationId,
    workspace,
  );
  if (!identity) notFound();

  const visits = await withDoctorWorkspacePrincipal(workspace, () =>
    deps.patientClinical.listVisits(identity.userId),
  );
  const visit = visits.find((v) => v.id === visitId);
  if (!visit) notFound();

  // Третий аргумент передаётся явно: без него экран молча остался бы на «приёме»
  // у клиники, выбравшей другое слово (R2 аудита T-A).
  const terms = resolvePatientTerms(
    shell.patientLabel,
    shell.supportGroupLabel,
    shell.appointmentLabel,
  );

  return (
    <PatientEncounterPageShell
      userId={userId}
      title={terms.appointmentSingularLabel}
      workspaceModules={shell.workspaceModules}
    >
      <EncounterPageClient
        mode="edit"
        userId={identity.userId}
        patient={{
          displayName: identity.displayName,
          firstName: identity.firstName ?? null,
          lastName: identity.lastName ?? null,
          phone: identity.phone,
        }}
        boundAppointmentId={null}
        initialVisit={visit}
        medicalRecordEnabled={shell.workspaceModules.medical_record}
      />
    </PatientEncounterPageShell>
  );
}
