/**
 * /app/doctor/patients/[userId]/visits/new — полноценная страница нового приёма (P4.5).
 *
 * Query:
 *   appointmentId — canonical appointment id, если страница открыта из деталей записи
 *                    (ENCOUNTER-APPOINTMENT-01: связь задана заранее, повторно не выбирается).
 */
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireWorkspaceModuleForPage } from '@/app-layer/guards/workspaceModuleAccess';
import { EncounterPageClient } from '../EncounterPageClient';
import { PatientEncounterPageShell } from '../PatientEncounterPageShell';
import { loadDoctorWorkspaceShell } from '../../../../loadDoctorWorkspaceShell';

type PageProps = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewEncounterPage({ params, searchParams }: PageProps) {
  const { userId } = await params;
  const sp = await searchParams;
  if (!z.string().uuid().safeParse(userId).success) notFound();

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

  const appointmentIdRaw = typeof sp.appointmentId === 'string' ? sp.appointmentId : undefined;
  const appointmentId =
    appointmentIdRaw && z.string().uuid().safeParse(appointmentIdRaw).success
      ? appointmentIdRaw
      : undefined;

  return (
    <PatientEncounterPageShell
      userId={userId}
      title="Новый приём"
      workspaceModules={shell.workspaceModules}
    >
      <EncounterPageClient
        mode="create"
        userId={identity.userId}
        patient={{
          displayName: identity.displayName,
          firstName: identity.firstName ?? null,
          lastName: identity.lastName ?? null,
          phone: identity.phone,
        }}
        boundAppointmentId={appointmentId ?? null}
      />
    </PatientEncounterPageShell>
  );
}
