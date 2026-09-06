/**
 * /app/doctor/patients/[userId]/visits/[visitId] — полноценная страница правки приёма (P4.5).
 *
 * ENCOUNTERS-05: просмотр остаётся компактной модалкой (карта пациента); эта страница — только
 * создание/правка. Существующий приём остаётся редактируемым после его даты (ENCOUNTER-PAGE-04).
 */
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { patientCardHref } from '../../../patientCardHref';
import { EncounterPageClient } from '../EncounterPageClient';

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

  const workspace = await requireDoctorWorkspaceContext();
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

  return (
    <DoctorAppShell title="Приём" backHref={patientCardHref(userId, { tab: 'karta' })}>
      <EncounterPageClient
        mode="edit"
        userId={identity.userId}
        patient={{
          displayName: identity.displayName,
          firstName: identity.firstName ?? null,
          lastName: identity.lastName ?? null,
          phone: identity.phone,
        }}
        ownSpecialistId={workspace.specialistId}
        boundAppointmentId={null}
        initialVisit={visit}
      />
    </DoctorAppShell>
  );
}
