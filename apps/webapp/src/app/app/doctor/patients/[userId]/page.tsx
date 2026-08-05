/**
 * /app/doctor/patients/[userId] — карточка пациента.
 * Pattern: requireDoctorAccess → tab-aware server bootstrap → PatientCardClient.
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { buttonVariants } from '@/shared/ui/doctor/primitives/button-variants';
import { doctorPageStackClass } from '@/shared/ui/doctor/doctorVisual';
import { cn } from '@/lib/utils';
import { PatientCardClient } from './PatientCardClient';
import { sanitizePatientListReturnHref } from '../patientListWorkspaceState';
import {
  loadDoctorPatientCardPageBootstrap,
  resolvePatientCardTab,
} from '../loadDoctorPatientCardPageBootstrap';

type PageProps = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DoctorPatientCardPage({ params, searchParams }: PageProps) {
  const { userId } = await params;
  const sp = await searchParams;

  if (!z.string().uuid().safeParse(userId).success) {
    notFound();
  }

  const workspace = await requireDoctorWorkspaceContext();
  const session = workspace.session;
  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    workspace.organizationId,
  );
  if (!identity) {
    notFound();
  }

  const activeTab = resolvePatientCardTab(typeof sp.tab === 'string' ? sp.tab : undefined);
  const bootstrap = await loadDoctorPatientCardPageBootstrap(
    deps,
    workspace,
    identity.userId,
    activeTab,
  );

  const createVisitFrom = typeof sp.createVisitFrom === 'string' ? sp.createVisitFrom : undefined;
  const visitDate = typeof sp.visitDate === 'string' ? sp.visitDate : undefined;
  const patientListHref = sanitizePatientListReturnHref(sp.returnTo);

  return (
    <DoctorAppShell title="Карточка пациента" user={session.user} backHref={patientListHref}>
      <DoctorPageHeader
        id="doctor-patient-card-header"
        title="Карточка пациента"
        tabs={
          <Link
            href={patientListHref}
            className={cn(
              buttonVariants({ size: 'sm', variant: 'outline' }),
              'h-8 rounded-[var(--doctor-control-radius,24px)] px-3',
            )}
          >
            К клиентам
          </Link>
        }
      />
      <section className={doctorPageStackClass}>
        <PatientCardClient
          cardHeader={bootstrap.cardHeader}
          initialTab={activeTab}
          createVisitFrom={createVisitFrom}
          visitDate={visitDate}
          initialClinicalState={bootstrap.initialClinicalState}
          initialVisits={bootstrap.initialVisits}
          initialNotes={bootstrap.initialNotes}
          initialTasks={bootstrap.initialTasks}
          specialistTasksAvailable={bootstrap.specialistTasksAvailable}
          specialistTasksReadable={bootstrap.specialistTasksReadable}
          initialProgramActivity={bootstrap.initialProgramActivity}
          initialAppointments={bootstrap.initialAppointments}
          initialProgramInstances={bootstrap.initialProgramInstances}
          initialFiles={bootstrap.initialFiles}
          initialAnamnesis={bootstrap.initialAnamnesis}
          initialComorbidities={bootstrap.initialComorbidities}
          initialFinancesData={bootstrap.initialFinancesData}
          initialSupplementaryContacts={bootstrap.initialSupplementaryContacts}
          initialPackages={bootstrap.initialPackages}
          membershipsVisible={bootstrap.membershipsVisible}
          membershipMutationsAllowed={bootstrap.membershipMutationAllowed}
          initialPaymentsSummary={bootstrap.initialPaymentsSummary}
          initialSupportEffectivePolicy={bootstrap.initialSupportEffectivePolicy}
          initialPortalState={bootstrap.initialPortalState ?? undefined}
          initialExerciseCalendarDays={bootstrap.initialExerciseCalendarDays}
          initialMessagesSnapshot={bootstrap.initialMessagesSnapshot}
          initialProgramInstanceDetail={bootstrap.initialProgramInstanceDetail}
          isAdmin={session.user.role === 'admin'}
        />
      </section>
    </DoctorAppShell>
  );
}
