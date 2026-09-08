import { notFound } from 'next/navigation';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireWorkspaceModuleForPage } from '@/app-layer/guards/workspaceModuleAccess';
import { loadDoctorWorkspaceShell } from '../../../loadDoctorWorkspaceShell';
import { DoctorLiveMeetingClient } from './DoctorLiveMeetingClient';
import { PatientEncounterPageShell } from '../visits/PatientEncounterPageShell';

export default async function DoctorLiveMeetingPage({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<{ appointmentId?: string }> }) {
  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) notFound();
  const shell = await loadDoctorWorkspaceShell();
  requireWorkspaceModuleForPage(shell.workspaceModules.video_meetings);
  const identity = await buildAppDeps().doctorClientsPort.getClientIdentityForOrganization(userId, shell.workspaceAccess.organizationId, shell.workspaceAccess);
  if (!identity) notFound();
  const appointmentId = (await searchParams).appointmentId;
  return (
    <PatientEncounterPageShell userId={userId} title="Видеовстреча" workspaceModules={shell.workspaceModules}>
      <DoctorLiveMeetingClient
        userId={userId}
        appointmentId={z.string().uuid().safeParse(appointmentId).success ? appointmentId! : null}
        patient={{
          displayName: identity.displayName,
          firstName: identity.firstName ?? null,
          lastName: identity.lastName ?? null,
          phone: identity.phone,
        }}
        encountersEnabled={shell.workspaceModules.encounters}
        medicalRecordEnabled={shell.workspaceModules.medical_record}
      />
    </PatientEncounterPageShell>
  );
}
